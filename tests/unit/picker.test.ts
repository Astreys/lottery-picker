import { describe, expect, it } from 'vitest';
import { analyse, bonusHistory, pool } from '$lib/stats';
import {
	defaultRecipe,
	formatPick,
	formatPicks,
	generate,
	generateMany,
	type Pick
} from '$lib/picker';
import { fixture } from './helpers';

const draws = fixture('lotto-max');
const MAX = 52;
const a = analyse(draws, MAX, 200);
const recipe = defaultRecipe(7);

/** Shape every pick must have. */
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

describe('generate', () => {
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

	it('tops up from the other numbers when a band is too small for its quota', () => {
		// 1..9 splits into bands of three, so five hot numbers cannot all be hot.
		const t = analyse(draws.map((d) => ({ ...d, numbers: d.numbers.filter((n) => n <= 9) })), 9, 50);
		for (let i = 0; i < 200; i++) {
			const p = generate(t, 'freq', { hot: 5, regular: 0, cold: 0 }, 9);
			expectValid(p, 5, 9);
			expect(p.bands.filter((b) => b === 'hot')).toHaveLength(3);
			expect(p.bands.filter((b) => b === 'regular')).toHaveLength(2);
		}
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

describe('formatting for the clipboard', () => {
	const pick = (numbers: number[], grand: number | null = null): Pick => ({
		numbers,
		bands: [],
		grand,
		grandBand: null,
		low: 0,
		odd: 0,
		sum: 0
	});

	it('joins numbers with " - "', () => {
		expect(formatPick(pick([11, 23, 24, 27, 38, 49]))).toBe('11 - 23 - 24 - 27 - 38 - 49');
	});

	it('appends the grand number with " + "', () => {
		expect(formatPick(pick([3, 9, 15, 30, 41], 6))).toBe('3 - 9 - 15 - 30 - 41 + 6');
	});

	it('puts one set per line', () => {
		expect(formatPicks([pick([1, 2, 3]), pick([4, 5, 6], 7)])).toBe('1 - 2 - 3\n4 - 5 - 6 + 7');
		expect(formatPicks([])).toBe('');
	});
});
