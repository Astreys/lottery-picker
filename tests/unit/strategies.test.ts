import { describe, expect, it } from 'vitest';
import { analyse, bonusHistory, pairCounts, pool } from '$lib/stats';
import {
	STRATEGIES,
	defaultRecipe,
	isBalanced,
	pickMany,
	pickSet,
	type Pick,
	type Plan,
	type Strategy
} from '$lib/picker';
import { fixture } from './helpers';

const draws = fixture('lotto-max');
const MAX = 52;
const a = analyse(draws, MAX, 200);
const ALL: Strategy[] = ['bands', 'weighted', 'pairs', 'random'];

const plan = (over: Partial<Plan> = {}): Plan => ({
	strategy: 'bands',
	metric: 'freq',
	recipe: defaultRecipe(7),
	pick: 7,
	max: MAX,
	pairs: pairCounts(draws, MAX, 200),
	...over
});

function expectValid(p: Pick, k: number, max: number) {
	expect(p.numbers).toHaveLength(k);
	expect(new Set(p.numbers).size).toBe(k);
	expect(p.numbers.every((n) => n >= 1 && n <= max)).toBe(true);
	expect(p.numbers).toEqual([...p.numbers].sort((x, y) => x - y));
	expect(p.bands).toHaveLength(k);
	expect(p.sum).toBe(p.numbers.reduce((s, n) => s + n, 0));
	expect(p.odd).toBe(p.numbers.filter((n) => n % 2).length);
	expect(p.low).toBe(p.numbers.filter((n) => n <= Math.ceil(max / 2)).length);
}

/** How many of `runs` sets' numbers fall in each of two pools. */
function tally(p: Plan, runs: number, x: Set<number>, y: Set<number>) {
	let inX = 0;
	let inY = 0;
	for (let i = 0; i < runs; i++) {
		for (const n of pickSet(a, p).numbers) {
			if (x.has(n)) inX++;
			if (y.has(n)) inY++;
		}
	}
	return [inX, inY];
}

describe('STRATEGIES', () => {
	it('lists every strategy once, with a label and a blurb', () => {
		expect(STRATEGIES.map((s) => s.id).sort()).toEqual([...ALL].sort());
		for (const s of STRATEGIES) {
			expect(s.label).toBeTruthy();
			expect(s.blurb).toBeTruthy();
		}
	});

	it('puts the original band picker first, as the default', () => {
		expect(STRATEGIES[0].id).toBe('bands');
	});
});

