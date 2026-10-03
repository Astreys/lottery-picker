import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byId, type Game } from '$lib/games';
import { fetchDraws } from '$lib/server/source';
import { read, write } from '$lib/server/store';

const lottoMax = byId('lotto-max') as Game;

/** One lotto-8.com page holding the given draws, in the site's table layout. */
function page(draws: Array<[string, number[], number]>) {
	return draws
		.map(
			([date, numbers, bonus]) =>
				`<td class="date-cell">${date}</td>` +
				`<td class="number-cell">${numbers.join('&nbsp;')}</td>` +
				`<td class="bonus-cell">${bonus}</td>`
		)
		.join('\n');
}

describe('fetchDraws', () => {
	const fetchMock = vi.fn<typeof fetch>();

	beforeEach(() => {
		fetchMock.mockReset();
		vi.stubGlobal('fetch', fetchMock);
	});
	afterEach(() => vi.unstubAllGlobals());

	const pageNo = (call: unknown[]) => Number(new URL(String(call[0])).searchParams.get('indexpage'));

	it('requests each page of the game, newest first, and keeps them in order', async () => {
		fetchMock.mockImplementation(async (url) => {
			const n = Number(new URL(String(url)).searchParams.get('indexpage'));
			return new Response(page([[`0${n}/01<br>26(MON)`, [n, 10 + n], 1]]));
		});
		const draws = await fetchDraws(lottoMax, 3);
		expect(draws.map((d) => d.numbers[0])).toEqual([1, 2, 3]);
		expect(fetchMock.mock.calls.map(pageNo).sort()).toEqual([1, 2, 3]);
		const url = new URL(String(fetchMock.mock.calls[0][0]));
		expect(url.pathname).toBe('/canada/listltoCAMAX.asp');
		expect(url.searchParams.get('orderby')).toBe('new');
	});

	it('stops at the first failed or empty page so the history stays contiguous', async () => {
		fetchMock.mockImplementation(async (url) => {
			const n = Number(new URL(String(url)).searchParams.get('indexpage'));
			if (n === 3) return new Response('', { status: 500 });
			return new Response(page([[`0${n}/01<br>26(MON)`, [n], 1]]));
		});
		expect((await fetchDraws(lottoMax, 5)).map((d) => d.numbers[0])).toEqual([1, 2]);

		fetchMock.mockImplementation(async (url) => {
			const n = Number(new URL(String(url)).searchParams.get('indexpage'));
			return new Response(n === 1 ? page([['01/01<br>26(MON)', [1], 1]]) : '<p>no rows</p>');
		});
		expect(await fetchDraws(lottoMax, 5)).toHaveLength(1);
	});

	it('treats a network error as the end of the history', async () => {
		fetchMock.mockRejectedValue(new Error('offline'));
		expect(await fetchDraws(lottoMax, 2)).toEqual([]);
	});

	it('fetches in batches of at most 12 pages', async () => {
		let inFlight = 0;
		let peak = 0;
		fetchMock.mockImplementation(async () => {
			peak = Math.max(peak, ++inFlight);
			await new Promise((r) => setTimeout(r, 1));
			inFlight--;
			return new Response(page([['01/01<br>26(MON)', [1], 1]]));
		});
		await fetchDraws(lottoMax, 24);
		expect(fetchMock).toHaveBeenCalledTimes(24);
		expect(peak).toBeLessThanOrEqual(12);
	});
});

describe('store (in-memory fallback outside Netlify)', () => {
	it('returns null for an unknown key', async () => {
		expect(await read('nothing-here')).toBeNull();
	});

	it('round-trips a value', async () => {
		const value = { draws: [{ date: '2026-01-01', numbers: [1, 2], bonus: 3 }], fetchedAt: 'now' };
		await write('round-trip', value);
		expect(await read('round-trip')).toEqual(value);
	});
});
