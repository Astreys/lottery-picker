import { expect, open, test } from './fixtures';
import type { Page } from '@playwright/test';

const LIGHT_BG = 'rgb(247, 246, 243)';
const DARK_BG = 'rgb(23, 22, 20)';

const background = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const attr = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme ?? null);
const toggle = (page: Page) => page.getByRole('button', { name: /theme/i });

test.describe('with a light system theme', () => {
	test.use({ colorScheme: 'light' });

	test('starts on Auto and follows the system', async ({ page }) => {
		await open(page);
		await expect(toggle(page)).toHaveText('Auto');
		expect(await attr(page)).toBeNull();
		expect(await background(page)).toBe(LIGHT_BG);
	});

	test('cycles Auto → Light → Dark → Auto', async ({ page }) => {
		await open(page);
		const steps = [
			['Light', 'light', LIGHT_BG],
			['Dark', 'dark', DARK_BG],
			['Auto', null, LIGHT_BG]
		] as const;
		for (const [label, theme, bg] of steps) {
			await toggle(page).click();
			await expect(toggle(page)).toHaveText(label);
			expect(await attr(page)).toBe(theme);
			expect(await background(page)).toBe(bg);
		}
	});

	test('says what the next click will do', async ({ page }) => {
		await open(page);
		await expect(toggle(page)).toHaveAttribute('aria-label', 'System theme. Switch to light theme');
		await toggle(page).click();
		await expect(toggle(page)).toHaveAttribute('aria-label', 'Light theme. Switch to dark theme');
	});

	test('remembers the choice across reloads, and forgets it on Auto', async ({ page }) => {
		await open(page);
		await toggle(page).click();
		await toggle(page).click();
		await page.reload({ waitUntil: 'networkidle' });
		await expect(toggle(page)).toHaveText('Dark');
		expect(await background(page)).toBe(DARK_BG);

		await toggle(page).click();
		await page.reload({ waitUntil: 'networkidle' });
		await expect(toggle(page)).toHaveText('Auto');
		expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull();
	});

	test('applies a stored theme before the app loads, so there is no flash', async ({ page }) => {
		await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
		// Block the app's JavaScript entirely: only the inline script in app.html can act.
		await page.route('**/_app/**/*.js', (route) => route.abort());
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		expect(await attr(page)).toBe('dark');
		expect(await background(page)).toBe(DARK_BG);
	});

	test('ignores a junk stored value', async ({ page }) => {
		await page.addInitScript(() => localStorage.setItem('theme', 'neon'));
		await open(page);
		await expect(toggle(page)).toHaveText('Auto');
		expect(await attr(page)).toBeNull();
	});
});

test.describe('with a dark system theme', () => {
	test.use({ colorScheme: 'dark' });

	test('Auto follows the system into dark', async ({ page }) => {
		await open(page);
		expect(await background(page)).toBe(DARK_BG);
	});

	test('Light overrides a dark system', async ({ page }) => {
		await open(page);
		await toggle(page).click();
		await expect(toggle(page)).toHaveText('Light');
		expect(await background(page)).toBe(LIGHT_BG);
	});
});
