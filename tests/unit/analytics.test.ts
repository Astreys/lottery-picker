// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** analytics.ts keeps module state, so each test gets a fresh copy. */
async function load() {
	vi.resetModules();
	return import('$lib/analytics');
}

beforeEach(() => {
	document.head.innerHTML = '';
	// @ts-expect-error -- reset between tests
	delete window.gtag;
	// @ts-expect-error -- reset between tests
	delete window.dataLayer;
});

const gtagScripts = () => document.head.querySelectorAll('script[src*="googletagmanager"]');

describe('init', () => {
	it('does nothing without a measurement ID', async () => {
		const { init } = await load();
		init(undefined);
		init('');
		expect(gtagScripts()).toHaveLength(0);
		expect(window.gtag).toBeUndefined();
	});

	it('rejects anything that is not a GA4 ID', async () => {
		const { init } = await load();
		init('UA-12345-1');
		init('G-ABC"><script>');
		expect(gtagScripts()).toHaveLength(0);
	});

	it('loads gtag once for a valid ID and configures it', async () => {
		const { init } = await load();
		init('G-TEST123');
		init('G-TEST123');
		const scripts = gtagScripts();
		expect(scripts).toHaveLength(1);
		expect((scripts[0] as HTMLScriptElement).src).toContain('id=G-TEST123');
		const calls = window.dataLayer.map((args) => Array.from(args as ArrayLike<unknown>));
		expect(calls).toContainEqual(['config', 'G-TEST123']);
	});
});

describe('track', () => {
	it('is a no-op before init', async () => {
		const { track } = await load();
		expect(() => track('generate', { game: 'lotto-max' })).not.toThrow();
		expect(window.dataLayer).toBeUndefined();
	});

	it('sends an event after init', async () => {
		const { init, track } = await load();
		init('G-TEST123');
		track('generate', { game: 'lotto-max', sets: 5 });
		const last = Array.from(window.dataLayer.at(-1) as ArrayLike<unknown>);
		expect(last).toEqual(['event', 'generate', { game: 'lotto-max', sets: 5 }]);
	});
});
