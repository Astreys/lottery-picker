import { parseSourceHtml, type Draw } from '$lib/parse';
import type { Game } from '$lib/games';

const BASE = 'https://www.lotto-8.com/canada/';

/** The site is picky about clients; a browser-ish User-Agent keeps it happy. */
const HEADERS = {
	'User-Agent':
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
	'Accept-Language': 'en-CA,en;q=0.9'
};

/**
 * Pages fetched at once. Sequential fetching of two dozen pages runs to ~18s,
 * well past Netlify's 10s function limit on the free plan; twelve at a time brings
 * a full history load to a few seconds, and is still only two dozen requests.
 */
const CONCURRENCY = 12;

async function page(game: Game, index: number): Promise<Draw[]> {
	const url = `${BASE}${game.source}?indexpage=${index}&orderby=new`;
	const res = await fetch(url, { headers: HEADERS });
	if (!res.ok) throw new Error(`${game.source} page ${index}: HTTP ${res.status}`);
	return parseSourceHtml(await res.text());
}

/**
 * Fetch the most recent `pages` pages of history, newest first. The site serves
 * ~23 draws per page.
 *
 * A page that fails or comes back empty ends the history there rather than
 * failing the whole load — partial history still drives the picker, and it is
 * how we detect running off the end of the pagination.
 */
export async function fetchDraws(game: Game, pages: number): Promise<Draw[]> {
	const draws: Draw[] = [];

	for (let start = 1; start <= pages; start += CONCURRENCY) {
		const batch = Array.from(
			{ length: Math.min(CONCURRENCY, pages - start + 1) },
			(_, i) => start + i
		);
		const results = await Promise.allSettled(batch.map((i) => page(game, i)));

		for (const result of results) {
			// Keep pages in order, and stop at the first gap so the history stays
			// contiguous — a hole would corrupt every "draws since seen" figure.
			if (result.status !== 'fulfilled' || !result.value.length) return draws;
			draws.push(...result.value);
		}
	}

	return draws;
}
