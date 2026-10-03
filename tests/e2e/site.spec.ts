import { expect, loadGame, open, test } from './fixtures';

test('has a title, description, canonical URL and social cards', async ({ page, baseURL }) => {
	await open(page);
	await expect(page).toHaveTitle(/Lottery Number Picker/);
	await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Lotto Max/);
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${baseURL}/`);
	await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${baseURL}/og.png`);
	await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');

	const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent() ?? '{}');
	expect(ld['@type']).toBe('WebApplication');
	expect(ld.featureList).toHaveLength(6);
});

test('does not load analytics without a measurement ID', async ({ page }) => {
	const gtag: string[] = [];
	page.on('request', (r) => r.url().includes('googletagmanager') && gtag.push(r.url()));
	await open(page);
	expect(gtag).toEqual([]);
});

test('serves robots.txt, the sitemap, the manifest and icons', async ({ request, baseURL }) => {
	const robots = await request.get('/robots.txt');
	expect(await robots.text()).toContain(`Sitemap: ${baseURL}/sitemap.xml`);

	const sitemap = await request.get('/sitemap.xml');
	expect(sitemap.headers()['content-type']).toContain('xml');
	expect(await sitemap.text()).toContain(`<loc>${baseURL}/</loc>`);

	const manifest = await (await request.get('/site.webmanifest')).json();
	expect(manifest.name).toBe('Lottery Number Picker');

	for (const path of ['/favicon.svg', '/icon-192.png', '/icon-512.png', '/og.png', '/apple-touch-icon.png']) {
		expect((await request.get(path)).status(), path).toBe(200);
	}
});

test('never scrolls sideways, even with results and picks on screen', async ({ page }) => {
	await open(page);
	await loadGame(page, 'daily-grand');
	await page.getByRole('button', { name: 'Generate', exact: true }).click();
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
});