describe('pickSet', () => {
	it.each(ALL)('%s builds valid sets', (strategy) => {
		for (let i = 0; i < 500; i++) expectValid(pickSet(a, plan({ strategy })), 7, MAX);
	});

	it.each(['weighted', 'pairs', 'random'] as const)('%s colours each ball by the band it sits in', (strategy) => {
		for (const metric of ['freq', 'gap'] as const) {
			const p = pickSet(a, plan({ strategy, metric }));
			p.numbers.forEach((n, j) => {
				const s = a.byNumber.get(n)!;
				expect(p.bands[j]).toBe(metric === 'freq' ? s.freqBand : s.gapBand);
			});
		}
	});

	it('bands uses the recipe; the others use plan.pick and ignore it', () => {
		const odd = { hot: 1, regular: 1, cold: 1 };
		expect(pickSet(a, plan({ strategy: 'bands', recipe: odd })).numbers).toHaveLength(3);
		for (const strategy of ['weighted', 'pairs', 'random'] as const) {
			expect(pickSet(a, plan({ strategy, recipe: odd })).numbers).toHaveLength(7);
		}
	});

	it('weighted by frequency favours hot numbers', () => {
		const [hot, cold] = tally(
			plan({ strategy: 'weighted' }),
			3000,
			new Set(pool(a, 'freq', 'hot')),
			new Set(pool(a, 'freq', 'cold'))
		);
		expect(hot).toBeGreaterThan(cold);
	});

	it('weighted by gap favours overdue numbers', () => {
		const [overdue, recent] = tally(
			plan({ strategy: 'weighted', metric: 'gap' }),
			3000,
			new Set(pool(a, 'gap', 'cold')),
			new Set(pool(a, 'gap', 'hot'))
		);
		expect(overdue).toBeGreaterThan(recent);
	});

	it('weighted can still pick a number never drawn in the window', () => {
		// In a one-draw window, 45 of 52 numbers have a count of zero.
		const tiny = analyse(draws, MAX, 1);
		const unseen = new Set(tiny.stats.filter((s) => s.count === 0).map((s) => s.n));
		let hits = 0;
		for (let i = 0; i < 200; i++) {
			hits += pickSet(tiny, plan({ strategy: 'weighted' })).numbers.filter((n) => unseen.has(n)).length;
		}
		expect(hits).toBeGreaterThan(0);
	});

	it('companions always include a hot number', () => {
		const hot = new Set(pool(a, 'freq', 'hot'));
		for (let i = 0; i < 300; i++) {
			expect(pickSet(a, plan({ strategy: 'pairs' })).numbers.some((n) => hot.has(n))).toBe(true);
		}
	});

	it('companions follow the pair table', () => {
		// 1–4 are only ever drawn together; 5–10 never appear.
		const history = Array.from({ length: 30 }, () => ({ date: '', numbers: [1, 2, 3, 4], bonus: null }));
		const t = analyse(history, 10, 30);
		const pairs = pairCounts(history, 10, 30);
		let together = 0;
		for (let i = 0; i < 300; i++) {
			const p = pickSet(t, plan({ strategy: 'pairs', pick: 4, max: 10, pairs }));
			if (p.numbers.join() === '1,2,3,4') together++;
		}
		expect(together).toBeGreaterThan(250);
	});

	it('companions refuse to run without a pair table', () => {
		expect(() => pickSet(a, plan({ strategy: 'pairs', pairs: undefined }))).toThrow(/pair table/);
	});

	it('quick pick reaches the whole range', () => {
		const seen = new Set<number>();
		for (let i = 0; i < 3000; i++) pickSet(a, plan({ strategy: 'random' })).numbers.forEach((n) => seen.add(n));
		expect(seen.size).toBe(MAX);
	});

	it.each(ALL)('%s carries the Daily Grand number through', (strategy) => {
		const dg = fixture('daily-grand');
		const main = analyse(dg, 49, 100);
		const grand = analyse(bonusHistory(dg), 7, 100);
		const p = pickSet(main, {
			strategy,
			metric: 'freq',
			recipe: defaultRecipe(5),
			pick: 5,
			max: 49,
			pairs: pairCounts(dg, 49, 100),
			bonus: { analysis: grand, choice: 'any' }
		});
		expectValid(p, 5, 49);
		expect(p.grand).toBeGreaterThanOrEqual(1);
		expect(p.grand).toBeLessThanOrEqual(7);
	});
});

describe('pickMany', () => {
	it.each(ALL)('%s returns the requested number of distinct sets', (strategy) => {
		const sets = pickMany(a, plan({ strategy }), 8);
		expect(sets).toHaveLength(8);
		expect(new Set(sets.map((p) => p.numbers.join())).size).toBe(8);
	});
});

describe('balance', () => {
	const make = (numbers: number[], max = 52): Pick => ({
		numbers,
		bands: numbers.map(() => 'regular'),
		grand: null,
		grandBand: null,
		odd: numbers.filter((n) => n % 2).length,
		low: numbers.filter((n) => n <= Math.ceil(max / 2)).length,
		sum: 0
	});

	it('accepts 3/4 and 4/3 splits of seven', () => {
		expect(isBalanced(make([1, 2, 3, 4, 30, 31, 32]))).toBe(true);
		expect(isBalanced(make([1, 2, 3, 30, 31, 32, 34]))).toBe(true);
	});

	it('rejects odd-heavy or low-heavy sets', () => {
		expect(isBalanced(make([1, 3, 5, 27, 29, 31, 33]))).toBe(false);
		expect(isBalanced(make([1, 2, 3, 4, 5, 6, 40]))).toBe(false);
	});

	it('requires exactly 3/3 for six numbers', () => {
		expect(isBalanced(make([1, 2, 3, 30, 31, 32], 49))).toBe(true);
		expect(isBalanced(make([1, 2, 4, 30, 32, 34], 49))).toBe(false);
	});

	it.each(ALL)('%s honours balanced', (strategy) => {
		for (let i = 0; i < 200; i++) {
			expect(isBalanced(pickSet(a, plan({ strategy, balanced: true })))).toBe(true);
		}
	});

	it('returns a full set anyway when balance is impossible', () => {
		// Only 1, 3 and 5 were ever drawn, so the hot band is exactly those three
		// and an all-hot set of three is always all odd.
		const t = analyse([{ date: '', numbers: [1, 3, 5], bonus: null }], 9, 1);
		const p = pickSet(
			t,
			plan({ strategy: 'bands', recipe: { hot: 3, regular: 0, cold: 0 }, max: 9, balanced: true })
		);
		expect(p.numbers).toEqual([1, 3, 5]);
		expect(isBalanced(p)).toBe(false);
	});
});
