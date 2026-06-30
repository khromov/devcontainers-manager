import { dockerEnv } from './config.server.ts';

/** A running container to exec into, as its remote user (defaults to `root`). */
export interface ExecTarget {
  containerId: string;
  remoteUser?: string | null;
}

/**
 * Run a bash script inside a container as its remote user (defaulting to `root`).
 * This is the one place the `docker exec -i -u <user> <id> bash -lc <script>`
 * pattern lives — every container injection's `apply()`/`check()` goes through it.
 *
 * Secrets are passed via `stdin` and read with `$(cat)` in the script, never on
 * argv. Extra `args` are appended after the script and appear as `$0`, `$1`, …
 * inside it (used to pass non-secret context). Set `capture` to read stdout back;
 * stderr is always captured for error reporting.
 */
export async function execInContainer(
  target: ExecTarget,
  opts: { script: string; stdin?: string; args?: string[]; capture?: boolean },
): Promise<{ ok: boolean; stdout: string; error?: string }> {
  const user = target.remoteUser?.trim() || 'root';
  const cmd = ['docker', 'exec'];
  if (opts.stdin !== undefined) cmd.push('-i');
  cmd.push('-u', user, target.containerId, 'bash', '-lc', opts.script, ...(opts.args ?? []));
  try {
    const proc = Bun.spawn(cmd, {
      env: dockerEnv(),
      stdin: opts.stdin !== undefined ? 'pipe' : 'ignore',
      stdout: opts.capture ? 'pipe' : 'ignore',
      stderr: 'pipe',
    });
    if (opts.stdin !== undefined && proc.stdin) {
      proc.stdin.write(opts.stdin);
      await proc.stdin.end();
    }
    const [stdout, stderr, code] = await Promise.all([
      opts.capture ? new Response(proc.stdout).text() : Promise.resolve(''),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return code === 0
      ? { ok: true, stdout: stdout.trim() }
      : { ok: false, stdout: stdout.trim(), error: stderr.trim() || `exit ${code}` };
  } catch (err) {
    return { ok: false, stdout: '', error: (err as Error).message };
  }
}
