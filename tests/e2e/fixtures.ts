import { readFileSync } from 'node:fs';
import { test as base, expect, type Page } from '@playwright/test';

type Source = 'cache' | 'live' | 'stale';

/** Real draw histories, so the page analyses the same data the unit tests use. */
export const HISTORY = {
	'lotto-max': JSON.parse(readFileSync('tests/fixtures/lotto-max.json', 'utf8')),
	'daily-grand': JSON.parse(readFileSync('tests/fixtures/daily-grand.json', 'utf8'))
} as const;

export interface DrawsApi {
	/** Every /api/draws request the page made, as URLs. */
	requests: URL[];
	/** Make the next responses fail with this status and message. */
	fail(status: number, message: string): void;
	/** Label the next responses with this source. */
	source(s: Source): void;
}

/**
 * Serve /api/draws/* from the fixtures instead of scraping lotto-8.com, and
 * block Google Analytics outright. Games without a fixture reuse Lotto Max's
 * history, trimmed to the right size by the analysis anyway.
 */
async function mockApi(page: Page): Promise<DrawsApi> {
	const requests: URL[] = [];
	let failure: { status: number; message: string } | null = null;
	let src: Source = 'live';

	await page.route(/googletagmanager|google-analytics/, (route) => route.abort());
	await page.route('**/api/draws/*', async (route) => {
		const url = new URL(route.request().url());
		requests.push(url);
		if (failure) {
			return route.fulfill({ status: failure.status, json: { message: failure.message } });
		}
		const game = url.pathname.split('/').pop() as keyof typeof HISTORY;
		const history = HISTORY[game] ?? HISTORY['lotto-max'];
		return route.fulfill({
			json: { draws: history.draws, fetchedAt: '2026-09-01T12:00:00.000Z', source: src }
		});
	});

	return {
		requests,
		fail: (status, message) => (failure = { status, message }),
		source: (s) => (src = s)
	};
}

/**
 * Open the app and wait for hydration. Clicking before Svelte has attached its
 * handlers silently does nothing, so tests start from a page known to be live.
 */
export async function open(page: Page) {
	await page.goto('/', { waitUntil: 'networkidle' });
}

/** Pick a game by id and load its results through the mocked API. */
export async function loadGame(page: Page, game = 'lotto-max') {
	await page.getByLabel('Game').selectOption(game);
	await page.getByRole('button', { name: 'Load results' }).click();
	await expect(page.getByText(/draws loaded/)).toBeVisible();
}

/** `api` is automatic, so no test can reach lotto-8.com or Google by accident. */
export const test = base.extend<{ api: DrawsApi }>({
	api: [
		async ({ page }, use) => {
			await use(await mockApi(page));
		},
		{ auto: true }
	]
});

export { expect };
