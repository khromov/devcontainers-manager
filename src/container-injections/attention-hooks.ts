import { execInContainer } from '../lib/exec.server.ts';
import type { ContainerTarget, Injection } from '../lib/injections.server.ts';

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
async function injectClaudeHooks(
  target: ContainerTarget,
  settingsJson: string,
): Promise<{ ok: boolean; error?: string }> {
  const script =
    'h=$(eval echo ~$(id -un)); d="${CLAUDE_CONFIG_DIR:-$h/.claude}"; mkdir -p "$d"; ' +
    'f="$d/settings.json"; new=$(cat); ' +
    'if command -v jq >/dev/null 2>&1 && [ -s "$f" ] && ' +
    'merged=$(printf \'%s\' "$new" | jq -s \'.[0] * .[1]\' "$f" - 2>/dev/null); then ' +
    'printf \'%s\' "$merged" > "$f"; else printf \'%s\' "$new" > "$f"; fi; ' +
    'chmod 644 "$f"';
  const res = await execInContainer(target, { script, stdin: settingsJson });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

/**
 * Install the Claude attention hooks so the in-container Claude pings the manager
 * when it finishes a task or needs input, pulsing this instance's IDE tab. Always
 * applied — it has no host dependency, only the instance id + bridge token.
 */
export const attentionHooks: Injection = {
  id: 'attention-hooks',
  label: 'Claude hooks',

  async apply(target, log) {
    log('Injecting Claude attention hooks…\n');
    const settings = attentionHookSettings(target.instance.id, target.instance.bridge_token);
    const hooks = await injectClaudeHooks(target, settings);
    log(
      hooks.ok
        ? '✓ Claude attention hooks installed\n'
        : `⚠ Claude hook injection failed: ${hooks.error}\n`,
    );
  },

  async check(target) {
    // Hooks are present when settings.json exists and mentions this instance id.
    const res = await execInContainer(target, {
      capture: true,
      args: ['attention-check', target.instance.id],
      script:
        'h=$(eval echo ~$(id -un)); d="${CLAUDE_CONFIG_DIR:-$h/.claude}"; ' +
        '[ -s "$d/settings.json" ] && grep -q "$1" "$d/settings.json" && echo 1 || echo 0',
    });
    return res.ok && res.stdout === '1';
  },
};
