import { triggerReconcile } from './instances.server.ts';

/**
 * Ephemeral "attention" signal each container can raise via the bridge: Claude
 * finished a task (`done`) or is waiting on the user (`waiting`). It's UI-only
 * state — kept in memory, never persisted — surfaced on the instance list and
 * cleared when the user looks at the tab or Claude resumes work.
 */
export type AttentionState = 'done' | 'waiting';

// Pin to globalThis so dev-mode hot reload doesn't drop pending signals.
const globalForAttention = globalThis as unknown as { __dcmAttention?: Map<string, AttentionState> };
const attention: Map<string, AttentionState> = (globalForAttention.__dcmAttention ??= new Map());

export function getAttention(id: string): AttentionState | null {
  return attention.get(id) ?? null;
}

export function setAttention(id: string, state: AttentionState): void {
  if (attention.get(id) === state) return;
  attention.set(id, state);
  triggerReconcile();
}

export function clearAttention(id: string): void {
  if (!attention.delete(id)) return;
  triggerReconcile();
}

/** Bridge URL a container reaches the manager on (Colima/Docker host-gateway). */
function bridgeUrl(): string {
  const port = Number(process.env.PORT) || 3333;
  return `http://host.docker.internal:${port}/api/bridge/attention`;
}

/** One `type: command` hook firing curl at the bridge with the given state. */
function hookFor(id: string, token: string, state: 'done' | 'waiting' | 'busy') {
  const url =
    `${bridgeUrl()}?id=${encodeURIComponent(id)}` +
    `&token=${encodeURIComponent(token)}&state=${state}`;
  return [
    {
      hooks: [
        {
          type: 'command',
          command: `curl -fsS -m 5 -X POST '${url}' >/dev/null 2>&1 || true`,
        },
      ],
    },
  ];
}

/**
 * The Claude `settings.json` (as a JSON string) injected into a container so its
 * Claude reports task completion / waiting back to the manager. `Stop` → green,
 * `Notification` (needs input/permission) → amber, `UserPromptSubmit` (resumed) → clear.
 */
export function attentionHookSettings(id: string, token: string): string {
  const settings = {
    hooks: {
      Stop: hookFor(id, token, 'done'),
      Notification: hookFor(id, token, 'waiting'),
      UserPromptSubmit: hookFor(id, token, 'busy'),
    },
  };
  return JSON.stringify(settings, null, 2);
}

/**
 * Merge the attention hooks into a running container's Claude config dir. Pipes the
 * JSON over stdin (never argv) and deep-merges it into any existing
 * `$CLAUDE_CONFIG_DIR/settings.json` (default ~/.claude/settings.json) with `jq`, so
 * a config the image already ships (e.g. a `statusLine`) is preserved — our hooks win
 * only on key conflicts. Falls back to writing our JSON outright when there's no
 * existing file, no `jq`, or the existing file isn't valid JSON.
 */
export async function injectClaudeHooks(
  containerId: string,
  remoteUser: string | undefined,
  settingsJson: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = remoteUser?.trim() || 'root';
  const script =
    'h=$(eval echo ~$(id -un)); d="${CLAUDE_CONFIG_DIR:-$h/.claude}"; mkdir -p "$d"; ' +
    'f="$d/settings.json"; new=$(cat); ' +
    'if command -v jq >/dev/null 2>&1 && [ -s "$f" ] && ' +
    'merged=$(printf \'%s\' "$new" | jq -s \'.[0] * .[1]\' "$f" - 2>/dev/null); then ' +
    'printf \'%s\' "$merged" > "$f"; else printf \'%s\' "$new" > "$f"; fi; ' +
    'chmod 644 "$f"';
  try {
    const proc = Bun.spawn(['docker', 'exec', '-i', '-u', user, containerId, 'bash', '-lc', script], {
      stdin: 'pipe',
      stdout: 'ignore',
      stderr: 'pipe',
    });
    proc.stdin.write(settingsJson);
    await proc.stdin.end();
    const [err, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
    return code === 0 ? { ok: true } : { ok: false, error: err.trim() || `exit ${code}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
