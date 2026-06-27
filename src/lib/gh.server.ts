import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const GH_HOST = 'github.com';

/** The host's GitHub CLI auth, ready to stage inside a container. */
export interface GhCredentials {
  token: string;
  /** GitHub login, when cheaply readable from the host's hosts.yml. */
  user?: string;
  /** Preferred git protocol (`https`/`ssh`), defaults to https when unknown. */
  gitProtocol?: string;
}

/**
 * Read the host's GitHub token via the `gh` binary, which transparently spans
 * its storage backends (macOS Keychain, encrypted file, or GH_TOKEN). Returns
 * the trimmed token, or null when gh is absent or not logged in.
 */
async function readGhToken(): Promise<string | null> {
  try {
    const proc = Bun.spawn(['gh', 'auth', 'token', '--hostname', GH_HOST], {
      stdout: 'pipe',
      stderr: 'ignore',
    });
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    const token = out.trim();
    return code === 0 && token ? token : null;
  } catch {
    // gh not installed on host.
    return null;
  }
}

/**
 * Best-effort read of `user`/`git_protocol` from the host's gh config so we can
 * populate them in the container's hosts.yml. The token lives in the keychain,
 * not this file, so a lightweight line parse is enough — no YAML dependency.
 */
async function readGhHostMeta(): Promise<{ user?: string; gitProtocol?: string }> {
  const file = join(homedir(), '.config', 'gh', 'hosts.yml');
  if (!existsSync(file)) return {};
  try {
    const raw = await readFile(file, 'utf8');
    const user = raw.match(/^\s+user:\s*(\S+)/m)?.[1];
    const gitProtocol = raw.match(/^\s+git_protocol:\s*(\S+)/m)?.[1];
    return { user, gitProtocol };
  } catch {
    return {};
  }
}

/**
 * Whether host GitHub CLI credentials are available to inject into containers,
 * plus where they came from (for display). `source` is null when unavailable.
 */
export async function ghAuthStatus(): Promise<{ available: boolean; source: string | null }> {
  const token = await readGhToken();
  return token
    ? { available: true, source: `GitHub CLI — ${GH_HOST}` }
    : { available: false, source: null };
}

/** Read the host's GitHub CLI credentials for injection, or null if absent. */
export async function readGhCredentials(): Promise<GhCredentials | null> {
  const token = await readGhToken();
  if (!token) return null;
  const { user, gitProtocol } = await readGhHostMeta();
  return { token, user, gitProtocol };
}

/**
 * Authorize the GitHub CLI inside a running container as its remote user. Writes
 * `~/.config/gh/hosts.yml` (token via stdin, never argv) so `gh` is signed in,
 * then runs `gh auth setup-git` when the binary exists so `git push`/`pull` over
 * HTTPS is authenticated too. If gh isn't installed yet, the staged hosts.yml
 * still authorizes gh once it is.
 */
export async function injectGhCredentials(
  containerId: string,
  remoteUser: string | undefined,
  creds: GhCredentials,
): Promise<{ ok: boolean; error?: string }> {
  const user = remoteUser?.trim() || 'root';
  const protocol = creds.gitProtocol || 'https';
  // The hosts.yml header (everything but the token) is non-secret, so build it in
  // JS and pass it via printf; only the token is piped in over stdin.
  const header =
    `${GH_HOST}:\n    git_protocol: ${protocol}\n` +
    (creds.user ? `    user: ${creds.user}\n` : '');
  const script =
    'set -e; d=~/.config/gh; mkdir -p "$d"; tok=$(cat); ' +
    `{ printf '%s' "$1"; printf '    oauth_token: %s\\n' "$tok"; } > "$d/hosts.yml"; ` +
    'chmod 600 "$d/hosts.yml"; ' +
    `command -v gh >/dev/null 2>&1 && gh auth setup-git --hostname ${GH_HOST} 2>/dev/null || true`;
  try {
    const proc = Bun.spawn(
      ['docker', 'exec', '-i', '-u', user, containerId, 'bash', '-lc', script, 'gh-inject', header],
      { stdin: 'pipe', stdout: 'ignore', stderr: 'pipe' },
    );
    proc.stdin.write(creds.token);
    await proc.stdin.end();
    const [err, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
    return code === 0 ? { ok: true } : { ok: false, error: err.trim() || `exit ${code}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
