import type { Analysis, Band, PairTable } from './stats';
import { pool } from './stats';

export type Metric = 'freq' | 'gap';

/**
 * How a set is built.
 *
 * - `bands`    — a fixed number from each of the hot, regular and cold bands.
 * - `weighted` — every number is eligible, but its chance scales with how often
 *                it was drawn (frequency) or how long it has been away (overdue).
 * - `pairs`    — start from a hot number, then keep adding the numbers most often
 *                drawn alongside the ones already chosen.
 * - `random`   — a plain quick pick, every number equally likely.
 */
export type Strategy = 'bands' | 'weighted' | 'pairs' | 'random';

export const STRATEGIES: Array<{ id: Strategy; label: string; blurb: string }> = [
	{
		id: 'bands',
		label: 'Hot / cold bands',
		blurb: 'A fixed number from each of the hot, regular and cold bands — you choose the split.'
	},
	{
		id: 'weighted',
		label: 'Weighted',
		blurb:
			'Every number can appear, but the more it was drawn (or the longer it has been away) the likelier it is.'
	},
	{
		id: 'pairs',
		label: 'Companions',
		blurb: 'Starts from a hot number, then adds the numbers most often drawn alongside it.'
	},
	{
		id: 'random',
		label: 'Quick pick',
		blurb: 'Every number equally likely, ignoring the history — what the terminal would give you.'
	}
];

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

