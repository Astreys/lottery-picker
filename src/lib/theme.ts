/**
 * Light / dark / follow-the-system theme. The choice is stored in localStorage
 * and applied as `data-theme` on <html>; with no stored choice the attribute is
 * absent and the stylesheet follows `prefers-color-scheme`.
 *
 * src/app.html applies the stored value inline before first paint, so a page
 * load never flashes the wrong theme. Keep the key in step with that script.
 */

export type Theme = 'system' | 'light' | 'dark';

export const STORAGE_KEY = 'theme';

const ORDER: Theme[] = ['system', 'light', 'dark'];

export const LABELS: Record<Theme, string> = {
	system: 'System theme',
	light: 'Light theme',
	dark: 'Dark theme'
};

/** The next theme when the toggle is pressed: system → light → dark → system. */
export function nextTheme(current: Theme): Theme {
	return ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
}

export function isTheme(value: unknown): value is Theme {
	return typeof value === 'string' && (ORDER as string[]).includes(value);
}

/** Storage can throw outright in private windows, so every access is guarded. */
export function readTheme(storage: Pick<Storage, 'getItem'> | undefined): Theme {
	try {
		const value = storage?.getItem(STORAGE_KEY);
		return isTheme(value) ? value : 'system';
	} catch {
		return 'system';
	}
}

export function applyTheme(
	theme: Theme,
	root: HTMLElement,
	storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined
): void {
	if (theme === 'system') delete root.dataset.theme;
	else root.dataset.theme = theme;
	try {
		if (theme === 'system') storage?.removeItem(STORAGE_KEY);
		else storage?.setItem(STORAGE_KEY, theme);
	} catch {
		// Not remembered across visits, but it still applies for this one.
	}
}
