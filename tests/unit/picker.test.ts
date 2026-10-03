import { describe, expect, it } from 'vitest';
import { analyse, bonusHistory, pairCounts, pool } from '$lib/stats';
import {
	STRATEGIES,
	defaultRecipe,
	formatPick,
	formatPicks,
	generate,
	generateMany,
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
const recipe = defaultRecipe(7);

const plan = (over: Partial<Plan> = {}): Plan => ({
	strategy: 'bands',
	metric: 'freq',
	recipe,
	pick: 7,
	max: MAX,
	pairs: pairCounts(draws, MAX, 200),
	...over
});

/** Shape every pick must have, whichever strategy made it. */
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

describe('defaultRecipe', () => {
	it.each([
		[5, { hot: 2, regular: 2, cold: 1 }],
		[6, { hot: 2, regular: 2, cold: 2 }],
		[7, { hot: 2, regular: 3, cold: 2 }]
	])('splits %i evenly, regular first', (total, expected) => {
		expect(defaultRecipe(total)).toEqual(expected);
	});
});

describe('generate (bands)', () => {
	it('3000 picks: right length, unique, in range, sorted, recipe honoured', () => {
		for (let i = 0; i < 3000; i++) {
			const p = generate(a, 'freq', recipe, MAX);
			expectValid(p, 7, MAX);
			expect(p.bands.filter((b) => b === 'hot')).toHaveLength(recipe.hot);
			expect(p.bands.filter((b) => b === 'cold')).toHaveLength(recipe.cold);
		}
	});

	it('draws each number from the band it is labelled with', () => {
		for (let i = 0; i < 200; i++) {
			const p = generate(a, 'gap', recipe, MAX);
			p.numbers.forEach((n, j) => expect(a.byNumber.get(n)!.gapBand).toBe(p.bands[j]));
		}
	});

	it('can reach every number over many picks', () => {
		const seen = new Set<number>();
		for (let i = 0; i < 20000; i++) generate(a, 'freq', recipe, MAX).numbers.forEach((n) => seen.add(n));
		expect(seen.size).toBe(MAX);
	});

	it('fills a lopsided recipe from the rest of the range', () => {
		const sets = generateMany(a, 'gap', { hot: 7, regular: 0, cold: 0 }, MAX, 20);
		expect(sets.length).toBeGreaterThan(0);
		sets.forEach((p) => expectValid(p, 7, MAX));
	});

	it('copes with a window of one draw', () => {
		expectValid(generate(analyse(draws, MAX, 1), 'freq', recipe, MAX), 7, MAX);
	});

	it('has no grand number without bonus options', () => {
		const p = generate(a, 'freq', recipe, MAX);
		expect(p.grand).toBeNull();
		expect(p.grandBand).toBeNull();
	});
});

describe('generateMany', () => {
	it('returns distinct sets', () => {
		const many = generateMany(a, 'freq', recipe, MAX, 10);
		expect(many).toHaveLength(10);
		expect(new Set(many.map((p) => p.numbers.join())).size).toBe(10);
	});

	it('stops short rather than spinning when distinct sets run out', () => {
		// 3 numbers, pick 3: only one possible set.
		const t = analyse([{ date: '', numbers: [1, 2, 3], bonus: null }], 3, 1);
		expect(generateMany(t, 'freq', { hot: 1, regular: 1, cold: 1 }, 3, 5)).toHaveLength(1);
	});
});

describe('Daily Grand: 5 of 49 plus a grand number from its own 1–7 pool', () => {
	const dg = fixture('daily-grand');
	const main = analyse(dg, 49, 200);
	const grand = analyse(bonusHistory(dg), 7, 200);
	const rec = defaultRecipe(5);

	it('picks 5 mains and a grand number in 1–7, reaching all seven', () => {
		const seen = new Set<number>();
		for (let i = 0; i < 3000; i++) {
			const p = generate(main, 'freq', rec, 49, { analysis: grand, choice: 'any' });
			expectValid(p, 5, 49);
			expect(p.grand).toBeGreaterThanOrEqual(1);
			expect(p.grand).toBeLessThanOrEqual(7);
			expect(p.grandBand).not.toBeNull();
			seen.add(p.grand!);
		}
		expect(seen.size).toBe(7);
	});

	it.each(['hot', 'regular', 'cold'] as const)('grand band "%s" only draws from that band', (choice) => {
		const wanted = new Set(pool(grand, 'freq', choice));
		for (let i = 0; i < 500; i++) {
			const p = generate(main, 'freq', rec, 49, { analysis: grand, choice });
			expect(wanted.has(p.grand!)).toBe(true);
		}
	});

	it('treats a different grand number as a different ticket', () => {
		const sets = generateMany(main, 'freq', rec, 49, 8, { analysis: grand, choice: 'any' });
		expect(sets).toHaveLength(8);
		expect(sets.every((p) => p.grand !== null)).toBe(true);
	});
});

describe('strategies', () => {
	it('lists every strategy once, with a label and a blurb', () => {
		const ids: Strategy[] = ['bands', 'weighted', 'pairs', 'random'];
		expect(STRATEGIES.map((s) => s.id).sort()).toEqual([...ids].sort());
		STRATEGIES.forEach((s) => {
			expect(s.label).toBeTruthy();
			expect(s.blurb).toBeTruthy();
		});
	});

	it.each(['bands', 'weighted', 'pairs', 'random'] as const)('%s builds valid sets', (strategy) => {
		for (let i = 0; i < 500; i++) {
			const p = pickSet(a, plan({ strategy }));
			expectValid(p, 7, MAX);
			// Non-band strategies colour each ball by the band it happens to sit in.
			p.numbers.forEach((n, j) => {
				if (strategy !== 'bands') expect(a.byNumber.get(n)!.freqBand).toBe(p.bands[j]);
			});
		}
	});

	it('non-band strategies use plan.pick and ignore the recipe', () => {
		const p = pickSet(a, plan({ strategy: 'random', recipe: { hot: 1, regular: 0, cold: 0 } }));
		expect(p.numbers).toHaveLength(7);
	});

	it('weighted by frequency favours hot numbers', () => {
		const hot = new Set(pool(a, 'freq', 'hot'));
		const cold = new Set(pool(a, 'freq', 'cold'));
		let h = 0;
		let c = 0;
		for (let i = 0; i < 4000; i++) {
			for (const n of pickSet(a, plan({ strategy: 'weighted' })).numbers) {
				if (hot.has(n)) h++;
				if (cold.has(n)) c++;
			}
		}
		expect(h).toBeGreaterThan(c);
	});

	it('weighted by gap favours overdue numbers', () => {
		const overdue = new Set(pool(a, 'gap', 'cold'));
		const recent = new Set(pool(a, 'gap', 'hot'));
		let o = 0;
		let r = 0;
		for (let i = 0; i < 4000; i++) {
			for (const n of pickSet(a, plan({ strategy: 'weighted', metric: 'gap' })).numbers) {
				if (overdue.has(n)) o++;
				if (recent.has(n)) r++;
			}
		}
		expect(o).toBeGreaterThan(r);
	});

	it('companions always start from a hot number when one exists', () => {
		const hot = new Set(pool(a, 'freq', 'hot'));
		for (let i = 0; i < 300; i++) {
			const p = pickSet(a, plan({ strategy: 'pairs' }));
			expect(p.numbers.some((n) => hot.has(n))).toBe(true);
		}
	});

	it('companions follow the pair table', () => {
		// 1 has only ever been drawn with 2, 3 and 4; 5–10 never with anything.
		const history = Array.from({ length: 30 }, () => ({ date: '', numbers: [1, 2, 3, 4], bonus: null }));
		const t = analyse(history, 10, 30);
		const pairs = pairCounts(history, 10, 30);
		let together = 0;
		for (let i = 0; i < 300; i++) {
			const p = pickSet(t, { ...plan(), strategy: 'pairs', pick: 4, max: 10, pairs });
			if (p.numbers.join() === '1,2,3,4') together++;
		}
		expect(together).toBeGreaterThan(250);
	});

	it('companions refuse to run without a pair table', () => {
		expect(() => pickSet(a, plan({ strategy: 'pairs', pairs: undefined }))).toThrow(/pair table/);
	});

	it('random reaches the whole range', () => {
		const seen = new Set<number>();
		for (let i = 0; i < 3000; i++) pickSet(a, plan({ strategy: 'random' })).numbers.forEach((n) => seen.add(n));
		expect(seen.size).toBe(MAX);
	});

	it('every strategy carries the grand number through', () => {
		const dg = fixture('daily-grand');
		const main = analyse(dg, 49, 100);
		const grand = analyse(bonusHistory(dg), 7, 100);
		for (const s of STRATEGIES) {
			const p = pickSet(main, {
				...plan({ strategy: s.id, pick: 5, max: 49, recipe: defaultRecipe(5) }),
				pairs: pairCounts(dg, 49, 100),
				bonus: { analysis: grand, choice: 'any' }
			});
			expectValid(p, 5, 49);
			expect(p.grand).not.toBeNull();
		}
	});

	it('pickMany returns distinct sets for every strategy', () => {
		for (const s of STRATEGIES) {
			const sets = pickMany(a, plan({ strategy: s.id }), 8);
			expect(sets).toHaveLength(8);
			expect(new Set(sets.map((p) => p.numbers.join())).size).toBe(8);
		}
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

	it('accepts 3/4 and 4/3 splits for seven numbers', () => {
		expect(isBalanced(make([1, 2, 3, 4, 30, 31, 32]))).toBe(true);
		expect(isBalanced(make([1, 2, 3, 30, 31, 32, 34]))).toBe(true);
	});

	it('rejects odd-heavy or low-heavy sets', () => {
		expect(isBalanced(make([1, 3, 5, 27, 29, 31, 33]))).toBe(false);
		expect(isBalanced(make([1, 2, 3, 4, 5, 6, 40]))).toBe(false);
	});

	it('requires an exact 3/3 split for six numbers', () => {
		expect(isBalanced(make([1, 2, 3, 30, 31, 32], 49))).toBe(true);
		expect(isBalanced(make([1, 2, 4, 30, 32, 34], 49))).toBe(false);
	});

	it.each(['bands', 'weighted', 'pairs', 'random'] as const)('%s honours balanced', (strategy) => {
		for (let i = 0; i < 200; i++) {
			expect(isBalanced(pickSet(a, plan({ strategy, balanced: true })))).toBe(true);
		}
	});

	it('gives up gracefully when balance is impossible', () => {
		// Only odd numbers ever drawn and only 1..3 exist → cannot balance 3 numbers.
		const t = analyse([{ date: '', numbers: [1, 3], bonus: null }], 3, 1);
		const p = pickSet(t, { ...plan(), strategy: 'random', pick: 3, max: 3, balanced: true });
		expectValid(p, 3, 3);
	});
});

describe('formatting', () => {
	const base = { bands: [], grandBand: null, low: 0, odd: 0, sum: 0 } as const;

	it('joins numbers with " - "', () => {
		expect(formatPick({ ...base, numbers: [11, 23, 24, 27, 38, 49], grand: null, bands: [] })).toBe(
			'11 - 23 - 24 - 27 - 38 - 49'
		);
	});

	it('appends the grand number with " + "', () => {
		expect(formatPick({ ...base, numbers: [3, 9, 15, 30, 41], grand: 6, bands: [] })).toBe(
			'3 - 9 - 15 - 30 - 41 + 6'
		);
	});

	it('puts one set per line', () => {
		const picks = [
			{ ...base, numbers: [1, 2, 3], grand: null, bands: [] },
			{ ...base, numbers: [4, 5, 6], grand: null, bands: [] }
		];
		expect(formatPicks(picks)).toBe('1 - 2 - 3\n4 - 5 - 6');
		expect(formatPicks([])).toBe('');
	});
});
