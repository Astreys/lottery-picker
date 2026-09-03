import type { Analysis, Band } from './stats';
import { pool } from './stats';

export type Metric = 'freq' | 'gap';

export interface Recipe {
	hot: number;
	regular: number;
	cold: number;
}

/** Which band an extra ball should be drawn from. `any` ignores the bands. */
export type BandChoice = Band | 'any';

export interface BonusOptions {
	/** Analysis of the bonus pool alone — see `bonusHistory`. */
	analysis: Analysis;
	choice: BandChoice;
}

export interface Pick {
	numbers: number[];
	/** Which band each number came from, parallel to `numbers`. */
	bands: Band[];
	/** The extra ball, for games that draw one from its own pool. */
	grand: number | null;
	grandBand: Band | null;
	/** How many fell in the lower half of the range. */
	low: number;
	/** How many are odd. */
	odd: number;
	/** Sum of the numbers — a quick sanity check against wildly skewed sets. */
	sum: number;
}

/** Fisher–Yates on a copy, then take the first k. */
function sample<T>(items: T[], k: number): T[] {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy.slice(0, k);
}

/**
 * Split `total` across hot/regular/cold as evenly as the recipe allows.
 * Used to seed the default recipe for a game.
 */
export function defaultRecipe(total: number): Recipe {
	const base = Math.floor(total / 3);
	const extra = total - base * 3;
	// Spare slots go to regular first, then hot — regular is the widest pool.
	return {
		hot: base + (extra > 1 ? 1 : 0),
		regular: base + (extra > 0 ? 1 : 0),
		cold: base
	};
}

/**
 * Build one set. Pools are drawn without replacement; if a band cannot supply
 * its quota (a very short window, or a lopsided recipe) the shortfall is taken
 * from whatever numbers remain, so a pick is always the full length.
 */
export function generate(
	analysis: Analysis,
	metric: Metric,
	recipe: Recipe,
	max: number,
	bonus?: BonusOptions
): Pick {
	const chosen: number[] = [];
	const bandOf = new Map<number, Band>();

	const order: [Band, number][] = [
		['hot', recipe.hot],
		['cold', recipe.cold],
		['regular', recipe.regular]
	];

	for (const [b, quota] of order) {
		if (quota <= 0) continue;
		const available = pool(analysis, metric, b).filter((n) => !chosen.includes(n));
		for (const n of sample(available, quota)) {
			chosen.push(n);
			bandOf.set(n, b);
		}
	}

	const target = recipe.hot + recipe.regular + recipe.cold;
	if (chosen.length < target) {
		const rest = analysis.stats.map((s) => s.n).filter((n) => !chosen.includes(n));
		for (const n of sample(rest, target - chosen.length)) {
			chosen.push(n);
			bandOf.set(n, 'regular');
		}
	}

	const numbers = chosen.sort((a, b) => a - b);
	const mid = Math.ceil(max / 2);
	const extra = bonus ? drawBonus(bonus, metric) : null;

	return {
		numbers,
		bands: numbers.map((n) => bandOf.get(n)!),
		grand: extra?.n ?? null,
		grandBand: extra?.band ?? null,
		low: numbers.filter((n) => n <= mid).length,
		odd: numbers.filter((n) => n % 2 === 1).length,
		sum: numbers.reduce((a, b) => a + b, 0)
	};
}

/**
 * Draw the extra ball from its own pool. Bands here are thin — Daily Grand's
 * grand number has only seven candidates — so an empty band falls back to the
 * whole pool rather than returning nothing.
 */
function drawBonus(bonus: BonusOptions, metric: Metric): { n: number; band: Band } {
	const all = bonus.analysis.stats.map((s) => s.n);
	const banded = bonus.choice === 'any' ? all : pool(bonus.analysis, metric, bonus.choice);
	const n = sample(banded.length ? banded : all, 1)[0];
	const stat = bonus.analysis.byNumber.get(n)!;
	return { n, band: metric === 'freq' ? stat.freqBand : stat.gapBand };
}

/** Generate several distinct sets. Falls back to fewer if the pools are tiny. */
export function generateMany(
	analysis: Analysis,
	metric: Metric,
	recipe: Recipe,
	max: number,
	lines: number,
	bonus?: BonusOptions
): Pick[] {
	const out: Pick[] = [];
	const seen = new Set<string>();
	// Bounded so a degenerate recipe (tiny pools, many lines) cannot spin.
	for (let attempt = 0; attempt < lines * 40 && out.length < lines; attempt++) {
		const p = generate(analysis, metric, recipe, max, bonus);
		// Two lines with the same mains but a different grand number are
		// different tickets, so the grand number is part of the identity.
		const key = `${p.numbers.join(',')}|${p.grand ?? ''}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(p);
	}
	return out;
}
