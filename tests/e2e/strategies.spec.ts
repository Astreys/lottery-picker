import { expect, loadGame, open, test } from './fixtures';
import type { Page } from '@playwright/test';

const strategy = (page: Page, name: string) =>
	page.getByRole('group', { name: 'Strategy' }).getByRole('button', { name, exact: true });

const generate = (page: Page) => page.getByRole('button', { name: 'Generate', exact: true }).click();

/** Main numbers on each generated line. */
const sets = (page: Page) =>
	page
		.locator('.line')
		.evaluateAll((lines) =>
			lines.map((l) => [...l.querySelectorAll('.ball:not(.grand)')].map((b) => Number(b.textContent)))
		);

test.beforeEach(async ({ page }) => {
	await open(page);
	await loadGame(page);
});

test('defaults to hot / cold bands with the split controls', async ({ page }) => {
	await expect(strategy(page, 'Hot / cold bands')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByLabel('Hot', { exact: true })).toBeVisible();
	await expect(page.locator('.panel').getByText('you choose the split')).toBeVisible();
});

for (const [name, blurb] of [
	['Weighted', 'the likelier it is'],
	['Companions', 'drawn alongside it'],
	['Quick pick', 'equally likely']
] as const) {
	test(`${name} hides the split and builds full, valid sets`, async ({ page }) => {
		await strategy(page, name).click();
		await expect(strategy(page, name)).toHaveAttribute('aria-pressed', 'true');
		await expect(page.locator('.panel').getByText(blurb)).toBeVisible();
		await expect(page.getByLabel('Hot', { exact: true })).toHaveCount(0);

		await page.getByLabel('Sets').fill('6');
		await generate(page);
		const all = await sets(page);
		expect(all).toHaveLength(6);
		for (const s of all) {
			expect(s).toHaveLength(7);
			expect(new Set(s).size).toBe(7);
			expect(s.every((n) => n >= 1 && n <= 52)).toBe(true);
		}
	});
}

test('a broken split only blocks the band strategy', async ({ page }) => {
	const hot = page.getByLabel('Hot', { exact: true });
	await hot.fill('5');
	await hot.press('Tab');
	await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled();

	await strategy(page, 'Quick pick').click();
	await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeEnabled();
	await expect(page.getByText('your split adds up to')).toHaveCount(0);
});

test('balanced keeps odd/even and low/high to 3–4 of 7', async ({ page }) => {
	await strategy(page, 'Quick pick').click();
	await page.getByLabel('Balanced odd/even and low/high').check();
	await page.getByLabel('Sets').fill('10');
	await generate(page);

	for (const s of await sets(page)) {
		const odd = s.filter((n) => n % 2).length;
		const low = s.filter((n) => n <= 26).length;
		expect(odd, s.join()).toBeGreaterThanOrEqual(3);
		expect(odd, s.join()).toBeLessThanOrEqual(4);
		expect(low, s.join()).toBeGreaterThanOrEqual(3);
		expect(low, s.join()).toBeLessThanOrEqual(4);
	}
});

test('works with Daily Grand and its grand number', async ({ page }) => {
	await page.getByLabel('Game').selectOption('daily-grand');
	await page.getByRole('button', { name: 'Load results' }).click();
	await strategy(page, 'Companions').click();
	await generate(page);

	const lines = page.locator('.line');
	await expect(lines).toHaveCount(5);
	for (const line of await lines.all()) {
		await expect(line.locator('.ball:not(.grand)')).toHaveCount(5);
		await expect(line.locator('.ball.grand')).toHaveCount(1);
	}
});

test('explains every strategy in the footer', async ({ page }) => {
	const footer = page.locator('footer');
	await expect(footer.getByRole('heading', { name: 'Strategies' })).toBeVisible();
	for (const name of ['Hot / cold bands', 'Weighted', 'Companions', 'Quick pick']) {
		await expect(footer.locator('dt', { hasText: name })).toBeVisible();
	}
});
