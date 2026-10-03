import { describe, expect, it } from 'vitest';
import { analyse, bonusHistory, pairCounts, pool, type Band } from '$lib/stats';
import { avg, fixture } from './helpers';

const draws = fixture('lotto-max');
const MAX = 52;
const a = analyse(draws, MAX, 200);

describe('analyse', () => {
	it('respects the window and reports what was available', () => {
		expect(a.window).toBe(200);
		expect(a.available).toBe(draws.length);
	});

	it('gives every number a stat', () => {
		expect(a.stats).toHaveLength(MAX);
		expect(a.byNumber.size).toBe(MAX);
	});

	it('counts draws × picks in total', () => {
		expect(a.stats.reduce((s, x) => s + x.count, 0)).toBe(200 * 7);
	});

	it('ranks are a permutation of 1..max', () => {
		expect(new Set(a.stats.map((s) => s.freqRank)).size).toBe(MAX);
		expect(new Set(a.stats.map((s) => s.gapRank)).size).toBe(MAX);
	});

	it('gap equals draws since the number last appeared', () => {
		const used = draws.slice(0, 200);
		for (const s of a.stats) {
			const truth = used.findIndex((d) => d.numbers.includes(s.n));
			expect(s.gap, `number ${s.n}`).toBe(truth === -1 ? 200 : truth);
		}
	});

	it('hot by frequency out-draws cold by frequency', () => {
		const hot = avg(pool(a, 'freq', 'hot').map((n) => a.byNumber.get(n)!.count));
		const cold = avg(pool(a, 'freq', 'cold').map((n) => a.byNumber.get(n)!.count));
		expect(hot).toBeGreaterThan(cold);
	});

	it('cold by gap is more overdue than hot by gap', () => {
		const hot = avg(pool(a, 'gap', 'hot').map((n) => a.byNumber.get(n)!.gap));
		const cold = avg(pool(a, 'gap', 'cold').map((n) => a.byNumber.get(n)!.gap));
		expect(cold).toBeGreaterThan(hot);
	});

	it.each(['freq', 'gap'] as const)('%s bands partition the range', (metric) => {
		const sizes = (['hot', 'regular', 'cold'] as Band[]).map((b) => pool(a, metric, b).length);
		expect(sizes.reduce((s, x) => s + x, 0)).toBe(MAX);
	});

	it('clamps a window larger than the history, and a window below 1', () => {
		expect(analyse(draws.slice(0, 10), MAX, 500).window).toBe(10);
		expect(analyse(draws, MAX, 0).window).toBe(1);
	});

	it('treats unseen numbers as the most overdue, and ignores out-of-range values', () => {
		const tiny = analyse([{ date: '', numbers: [1, 2, 99], bonus: null }], 5, 10);
		expect(tiny.byNumber.get(1)).toMatchObject({ count: 1, gap: 0 });
		expect(tiny.byNumber.get(5)).toMatchObject({ count: 0, gap: 1 });
		// Ties break by number, so the seen numbers land at the hot end and the
		// lowest unseen number at the overdue end.
		expect(tiny.byNumber.get(2)!.gapBand).toBe('hot');
		expect(tiny.byNumber.get(3)!.gapBand).toBe('cold');
		expect(tiny.stats.reduce((s, x) => s + x.count, 0)).toBe(2);
	});
});


describe('pairCounts', () => {
	it('counts each pair once per shared draw, symmetrically', () => {
		const t = pairCounts(
			[
				{ date: '', numbers: [1, 2, 3], bonus: null },
				{ date: '', numbers: [1, 2, 4], bonus: null },
				{ date: '', numbers: [3, 4, 5], bonus: null }
			],
			5,
			10
		);
		expect(t[1][2]).toBe(2);
		expect(t[2][1]).toBe(2);
		expect(t[1][3]).toBe(1);
		expect(t[1][5]).toBe(0);
		expect(t[3][3]).toBe(0);
	});

	it('only looks inside the window', () => {
		const h = [
			{ date: '', numbers: [1, 2], bonus: null },
			{ date: '', numbers: [3, 4], bonus: null }
		];
		expect(pairCounts(h, 4, 1)[3][4]).toBe(0);
		expect(pairCounts(h, 4, 2)[3][4]).toBe(1);
	});

	it('totals C(pick, 2) per draw on real history', () => {
		const t = pairCounts(draws, MAX, 100);
		let total = 0;
		for (let i = 1; i <= MAX; i++) for (let j = i + 1; j <= MAX; j++) total += t[i][j];
		expect(total).toBe(100 * 21);
	});
});

describe('bonusHistory', () => {
	const dg = fixture('daily-grand');
	const grand = bonusHistory(dg);

	it('keeps every draw with a bonus as a one-number draw', () => {
		expect(grand).toHaveLength(dg.length);
		for (const d of grand) {
			expect(d.numbers).toHaveLength(1);
			expect(d.numbers[0]).toBeGreaterThanOrEqual(1);
			expect(d.numbers[0]).toBeLessThanOrEqual(7);
		}
	});

	it('drops draws without a bonus', () => {
		expect(bonusHistory([{ date: '', numbers: [1], bonus: null }])).toEqual([]);
	});

	it('analyses as a 7-number pool with one count per draw', () => {
		const g = analyse(grand, 7, 200);
		expect(g.stats).toHaveLength(7);
		expect(g.stats.reduce((s, x) => s + x.count, 0)).toBe(200);
		expect(g.stats.every((s) => s.count > 0)).toBe(true);
	});
});
