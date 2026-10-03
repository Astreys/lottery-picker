import type { Draw } from './parse';

export type Band = 'hot' | 'regular' | 'cold';

export interface NumberStat {
	n: number;
	/** Times drawn inside the analysis window. */
	count: number;
	/** Draws since it last appeared. `window` means "not seen in the window". */
	gap: number;
	/** Rank 1..max by frequency, 1 = most frequent. */
	freqRank: number;
	/** Rank 1..max by gap, 1 = most overdue. */
	gapRank: number;
	/** Band by frequency: top third hot, bottom third cold. */
	freqBand: Band;
	/** Band by gap: longest third overdue (cold), shortest third hot. */
	gapBand: Band;
}

export interface Analysis {
	/** Draws actually used, newest first. */
	window: number;
	/** Total draws available before windowing. */
	available: number;
	stats: NumberStat[];
	/** Convenience index: stats keyed by number. */
	byNumber: Map<number, NumberStat>;
}

/**
 * Split a ranked list into thirds. Ties are not broken specially — a number
 * sitting on a boundary lands in whichever third its rank puts it, which is
 * good enough for a personal picker and keeps the bands evenly sized.
 */
function band(rank: number, total: number): Band {
	const third = total / 3;
	if (rank <= third) return 'hot';
	if (rank > total - third) return 'cold';
	return 'regular';
}

/**
 * Compute frequency and recency for every number in the game.
 *
 * @param draws  Full history, newest first.
 * @param max    Numbers run 1..max.
 * @param window How many of the most recent draws to analyse.
 */
export function analyse(draws: Draw[], max: number, window: number): Analysis {
	const used = draws.slice(0, Math.max(1, Math.min(window, draws.length)));

	const count = new Map<number, number>();
	const gap = new Map<number, number>();
	for (let n = 1; n <= max; n++) {
		count.set(n, 0);
		// Unseen numbers are treated as one draw older than the whole window,
		// so they sort as the most overdue rather than as the most recent.
		gap.set(n, used.length);
	}

	used.forEach((draw, index) => {
		for (const n of draw.numbers) {
			if (n < 1 || n > max) continue;
			count.set(n, (count.get(n) ?? 0) + 1);
			// `used` is newest first, so the first sighting is the smallest gap.
			if (gap.get(n) === used.length) gap.set(n, index);
		}
	});

	const all = Array.from({ length: max }, (_, i) => i + 1);

	const byFreq = [...all].sort((a, b) => count.get(b)! - count.get(a)! || a - b);
	const byGap = [...all].sort((a, b) => gap.get(b)! - gap.get(a)! || a - b);

	const freqRank = new Map(byFreq.map((n, i) => [n, i + 1]));
	const gapRank = new Map(byGap.map((n, i) => [n, i + 1]));

	const stats: NumberStat[] = all.map((n) => ({
		n,
		count: count.get(n)!,
		gap: gap.get(n)!,
		freqRank: freqRank.get(n)!,
		gapRank: gapRank.get(n)!,
		freqBand: band(freqRank.get(n)!, max),
		// Rank 1 by gap is the most overdue, which is the *cold* end.
		gapBand: band(max + 1 - gapRank.get(n)!, max)
	}));

	return {
		window: used.length,
		available: draws.length,
		stats,
		byNumber: new Map(stats.map((s) => [s.n, s]))
	};
}

/** Numbers falling in a given band under a given metric. */
export function pool(a: Analysis, metric: 'freq' | 'gap', b: Band): number[] {
	const key = metric === 'freq' ? 'freqBand' : 'gapBand';
	return a.stats.filter((s) => s[key] === b).map((s) => s.n);
}

/**
 * How often each pair of numbers was drawn together inside the window.
 * `table[a][b] === table[b][a]`; row and column 0 are unused so numbers index
 * directly.
 */
export type PairTable = number[][];

export function pairCounts(draws: Draw[], max: number, window: number): PairTable {
	const used = draws.slice(0, Math.max(1, Math.min(window, draws.length)));
	const table = Array.from({ length: max + 1 }, () => new Array<number>(max + 1).fill(0));
	for (const draw of used) {
		const ns = draw.numbers.filter((n) => n >= 1 && n <= max);
		for (let i = 0; i < ns.length; i++) {
			for (let j = i + 1; j < ns.length; j++) {
				table[ns[i]][ns[j]]++;
				table[ns[j]][ns[i]]++;
			}
		}
	}
	return table;
}

/**
 * Recast a history as a one-number-per-draw history over the bonus pool, so
 * the same frequency/recency machinery can analyse it. Used by games whose
 * extra ball has its own pool — Daily Grand's grand number is 1–7, drawn
 * independently of the five main numbers.
 */
export function bonusHistory(draws: Draw[]): Draw[] {
	return draws
		.filter((d) => d.bonus !== null)
		.map((d) => ({ date: d.date, numbers: [d.bonus as number], bonus: null }));
}
