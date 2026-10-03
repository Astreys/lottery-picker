import { describe, expect, it } from 'vitest';
import { GAMES, byId } from '$lib/games';
import { DESCRIPTION, structuredData } from '$lib/seo';

describe('GAMES', () => {
	it('has unique ids and sources', () => {
		expect(new Set(GAMES.map((g) => g.id)).size).toBe(GAMES.length);
		expect(new Set(GAMES.map((g) => g.source)).size).toBe(GAMES.length);
	});

	it('has sane rules for every game', () => {
		for (const g of GAMES) {
			expect(g.pick, g.id).toBeGreaterThan(0);
			expect(g.max, g.id).toBeGreaterThan(g.pick);
			expect(g.source, g.id).toMatch(/\.asp$/);
			// A separate bonus pool only makes sense with a label to show it under.
			if (g.bonusMax !== null) expect(g.bonusLabel, g.id).toBeTruthy();
		}
	});

	it('only Daily Grand has its own bonus pool, 1–7', () => {
		expect(GAMES.filter((g) => g.bonusMax !== null).map((g) => [g.id, g.bonusMax])).toEqual([
			['daily-grand', 7]
		]);
	});

	it('byId finds a game and returns undefined for anything else', () => {
		expect(byId('lotto-649')?.name).toBe('Lotto 6/49');
		expect(byId('nope')).toBeUndefined();
	});
});

describe('structuredData', () => {
	const data = structuredData('https://picker.example');

	it('describes the app on the given origin', () => {
		expect(data['@type']).toBe('WebApplication');
		expect(data.url).toBe('https://picker.example');
		expect(data.description).toBe(DESCRIPTION);
	});

	it('lists every game', () => {
		expect(data.featureList).toHaveLength(GAMES.length);
		expect(data.featureList).toContain('Lotto Max (7 of 52)');
	});

	it('mentions every game in the description', () => {
		for (const g of GAMES) expect(DESCRIPTION).toContain(g.name);
	});
});
