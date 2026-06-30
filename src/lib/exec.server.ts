import { Writable } from 'node:stream';
import { getDocker } from './docker-client.server.ts';

/** A running container to exec into, as its remote user (defaults to `root`). */
export interface ExecTarget {
  containerId: string;
  remoteUser?: string | null;
}

/** A node:stream sink that accumulates everything written into a string. */
function collector(): { stream: Writable; text: () => string } {
  const chunks: Buffer[] = [];
  return {
    stream: new Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.from(chunk));
        cb();
      },
    }),
    text: () => Buffer.concat(chunks).toString('utf8'),
  };
}

/** Env var used to smuggle a stdin secret into the container (see `wrapWithStdin`). */
const STDIN_ENV = '__DCM_EXEC_STDIN';

/**
 * Feed `stdin` to the script over a pipe rather than the exec's stdin stream.
 *
 * Real stdin streaming to `docker exec` is unusable on Bun: dockerode's hijack path
 * needs an HTTP `upgrade` event Bun never emits, and the non-hijack path can't
 * half-close the chunked request body, so the script's `$(cat)` blocks forever on EOF.
 * Instead we pass the secret in the exec's `Env` (not argv — it never shows up in `ps`)
 * and `printf` it into the script's stdin, then `unset` it so the script body and its
 * children don't inherit it. The script still reads its secret with `$(cat)`, exactly
 * as before, so callers are unaffected.
 */
function wrapWithStdin(script: string): string {
  return `printf %s "$${STDIN_ENV}" | { unset ${STDIN_ENV}; ${script}\n}`;
}

/**
 * Run a bash script inside a container as its remote user (defaulting to `root`).
 * This is the one place the `bash -lc <script>` container-exec pattern lives — every
 * container injection's `apply()`/`check()` goes through it. Runs over the Docker
 * Engine API (dockerode), no `docker exec` shell-out.
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
  const hasStdin = opts.stdin !== undefined;
  try {
    const exec = await (await getDocker()).getContainer(target.containerId).exec({
      Cmd: ['bash', '-lc', hasStdin ? wrapWithStdin(opts.script) : opts.script, ...(opts.args ?? [])],
      User: user,
      Env: hasStdin ? [`${STDIN_ENV}=${opts.stdin}`] : undefined,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false, // keep stdout/stderr separate (multiplexed) → demux below
    });
    const stream = await exec.start({});

    const out = collector();
    const err = collector();
    exec.modem.demuxStream(stream, out.stream, err.stream);
    await new Promise<void>((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    const code = (await exec.inspect()).ExitCode ?? 1;
    const stdout = opts.capture ? out.text().trim() : '';
    return code === 0
      ? { ok: true, stdout }
      : { ok: false, stdout, error: err.text().trim() || `exit ${code}` };
  } catch (e) {
    return { ok: false, stdout: '', error: (e as Error).message };
  }
}
