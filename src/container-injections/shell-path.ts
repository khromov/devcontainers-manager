import { checkPresence, execInContainer } from '../lib/exec.server.ts';
import type { Injection } from '../lib/injections.server.ts';

/** Markers bounding the manager-owned PATH block in the user's rc files. */
export const PATH_MARKER_START = '# >>> codebay path >>>';
const PATH_MARKER_END = '# <<< codebay <<<';

/**
 * Append a PATH-restoring block to `~/.bashrc` and `~/.zshrc`.
 *
 * The block is generated *inside* the container from the script's own `$PATH`:
 * `execInContainer` execs `bash -lc`, so that value is the **login** PATH — the
 * one `/etc/profile.d/00-restore-env.sh` (written by the devcontainer CLI to
 * restore the build-time PATH) and feature-installed profile snippets
 * contribute to. Non-login interactive shells never read those files, which is
 * why a fresh code-server terminal tab couldn't find `claude` even though the
 * tmux terminal (which ends in `$SHELL -l`) could.
 *
 * Each entry is re-added through a `case` guard, so the block is a no-op in a
 * shell that already has the directory and never duplicates entries. Missing
 * entries are *appended*, in login-PATH order — the same shape as
 * `00-restore-env.sh`'s own `PATH=$PATH:…`, so nothing the shell already
 * resolves can be shadowed by what we add back. Entries containing a single
 * quote are skipped rather than mis-quoted. The whole write is guarded by the
 * start marker so a re-apply after a rebuild adds nothing.
 */
export const APPLY_SCRIPT = [
	'h=$(eval echo ~$(id -un));',
	`start='${PATH_MARKER_START}';`,
	`end='${PATH_MARKER_END}';`,
	'block=$(',
	'printf \'%s\\n\' "$start";',
	'printf \'%s\\n\' \'codebay_path_add() { case ":$PATH:" in *":$1:"*) ;; *) PATH="${PATH:+$PATH:}$1" ;; esac; }\';',
	'IFS=:;',
	'for d in $PATH; do',
	'[ -n "$d" ] || continue;',
	'case "$d" in *\\\'*) continue ;; esac;',
	'printf "codebay_path_add \'%s\'\\n" "$d";',
	'done;',
	'unset IFS;',
	"printf '%s\\n' 'export PATH';",
	"printf '%s\\n' 'unset -f codebay_path_add';",
	'printf \'%s\\n\' "$end"',
	');',
	'for f in "$h/.bashrc" "$h/.zshrc"; do',
	'grep -qF "$start" "$f" 2>/dev/null || printf \'%s\\n\' "$block" >> "$f";',
	'done'
].join(' ');

/** True when the marked block is present in either rc file. */
const CHECK_SCRIPT =
	'h=$(eval echo ~$(id -un)); ' +
	`start='${PATH_MARKER_START}'; ` +
	'if grep -qF "$start" "$h/.bashrc" 2>/dev/null || grep -qF "$start" "$h/.zshrc" 2>/dev/null; ' +
	'then echo 1; else echo 0; fi';

/**
 * Make the container's build-time PATH visible to plain interactive shells.
 *
 * Tools installed by devcontainer features often land on a directory the image's
 * baked-in `ENV PATH` doesn't list (`/usr/local/share/npm-global/bin`,
 * `~/.local/bin`, …) and are put back on PATH only by `/etc/profile.d` — i.e.
 * only for login shells. Applied always; it has no host dependency.
 */
export const shellPath: Injection = {
	id: 'shell-path',
	label: 'shell PATH',

	async apply(target, log) {
		log('Restoring build-time PATH for interactive shells…\n');
		const res = await execInContainer(target, { script: APPLY_SCRIPT });
		log(res.ok ? '✓ shell PATH restored\n' : `⚠ shell PATH setup failed: ${res.error}\n`);
	},

	async check(target) {
		return checkPresence(target, CHECK_SCRIPT);
	}
};
