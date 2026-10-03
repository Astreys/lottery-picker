import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY, applyTheme, isTheme, nextTheme, readTheme } from '$lib/theme';

/** An in-memory Storage stand-in. */
function memoryStorage(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	return {
		data,
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => void data.set(k, v),
		removeItem: (k: string) => void data.delete(k)
	};
}

const throwing = {
	getItem: () => {
		throw new Error('blocked');
	},
	setItem: () => {
		throw new Error('blocked');
	},
	removeItem: () => {
		throw new Error('blocked');
	}
};

/** Just enough of an element for applyTheme. */
const fakeRoot = () => ({ dataset: {} as Record<string, string> }) as unknown as HTMLElement;

describe('nextTheme', () => {
	it('cycles system → light → dark → system', () => {
		expect(nextTheme('system')).toBe('light');
		expect(nextTheme('light')).toBe('dark');
		expect(nextTheme('dark')).toBe('system');
	});
});

describe('isTheme', () => {
	it('accepts the three themes and nothing else', () => {
		expect(['system', 'light', 'dark'].every(isTheme)).toBe(true);
		expect([null, undefined, '', 'Dark', 'blue', 1].some(isTheme)).toBe(false);
	});
});

describe('readTheme', () => {
	it('returns a stored theme', () => {
		expect(readTheme(memoryStorage({ [STORAGE_KEY]: 'dark' }))).toBe('dark');
	});

	it('falls back to system for nothing stored, junk, no storage, or storage that throws', () => {
		expect(readTheme(memoryStorage())).toBe('system');
		expect(readTheme(memoryStorage({ [STORAGE_KEY]: 'neon' }))).toBe('system');
		expect(readTheme(undefined)).toBe('system');
		expect(readTheme(throwing)).toBe('system');
	});
});

describe('applyTheme', () => {
	it('sets data-theme and remembers an explicit choice', () => {
		const root = fakeRoot();
		const storage = memoryStorage();
		applyTheme('dark', root, storage);
		expect(root.dataset.theme).toBe('dark');
		expect(storage.data.get(STORAGE_KEY)).toBe('dark');
	});

	it('clears both for system, so the stylesheet follows the OS', () => {
		const root = fakeRoot();
		const storage = memoryStorage({ [STORAGE_KEY]: 'light' });
		applyTheme('light', root, storage);
		applyTheme('system', root, storage);
		expect(root.dataset.theme).toBeUndefined();
		expect(storage.data.has(STORAGE_KEY)).toBe(false);
	});

	it('still applies the theme when storage throws', () => {
		const root = fakeRoot();
		expect(() => applyTheme('light', root, throwing)).not.toThrow();
		expect(root.dataset.theme).toBe('light');
	});

	it('works without storage', () => {
		const root = fakeRoot();
		applyTheme('dark', root, undefined);
		expect(root.dataset.theme).toBe('dark');
	});
});

describe('the pre-paint script in app.html', () => {
	const html = readFileSync('src/app.html', 'utf8');
	const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];

	/** Run the inline script against a given stored value. */
	function run(stored: string | null, storageThrows = false) {
		const documentElement = { dataset: {} as Record<string, string> };
		const localStorage = {
			getItem: vi.fn((k: string) => {
				if (storageThrows) throw new Error('blocked');
				return k === STORAGE_KEY ? stored : null;
			})
		};
		new Function('localStorage', 'document', script)(localStorage, { documentElement });
		return documentElement.dataset.theme;
	}

	it('uses the same storage key as theme.ts', () => {
		expect(script).toContain(`'${STORAGE_KEY}'`);
	});

	it('applies a stored light or dark theme', () => {
		expect(run('light')).toBe('light');
		expect(run('dark')).toBe('dark');
	});

	it('ignores missing or unknown values and blocked storage', () => {
		expect(run(null)).toBeUndefined();
		expect(run('system')).toBeUndefined();
		expect(run('<script>')).toBeUndefined();
		expect(run('dark', true)).toBeUndefined();
	});
});
