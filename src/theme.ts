/**
 * Cookie-backed theme preference: light, dark, or auto (follow the browser/OS
 * `prefers-color-scheme`). IMPORTANT: only import this from `.svelte` files (or
 * plain `.ts` modules they import) — `cookies` here resolves through Mochi's
 * isomorphic virtual module, which only exists in the Svelte build graph. Server
 * entry files (index.ts, *.server.ts) must instead use
 * `getRequestContext().cookies` — see src/lib/theme.server.ts.
 */
import { cookies } from 'mochi-framework';

export type Theme = 'light' | 'dark' | 'auto';

const THEME_KEY = 'theme';

export function getTheme(): Theme {
	const value = cookies.get(THEME_KEY);
	return value === 'dark' || value === 'light' ? value : 'auto';
}

export function setTheme(theme: Theme): void {
	cookies.set(THEME_KEY, theme, { expires: 400, path: '/' });
}

/**
 * Reflects the choice onto `<html data-theme>` so the shell CSS picks it up
 * immediately. Auto removes the attribute — `:root`'s `color-scheme: light dark`
 * then lets `light-dark()` follow the browser preference. Client-only.
 */
export function applyTheme(theme: Theme): void {
	if (theme === 'auto') delete document.documentElement.dataset.theme;
	else document.documentElement.dataset.theme = theme;
}
