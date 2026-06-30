import Docker from 'dockerode';
import { DOCKER_HOST, dockerEnv } from './config.server.ts';

/**
 * Shared dockerode client. Every Docker Engine operation goes through `getDocker()`
 * so they all target the same daemon. The instance is pinned to `globalThis` (like the
 * hub, log registry, and db handle) so dev-mode hot reload doesn't reopen connections.
 *
 * dockerode honors `DOCKER_HOST` but — unlike the `docker` CLI — does NOT read the
 * active `docker context`. The `@devcontainers/cli` we shell out to *does* use the
 * context, so to connect to the same daemon we resolve the socket once at startup:
 *   1. `DOCKER_HOST` if set (parsed into dockerode opts),
 *   2. otherwise a one-time `docker context inspect` to read the active context's host,
 *   3. otherwise the default `/var/run/docker.sock`.
 * This single `docker context inspect` is the only place we still spawn the CLI, and it
 * exists purely for connection discovery — never for an actual Docker operation.
 */

const g = globalThis as unknown as { __dcmDocker?: Promise<Docker> };

export function getDocker(): Promise<Docker> {
  return (g.__dcmDocker ??= resolveDocker());
}

async function resolveDocker(): Promise<Docker> {
  const host = DOCKER_HOST || (await dockerContextHost()) || '';
  return new Docker(host ? parseDockerHost(host) : { socketPath: '/var/run/docker.sock' });
}

/** Read the active Docker context's daemon host via the CLI, once. `''` on any failure. */
async function dockerContextHost(): Promise<string> {
  try {
    const proc = Bun.spawn(
      ['docker', 'context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
      { stdout: 'pipe', stderr: 'ignore', env: dockerEnv() },
    );
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    return code === 0 ? out.trim() : '';
  } catch {
    return '';
  }
}

/**
 * Parse a `DOCKER_HOST`-style daemon URL into dockerode connection options.
 *   `unix:///path/to.sock`  → { socketPath: '/path/to.sock' }
 *   `tcp://host:port`       → { host, port, protocol }
 * (Windows `npipe://` is not supported here — this app runs on macOS/Linux.)
 */
export function parseDockerHost(host: string): Docker.DockerOptions {
  if (host.startsWith('unix://')) {
    return { socketPath: host.slice('unix://'.length) };
  }
  const tls = (process.env.DOCKER_TLS_VERIFY ?? '') !== '';
  const url = new URL(host.includes('://') ? host : `tcp://${host}`);
  return {
    host: url.hostname,
    port: url.port ? Number.parseInt(url.port, 10) : tls ? 2376 : 2375,
    protocol: tls ? 'https' : 'http',
  };
}
