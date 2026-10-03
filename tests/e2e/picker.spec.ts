import { HISTORY, expect, loadGame, open, test } from './fixtures';
import type { Page } from '@playwright/test';

const TOTAL = HISTORY['lotto-max'].draws.length;

/** The numbers on each generated line, main balls only. */
async function sets(page: Page): Promise<number[][]> {
	return page
		.locator('.line')
		.evaluateAll((lines) =>
			lines.map((l) => [...l.querySelectorAll('.ball:not(.grand)')].map((b) => Number(b.textContent)))
		);
}

test.describe('loading draw history', () => {
	test('starts empty with a prompt and the explainer', async ({ page, api }) => {
		await open(page);
		await expect(page.getByRole('heading', { name: 'Lottery number picker' })).toBeVisible();
		await expect(page.getByText('Load results for Lotto Max to see the analysis')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'About the odds' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Your picks' })).toHaveCount(0);
		expect(api.requests).toHaveLength(0);
	});

	test('loads results for the selected game', async ({ page, api }) => {
		await open(page);
		await loadGame(page, 'lotto-max');
		await expect(page.getByText(`${TOTAL} draws loaded`)).toContainText('fetched');
		expect(api.requests.at(-1)!.pathname).toBe('/api/draws/lotto-max');
		expect(api.requests.at(-1)!.searchParams.get('refresh')).toBeNull();
		await expect(page.getByText(`Analysing 200 of ${TOTAL} draws`)).toBeVisible();
	});

	test('Refresh bypasses the cache', async ({ page, api }) => {
		await open(page);
		await page.getByRole('button', { name: 'Refresh' }).click();
		await expect(page.getByText(/draws loaded/)).toBeVisible();
		expect(api.requests.at(-1)!.searchParams.get('refresh')).toBe('1');
	});

	test('says when it is showing stale data', async ({ page, api }) => {
		api.source('stale');
		await open(page);
		await loadGame(page);
		await expect(page.getByText('source unreachable, showing stale data')).toBeVisible();
	});

	test('shows the error when the source is unreachable', async ({ page, api }) => {
		api.fail(502, 'Could not reach the results source: timeout');
		await open(page);
		await page.getByRole('button', { name: 'Load results' }).click();
		await expect(page.getByText('Could not reach the results source: timeout')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Analysis window' })).toHaveCount(0);
	});

	test('reads an uploaded results file', async ({ page, api }) => {
		await open(page);
		await page.locator('input[type=file]').setInputFiles('uploads/lotto-max.txt');
		await expect(page.getByText('335 draws loaded from file')).toBeVisible();
		expect(api.requests).toHaveLength(0);
	});

	test('rejects a file with no draws in it', async ({ page }) => {
		await open(page);
		await page.locator('input[type=file]').setInputFiles({
			name: 'notes.txt',
			mimeType: 'text/plain',
			buffer: Buffer.from('nothing to see here\n1 2 3\n')
		});
		await expect(page.getByText('No draws found')).toBeVisible();
	});

	test('switching game clears the previous results', async ({ page }) => {
		await open(page);
		await loadGame(page, 'lotto-max');
		await page.getByLabel('Game').selectOption('lotto-649');
		await expect(page.getByText('Load results for Lotto 6/49 to see the analysis')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Analysis window' })).toHaveCount(0);
	});
});

test.describe('analysis', () => {
	test.beforeEach(async ({ page }) => {
		await open(page);
		await loadGame(page);
	});

	test('changes the window', async ({ page }) => {
		for (const [label, n] of [['50', 50], ['500', 500], ['All', TOTAL]] as const) {
			await page.getByRole('button', { name: label, exact: true }).click();
			await expect(page.getByText(`Analysing ${n} of ${TOTAL} draws`)).toBeVisible();
			await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
		}
	});

	test('switches between frequency and overdue', async ({ page }) => {
		await expect(page.getByText('Hot = drawn most often in the window')).toBeVisible();
		await page.getByRole('button', { name: 'Overdue' }).click();
		await expect(page.getByText('Hot = seen most recently')).toBeVisible();
	});

	test('lists every number and sorts the table', async ({ page }) => {
		const table = page.locator('table').first();
		await expect(table.locator('tbody tr')).toHaveCount(52);
		await expect(table.locator('tbody tr').first().locator('td').first()).toHaveText('1');

		await page.getByRole('button', { name: 'Times drawn' }).click();
		const counts = await table.locator('tbody tr td:nth-child(2)').allTextContents();
		const nums = counts.map(Number);
		expect(nums).toEqual([...nums].sort((a, b) => b - a));
		await expect(page.locator('th[aria-sort="descending"]')).toContainText('Times drawn');
	});
});

test.describe('generating sets', () => {
	test.beforeEach(async ({ page }) => {
		await open(page);
		await loadGame(page);
	});

	test('builds the requested number of valid, distinct sets', async ({ page }) => {
		await page.getByLabel('Sets').fill('8');
		await page.getByRole('button', { name: 'Generate', exact: true }).click();

		const all = await sets(page);
		expect(all).toHaveLength(8);
		for (const s of all) {
			expect(s).toHaveLength(7);
			expect(new Set(s).size).toBe(7);
			expect(s.every((n) => n >= 1 && n <= 52)).toBe(true);
			expect(s).toEqual([...s].sort((a, b) => a - b));
		}
		expect(new Set(all.map((s) => s.join())).size).toBe(8);
	});

	test('colours balls by band to match the recipe', async ({ page }) => {
		await page.getByRole('button', { name: 'Generate', exact: true }).click();
		const line = page.locator('.line').first();
		await expect(line.locator('.ball.hot')).toHaveCount(2);
		await expect(line.locator('.ball.regular')).toHaveCount(3);
		await expect(line.locator('.ball.cold')).toHaveCount(2);
	});

	test('Generate again replaces the sets', async ({ page }) => {
		await page.getByRole('button', { name: 'Generate', exact: true }).click();
		const before = await sets(page);
		await page.getByRole('button', { name: 'Generate again' }).click();
		await expect.poll(async () => (await sets(page)).join('|')).not.toBe(before.join('|'));
	});

	test('blocks a split that does not add up to the game', async ({ page }) => {
		const hot = page.getByLabel('Hot', { exact: true });
		await hot.fill('4');
		await hot.press('Tab');
		await expect(page.getByText('Lotto Max draws 7 numbers — your split adds up to 9.')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled();

		await hot.fill('2');
		await hot.press('Tab');
		await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeEnabled();
	});
});

test.describe('Daily Grand', () => {
	test.beforeEach(async ({ page }) => {
		await open(page);
		await loadGame(page, 'daily-grand');
	});

	test('analyses the grand number pool separately', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'Grand Number pool' })).toBeVisible();
		await expect(page.locator('table').nth(1).locator('tbody tr')).toHaveCount(7);
	});

	test('adds a grand number from the chosen band to every set', async ({ page }) => {
		await page.getByRole('button', { name: 'cold', exact: true }).click();
		await page.getByRole('button', { name: 'Generate', exact: true }).click();

		const lines = page.locator('.line');
		await expect(lines).toHaveCount(5);
		for (const line of await lines.all()) {
			await expect(line.locator('.ball:not(.grand)')).toHaveCount(5);
			const grand = line.locator('.ball.grand');
			await expect(grand).toHaveClass(/cold/);
			const n = Number(await grand.textContent());
			expect(n).toBeGreaterThanOrEqual(1);
			expect(n).toBeLessThanOrEqual(7);
		}
	});
});
