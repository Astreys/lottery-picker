import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Draw } from '$lib/parse';

vi.mock('$lib/server/source', () => ({ fetchDraws: vi.fn() }));
vi.mock('$lib/server/store', () => ({ read: vi.fn(), write: vi.fn() }));

const { fetchDraws } = await import('$lib/server/source');
const { read, write } = await import('$lib/server/store');
const draws = await import('../../src/routes/api/draws/[game]/+server');
const robots = await import('../../src/routes/robots.txt/+server');
const sitemap = await import('../../src/routes/sitemap.xml/+server');

const sample: Draw[] = [{ date: '2026-09-01', numbers: [5, 12, 25, 30, 39, 50, 52], bonus: 19 }];
const HOUR = 60 * 60 * 1000;

/** Call the draws endpoint the way SvelteKit would. */
async function get(game: string, query = '') {
	const headers: Record<string, string> = {};
	const event = {
		params: { game },
		url: new URL(`https://example.test/api/draws/${game}${query}`),
		setHeaders: (h: Record<string, string>) => Object.assign(headers, h)
	};
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await draws.GET(event as any);
		return { status: res.status, body: await res.json(), headers };
	} catch (e) {
		// SvelteKit's error() throws an HttpError.
		const err = e as { status: number; body: { message: string } };
		return { status: err.status, body: err.body, headers };
	}
}

describe('GET /api/draws/[game]', () => {
	beforeEach(() => {
		vi.mocked(fetchDraws).mockReset();
		vi.mocked(read).mockReset();
		vi.mocked(write).mockReset();
	});

	it('404s for an unknown game', async () => {
		const res = await get('powerball');
		expect(res.status).toBe(404);
		expect(res.body.message).toMatch(/Unknown game/);
		expect(fetchDraws).not.toHaveBeenCalled();
	});

	it('serves a fresh cache without touching the source', async () => {
		vi.mocked(read).mockResolvedValue({ draws: sample, fetchedAt: new Date(Date.now() - HOUR).toISOString() });
		const res = await get('lotto-max');
		expect(res.status).toBe(200);
		expect(res.body.source).toBe('cache');
		expect(res.body.draws).toEqual(sample);
		expect(res.headers['cache-control']).toMatch(/max-age/);
		expect(fetchDraws).not.toHaveBeenCalled();
	});

	it('fetches live and caches when the cache is stale', async () => {
		vi.mocked(read).mockResolvedValue({ draws: [], fetchedAt: new Date(Date.now() - 13 * HOUR).toISOString() });
		vi.mocked(fetchDraws).mockResolvedValue(sample);
		const res = await get('lotto-max');
		expect(res.body.source).toBe('live');
		expect(res.body.draws).toEqual(sample);
		expect(write).toHaveBeenCalledWith('lotto-max', expect.objectContaining({ draws: sample }));
	});

	it('fetches live on an empty cache', async () => {
		vi.mocked(read).mockResolvedValue(null);
		vi.mocked(fetchDraws).mockResolvedValue(sample);
		expect((await get('daily-grand')).body.source).toBe('live');
		expect(vi.mocked(fetchDraws).mock.calls[0][0].id).toBe('daily-grand');
	});

	it('?refresh=1 skips the cache entirely', async () => {
		vi.mocked(fetchDraws).mockResolvedValue(sample);
		const res = await get('lotto-max', '?refresh=1');
		expect(read).not.toHaveBeenCalled();
		expect(res.body.source).toBe('live');
	});

	it('falls back to stale data when the source fails', async () => {
		const old = { draws: sample, fetchedAt: new Date(Date.now() - 48 * HOUR).toISOString() };
		vi.mocked(read).mockResolvedValue(old);
		vi.mocked(fetchDraws).mockRejectedValue(new Error('timeout'));
		const res = await get('lotto-max');
		expect(res.status).toBe(200);
		expect(res.body.source).toBe('stale');
	});

	it('502s when the source fails or returns nothing and there is no cache', async () => {
		vi.mocked(read).mockResolvedValue(null);
		vi.mocked(fetchDraws).mockRejectedValue(new Error('timeout'));
		let res = await get('lotto-max');
		expect(res.status).toBe(502);
		expect(res.body.message).toMatch(/timeout/);

		vi.mocked(fetchDraws).mockResolvedValue([]);
		res = await get('lotto-max');
		expect(res.status).toBe(502);
		expect(res.body.message).toMatch(/no rows/);
	});
});

describe('robots.txt', () => {
	it('allows the site, hides the API and points at the sitemap on the same origin', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await robots.GET({ url: new URL('https://picker.example/robots.txt') } as any);
		const body = await res.text();
		expect(res.headers.get('content-type')).toMatch(/text\/plain/);
		expect(body).toContain('Allow: /');
		expect(body).toContain('Disallow: /api/');
		expect(body).toContain('Sitemap: https://picker.example/sitemap.xml');
	});
});

describe('sitemap.xml', () => {
	it('lists the home page on the request origin', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await sitemap.GET({ url: new URL('https://picker.example/sitemap.xml') } as any);
		const body = await res.text();
		expect(res.headers.get('content-type')).toMatch(/application\/xml/);
		expect(body).toMatch(/^<\?xml/);
		expect(body).toContain('<loc>https://picker.example/</loc>');
	});
});
