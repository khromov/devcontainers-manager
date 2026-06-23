/** Run a command to completion, capturing stdout/stderr and the exit code. */
async function run(cmd: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim() };
}

/** True if the Docker CLI is installed and the daemon is reachable. */
export async function dockerAvailable(): Promise<boolean> {
  return (await run(['docker', 'info', '--format', '{{.ServerVersion}}'])).ok;
}

/**
 * Whether a container exists and is currently running. Uses the Docker CLI so it
 * honors the user's active Docker context (Docker Desktop, Colima, OrbStack, remote)
 * instead of guessing a socket path.
 */
export async function isRunning(containerId: string): Promise<boolean> {
  const res = await run(['docker', 'inspect', '-f', '{{.State.Running}}', containerId]);
  return res.ok && res.stdout === 'true';
}

export async function startContainer(containerId: string): Promise<boolean> {
  return (await run(['docker', 'start', containerId])).ok;
}

export async function stopContainer(containerId: string): Promise<boolean> {
  return (await run(['docker', 'stop', containerId])).ok;
}

/** Force-remove a container; treats an already-absent container as success. */
export async function removeContainer(containerId: string): Promise<boolean> {
  const res = await run(['docker', 'rm', '-f', containerId]);
  return res.ok || res.stderr.includes('No such container');
}
