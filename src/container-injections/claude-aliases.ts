import { checkPresence, execInContainer } from '../lib/exec.server.ts';
import type { Injection } from '../lib/injections.server.ts';

/**
 * The alias lines appended to the container user's shell rc files — mirrors the
 * host's `c200`/`cs` shortcuts. `c200` disables Claude Code's 1M context window
 * (standard 200k), `cs` runs Claude on Sonnet. Both resolve `claude`, which the
 * `claude-skip-permissions` injection also aliases, so interactive shells compose
 * the two naturally.
 */
const ALIAS_LINES = [
	"alias c200='CLAUDE_CODE_DISABLE_1M_CONTEXT=1 claude'",
	"alias cs='claude --model sonnet'"
];

/**
 * Append each alias to both `~/.bashrc` and `~/.zshrc`, guarded with `grep -qF`
 * so a re-apply never duplicates a line; `>>` creates the file if absent. The
 * lines are passed as `$@` so no alias text is interpolated into the loop body.
 */
const APPLY_SCRIPT =
	'h=$(eval echo ~$(id -un)); ' +
	'for line in "$@"; do ' +
	'for f in "$h/.bashrc" "$h/.zshrc"; do ' +
	'grep -qF "$line" "$f" 2>/dev/null || printf \'%s\\n\' "$line" >> "$f"; ' +
	'done; ' +
	'done';

/** True only when every alias line is present in either rc file. */
const CHECK_SCRIPT =
	'h=$(eval echo ~$(id -un)); ' +
	'for line in "$@"; do ' +
	'grep -qF "$line" "$h/.bashrc" 2>/dev/null || grep -qF "$line" "$h/.zshrc" 2>/dev/null || ' +
	'{ echo 0; exit 0; }; ' +
	'done; ' +
	'echo 1';

/**
 * Install the host's `c200` / `cs` Claude shortcuts into the container's shell so
 * interactive terminals opened in code-server have them ready. Always applied; it
 * has no host dependency. Only affects interactive shells (which is what code-server
 * opens). The alias lines are forwarded as script args (`$1`, `$2`, …) so they are
 * never interpolated into the script text.
 */
export const claudeAliases: Injection = {
	id: 'claude-aliases',
	label: 'claude aliases',

	async apply(target, log) {
		log('Installing c200 / cs claude aliases…\n');
		const res = await execInContainer(target, {
			script: APPLY_SCRIPT,
			args: ['claude-aliases', ...ALIAS_LINES]
		});
		log(res.ok ? '✓ claude aliases installed\n' : `⚠ claude aliases setup failed: ${res.error}\n`);
	},

	async check(target) {
		return checkPresence(target, CHECK_SCRIPT, ['claude-aliases', ...ALIAS_LINES]);
	}
};
