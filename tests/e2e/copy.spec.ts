import { expect, loadGame, open, test } from './fixtures';
import type { Page } from '@playwright/test';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

/** Clipboard text with line endings normalised — Windows hands back \r\n. */
const clipboard = (page: Page) =>
	page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n'));

/** What a line shows, in the copy format. */
const shown = (page: Page, i: number) =>
	page.locator('.line').nth(i).evaluate((l) => {
		const mains = [...l.querySelectorAll('.ball:not(.grand)')].map((b) => b.textContent);
		const grand = l.querySelector('.ball.grand')?.textContent;
		return mains.join(' - ') + (grand ? ` + ${grand}` : '');
	});

const FORMAT = /^\d{1,2}( - \d{1,2})+( \+ \d)?$/;

test('copies one set as "11 - 23 - 24 - 27 - 38 - 49"', async ({ page }) => {
	await open(page);
	await loadGame(page, 'lotto-649');
	await page.getByRole('button', { name: 'Generate', exact: true }).click();

	await page.getByRole('button', { name: /^Copy set 3:/ }).click();
	const text = await clipboard(page);
	expect(text).toMatch(FORMAT);
	expect(text).toBe(await shown(page, 2));
	expect(text.split(' - ')).toHaveLength(6);

	await expect(page.locator('.copy-one').nth(2)).toHaveText('Copied');
	await expect(page.locator('.copy-one').nth(0)).toHaveText('Copy');
	await expect(page.getByText('Set 3 copied')).toBeAttached();
	// The confirmation clears itself.
	await expect(page.locator('.copy-one').nth(2)).toHaveText('Copy', { timeout: 4000 });
});

test('copies every set, one per line', async ({ page }) => {
	await open(page);
	await loadGame(page);
	await page.getByLabel('Sets').fill('4');
	await page.getByRole('button', { name: 'Generate', exact: true }).click();

	await page.getByRole('button', { name: 'Copy all' }).click();
	const lines = (await clipboard(page)).split('\n');
	expect(lines).toHaveLength(4);
	for (const [i, line] of lines.entries()) {
		expect(line).toMatch(FORMAT);
		expect(line).toBe(await shown(page, i));
	}
	await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
});

test('includes the Daily Grand number after a plus', async ({ page }) => {
	await open(page);
	await loadGame(page, 'daily-grand');
	await page.getByRole('button', { name: 'Generate', exact: true }).click();

	await page.getByRole('button', { name: /^Copy set 1:/ }).click();
	const text = await clipboard(page);
	expect(text).toMatch(/^\d{1,2}( - \d{1,2}){4} \+ [1-7]$/);
	expect(text).toBe(await shown(page, 0));
});

test('reports a blocked clipboard instead of failing silently', async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText: () => Promise.reject(new Error('denied')) }
		});
	});
	await open(page);
	await loadGame(page);
	await page.getByRole('button', { name: 'Generate', exact: true }).click();
	await page.getByRole('button', { name: 'Copy all' }).click();
	await expect(page.getByText('Could not copy')).toBeVisible();
});
