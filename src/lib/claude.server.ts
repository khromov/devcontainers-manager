import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CLAUDE_CODE_TOKEN } from './config.server.ts';

const KEYCHAIN_SERVICE = 'Claude Code-credentials';

function isValid(json: string): boolean {
  try {
    const data = JSON.parse(json) as { claudeAiOauth?: { accessToken?: string } };
    return Boolean(data.claudeAiOauth?.accessToken);
  } catch {
    return false;
  }
}

/**
 * Locate the host's Claude Code OAuth credentials, returning both the JSON string
 * and a human-readable description of where it came from, or null if absent.
 * macOS keeps them in the login Keychain; Linux/others use ~/.claude/.credentials.json.
 */
async function locateClaudeCredentials(): Promise<{ creds: string; source: string } | null> {
  // An explicit token override wins over any host discovery.
  if (CLAUDE_CODE_TOKEN) {
    const creds = JSON.stringify({ claudeAiOauth: { accessToken: CLAUDE_CODE_TOKEN } });
    return { creds, source: 'DCM_CLAUDE_CODE_TOKEN env var' };
  }

  if (process.platform === 'darwin') {
    try {
      const proc = Bun.spawn(
        ['security', 'find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'],
        { stdout: 'pipe', stderr: 'ignore' },
      );
      const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
      const trimmed = out.trim();
      if (code === 0 && trimmed && isValid(trimmed)) {
        return { creds: trimmed, source: `macOS Keychain — "${KEYCHAIN_SERVICE}"` };
      }
    } catch {
      /* fall through to the file check */
    }
  }

  const file = join(homedir(), '.claude', '.credentials.json');
  if (existsSync(file)) {
    const raw = (await readFile(file, 'utf8')).trim();
    if (isValid(raw)) return { creds: raw, source: '~/.claude/.credentials.json' };
  }
  return null;
}

/** Read the host's Claude Code OAuth credentials as a JSON string, or null if absent. */
export async function readClaudeCredentials(): Promise<string | null> {
  return (await locateClaudeCredentials())?.creds ?? null;
}

/**
 * Whether host Claude Code credentials are available to inject into containers,
 * plus where they were found (for display). `source` is null when unavailable.
 */
export async function claudeAuthStatus(): Promise<{ available: boolean; source: string | null }> {
  const found = await locateClaudeCredentials();
  return { available: found !== null, source: found?.source ?? null };
}

/**
 * Authorize Claude Code inside a running container as its remote user. Writes the
 * credentials (via stdin, never argv) plus a `hasCompletedOnboarding` flag — the
 * latter is what stops `claude` re-running its first-run setup/login wizard.
 *
 * Both paths honor the container's CLAUDE_CONFIG_DIR: credentials at
 * $CLAUDE_CONFIG_DIR/.credentials.json (default ~/.claude/.credentials.json) and
 * config at $CLAUDE_CONFIG_DIR/.claude.json (default ~/.claude.json).
 */
export async function injectClaudeCredentials(
  containerId: string,
  remoteUser: string | undefined,
  creds: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = remoteUser?.trim() || 'root';
  const script =
    'h=$(eval echo ~$(id -un)); d="${CLAUDE_CONFIG_DIR:-$h/.claude}"; mkdir -p "$d"; ' +
    'cat > "$d/.credentials.json"; chmod 600 "$d/.credentials.json"; ' +
    'cfg="${CLAUDE_CONFIG_DIR:+$CLAUDE_CONFIG_DIR/.claude.json}"; cfg="${cfg:-$h/.claude.json}"; ' +
    'printf \'%s\' \'{"hasCompletedOnboarding":true}\' > "$cfg"; chmod 644 "$cfg"';
  try {
    const proc = Bun.spawn(['docker', 'exec', '-i', '-u', user, containerId, 'bash', '-lc', script], {
      stdin: 'pipe',
      stdout: 'ignore',
      stderr: 'pipe',
    });
    proc.stdin.write(creds);
    await proc.stdin.end();
    const [err, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
    return code === 0 ? { ok: true } : { ok: false, error: err.trim() || `exit ${code}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
