import { execInContainer } from '../lib/exec.server.ts';
import type { ContainerTarget, Injection } from '../lib/injections.server.ts';

/**
 * Install the GitHub CLI (`gh`) binary inside a freshly-provisioned container.
 * The default devcontainer image doesn't ship `gh`, so `gh: command not found` —
 * this adds GitHub's official apt repo and installs from it (puts `gh` in
 * `/usr/bin`, always on PATH). The companion `github-credentials` injection then
 * authorizes it; this must run first so its `gh auth setup-git` step can find the
 * binary.
 *
 * Elevates with `sudo` when the container user isn't root (devcontainer images
 * give the non-root user passwordless sudo). No-ops when `gh` is already present,
 * so images that bundle it pay nothing.
 */
async function installGh(target: ContainerTarget): Promise<{ ok: boolean; error?: string }> {
  const script =
    'set -e; command -v gh >/dev/null 2>&1 && exit 0; ' +
    'if [ "$(id -u)" = 0 ]; then SUDO=; ' +
    'elif command -v sudo >/dev/null 2>&1; then SUDO=sudo; ' +
    'else echo "gh install needs root and sudo is unavailable" >&2; exit 1; fi; ' +
    'export DEBIAN_FRONTEND=noninteractive; ' +
    '$SUDO apt-get update -qq; ' +
    '$SUDO apt-get install -y -qq wget ca-certificates; ' +
    '$SUDO mkdir -p -m 755 /etc/apt/keyrings; ' +
    'wget -nv -O- https://cli.github.com/packages/githubcli-archive-keyring.gpg ' +
    '| $SUDO tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null; ' +
    '$SUDO chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg; ' +
    'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] ' +
    'https://cli.github.com/packages stable main" ' +
    '| $SUDO tee /etc/apt/sources.list.d/github-cli.list >/dev/null; ' +
    '$SUDO apt-get update -qq; ' +
    '$SUDO apt-get install -y -qq gh';
  const res = await execInContainer(target, { script });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

/**
 * Install the GitHub CLI binary so `gh` works inside the container. Has no host
 * dependency (it pulls from GitHub's apt repo), so it always runs; ordered ahead
 * of `github-credentials` so that injection's `gh auth setup-git` finds `gh`.
 */
export const ghCli: Injection = {
  id: 'gh-cli',
  label: 'gh CLI',

  async apply(target, log) {
    log('Installing GitHub CLI (gh)…\n');
    const installed = await installGh(target);
    log(
      installed.ok
        ? '✓ GitHub CLI (gh) installed\n'
        : `⚠ gh install failed: ${installed.error}\n`,
    );
  },

  async check(target) {
    const res = await execInContainer(target, {
      capture: true,
      script: 'command -v gh >/dev/null 2>&1 && echo 1 || echo 0',
    });
    return res.ok && res.stdout === '1';
  },
};
