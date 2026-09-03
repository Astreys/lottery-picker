import { json, error } from '@sveltejs/kit';
import { byId } from '$lib/games';
import { fetchDraws } from '$lib/server/source';
import { read, write } from '$lib/server/store';
import type { RequestHandler } from './$types';

/** How long a cached history stays fresh. Draws happen at most daily. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** ~23 draws per page; 12 pages comfortably covers the 500-draw window. */
const PAGES = 24;

export const GET: RequestHandler = async ({ params, url, setHeaders }) => {
	const game = byId(params.game);
	if (!game) throw error(404, `Unknown game: ${params.game}`);

	const refresh = url.searchParams.get('refresh') === '1';
	const cached = refresh ? null : await read(game.id);
	const age = cached ? Date.now() - Date.parse(cached.fetchedAt) : Infinity;

	if (cached && age < MAX_AGE_MS) {
		setHeaders({ 'cache-control': 'public, max-age=600' });
		return json({ ...cached, source: 'cache' });
	}

	try {
		const draws = await fetchDraws(game, PAGES);
		if (!draws.length) throw new Error('source returned no rows');
		const fresh = { draws, fetchedAt: new Date().toISOString() };
		await write(game.id, fresh);
		setHeaders({ 'cache-control': 'public, max-age=600' });
		return json({ ...fresh, source: 'live' });
	} catch (e) {
		// Stale data beats no data — the picker still works on yesterday's history.
		if (cached) return json({ ...cached, source: 'stale' });
		throw error(502, `Could not reach the results source: ${(e as Error).message}`);
	}
};