/** Everything needed to build a set, whichever strategy is in use. */
export interface Plan {
	strategy: Strategy;
	metric: Metric;
	/** The split used by the `bands` strategy. Its total is the set length. */
	recipe: Recipe;
	/** Set length for every strategy other than `bands`. */
	pick: number;
	max: number;
	/** Reject sets that lean too far odd/even or low/high. */
	balanced?: boolean;
	bonus?: BonusOptions;
	/** Required by the `pairs` strategy — see `pairCounts`. */
	pairs?: PairTable;
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

/** One item, chosen with probability proportional to its weight. */
function weightedOne(items: number[], weight: (n: number) => number): number {
	const weights = items.map(weight);
	const total = weights.reduce((a, b) => a + b, 0);
	if (total <= 0) return sample(items, 1)[0];
	let r = Math.random() * total;
	for (let i = 0; i < items.length; i++) {
		r -= weights[i];
		if (r < 0) return items[i];
	}
	return items[items.length - 1];
}

/** k distinct items, each draw weighted, without replacement. */
function weightedSample(items: number[], k: number, weight: (n: number) => number): number[] {
	const left = [...items];
	const out: number[] = [];
	while (out.length < k && left.length) {
		const n = weightedOne(left, weight);
		out.push(n);
		left.splice(left.indexOf(n), 1);
	}
	return out;
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
 * A set is balanced when neither odd/even nor low/high is more lopsided than
 * the set length allows — 3/4 or 4/3 for seven numbers, 3/3 for six.
 */
export function isBalanced(p: Pick): boolean {
	const k = p.numbers.length;
	const ok = (x: number) => x >= Math.floor(k / 2) && x <= Math.ceil(k / 2);
	return ok(p.odd) && ok(p.low);
}

/** The band a number sits in under the chosen metric. */
function bandFor(analysis: Analysis, metric: Metric, n: number): Band {
	const s = analysis.byNumber.get(n)!;
	return metric === 'freq' ? s.freqBand : s.gapBand;
}

function finish(
	chosen: number[],
	bandOf: (n: number) => Band,
	max: number,
	metric: Metric,
	bonus?: BonusOptions
): Pick {
	const numbers = [...chosen].sort((a, b) => a - b);
	const mid = Math.ceil(max / 2);
	const extra = bonus ? drawBonus(bonus, metric) : null;

	return {
		numbers,
		bands: numbers.map(bandOf),
		grand: extra?.n ?? null,
		grandBand: extra?.band ?? null,
		low: numbers.filter((n) => n <= mid).length,
		odd: numbers.filter((n) => n % 2 === 1).length,
		sum: numbers.reduce((a, b) => a + b, 0)
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

	return finish(chosen, (n) => bandOf.get(n)!, max, metric, bonus);
}

/** Every number eligible, weighted by count (+1 so unseen numbers stay possible) or by gap. */
function weighted(analysis: Analysis, plan: Plan): number[] {
	const all = analysis.stats.map((s) => s.n);
	const k = Math.min(plan.pick, all.length);
	return weightedSample(all, k, (n) => {
		const s = analysis.byNumber.get(n)!;
		return (plan.metric === 'freq' ? s.count : s.gap) + 1;
	});
}

/**
 * Seed with a hot number, then grow the set one number at a time, favouring
 * those that most often shared a draw with everything chosen so far. Squaring
 * the score leans hard towards strong companions while leaving room for chance.
 */
function companions(analysis: Analysis, plan: Plan): number[] {
	const table = plan.pairs;
	if (!table) throw new Error('The pairs strategy needs a pair table');
	const all = analysis.stats.map((s) => s.n);
	const k = Math.min(plan.pick, all.length);
	const hot = pool(analysis, plan.metric, 'hot');
	const chosen = [sample(hot.length ? hot : all, 1)[0]];

	while (chosen.length < k) {
		const left = all.filter((n) => !chosen.includes(n));
		const next = weightedOne(left, (n) => {
			const score = chosen.reduce((s, c) => s + (table[c]?.[n] ?? 0), 0);
			return (score + 1) ** 2;
		});
		chosen.push(next);
	}
	return chosen;
}

/** Build one set with whichever strategy the plan names. */
export function pickSet(analysis: Analysis, plan: Plan): Pick {
	const build = (): Pick => {
		if (plan.strategy === 'bands') {
			return generate(analysis, plan.metric, plan.recipe, plan.max, plan.bonus);
		}
		const chosen =
			plan.strategy === 'weighted'
				? weighted(analysis, plan)
				: plan.strategy === 'pairs'
					? companions(analysis, plan)
					: sample(analysis.stats.map((s) => s.n), plan.pick);
		// These strategies ignore the bands, but colouring each ball by the band
		// it happens to sit in still shows what kind of set came out.
		const bandOf = (n: number) => bandFor(analysis, plan.metric, n);
		return finish(chosen, bandOf, plan.max, plan.metric, plan.bonus);
	};

	if (!plan.balanced) return build();
	// Rejection sampling. Some recipes can never balance (seven hot numbers that
	// all happen to be odd), so give up after a while and keep the last attempt.
	let p = build();
	for (let i = 0; i < 200 && !isBalanced(p); i++) p = build();
	return p;
}

/** Generate several distinct sets. Falls back to fewer if the pools are tiny. */
export function pickMany(analysis: Analysis, plan: Plan, lines: number): Pick[] {
	const out: Pick[] = [];
	const seen = new Set<string>();
	// Bounded so a degenerate recipe (tiny pools, many lines) cannot spin.
	for (let attempt = 0; attempt < lines * 40 && out.length < lines; attempt++) {
		const p = pickSet(analysis, plan);
		// Two lines with the same mains but a different grand number are
		// different tickets, so the grand number is part of the identity.
		const key = `${p.numbers.join(',')}|${p.grand ?? ''}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(p);
	}
	return out;
}

/** The band-based picker on its own — shorthand for `pickMany` with `bands`. */
export function generateMany(
	analysis: Analysis,
	metric: Metric,
	recipe: Recipe,
	max: number,
	lines: number,
	bonus?: BonusOptions
): Pick[] {
	const pick = recipe.hot + recipe.regular + recipe.cold;
	return pickMany(analysis, { strategy: 'bands', metric, recipe, pick, max, bonus }, lines);
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
	return { n, band: bandFor(bonus.analysis, metric, n) };
}

/** "11 - 23 - 24 - 27 - 38 - 49", with " + 3" for a grand number. */
export function formatPick(p: Pick): string {
	return p.numbers.join(' - ') + (p.grand !== null ? ` + ${p.grand}` : '');
}

/** Every set, one per line, ready for the clipboard. */
export function formatPicks(picks: Pick[]): string {
	return picks.map(formatPick).join('\n');
}
