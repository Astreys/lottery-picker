import { readFileSync } from 'node:fs';
import { parseText } from '../src/lib/parse.ts';
import { analyse, bonusHistory, pool } from '../src/lib/stats.ts';
import { defaultRecipe, generate, generateMany } from '../src/lib/picker.ts';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
	console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
	if (!ok) failures++;
};

// ---- File-upload path, against the sample file in uploads/ -------------------
const text = readFileSync('uploads/lotto-max.txt', 'utf8');
const fileDraws = parseText(text, 7);
check('parses uploads/lotto-max.txt', fileDraws.length === 335, `${fileDraws.length} draws`);
check(
	'each parsed draw has 7 ascending main numbers',
	fileDraws.every((d) => d.numbers.length === 7 && d.numbers.every((n, i, a) => !i || a[i - 1] < n))
);
check(
	'bonus is split off, not counted as a main number',
	fileDraws[0].numbers.join() === '6,11,23,31,35,43,48' && fileDraws[0].bonus === 9,
	JSON.stringify(fileDraws[0])
);

// ---- Live API path ----------------------------------------------------------
const live = JSON.parse(readFileSync('tests/fixtures/lotto-max.json', 'utf8'));
const draws = live.draws;

// ---- Analysis ---------------------------------------------------------------
const MAX = 52;
const a = analyse(draws, MAX, 200);
check('window respected', a.window === 200 && a.available === draws.length);
check('every number gets a stat', a.stats.length === MAX);
check(
	'total counts == draws x picks',
	a.stats.reduce((s, x) => s + x.count, 0) === 200 * 7,
	`${a.stats.reduce((s, x) => s + x.count, 0)} vs ${200 * 7}`
);
check(
	'ranks are a permutation of 1..max',
	new Set(a.stats.map((s) => s.freqRank)).size === MAX &&
		new Set(a.stats.map((s) => s.gapRank)).size === MAX
);

// Gap must equal the true index of the first (newest) draw containing n.
const used = draws.slice(0, 200);
const gapWrong = a.stats.filter((s) => {
	const truth = used.findIndex((d: { numbers: number[] }) => d.numbers.includes(s.n));
	return s.gap !== (truth === -1 ? 200 : truth);
});
check('gap == draws since last appearance', gapWrong.length === 0, `${gapWrong.length} wrong`);

// Hot by frequency should out-draw cold by frequency, by construction.
const hotAvg = avg(pool(a, 'freq', 'hot').map((n) => a.byNumber.get(n)!.count));
const coldAvg = avg(pool(a, 'freq', 'cold').map((n) => a.byNumber.get(n)!.count));
check('freq hot band out-draws cold band', hotAvg > coldAvg, `${hotAvg.toFixed(1)} vs ${coldAvg.toFixed(1)}`);

const hotGap = avg(pool(a, 'gap', 'hot').map((n) => a.byNumber.get(n)!.gap));
const coldGap = avg(pool(a, 'gap', 'cold').map((n) => a.byNumber.get(n)!.gap));
check('gap cold band is more overdue than hot band', coldGap > hotGap, `${coldGap.toFixed(1)} vs ${hotGap.toFixed(1)}`);

check('bands partition the range', ['hot', 'regular', 'cold'].reduce((s, b) => s + pool(a, 'freq', b as never).length, 0) === MAX);

// ---- Picker -----------------------------------------------------------------
const recipe = defaultRecipe(7);
check('default recipe sums to pick', recipe.hot + recipe.regular + recipe.cold === 7, JSON.stringify(recipe));

let bad = 0;
for (let i = 0; i < 3000; i++) {
	const p = generate(a, 'freq', recipe, MAX);
	if (p.numbers.length !== 7) bad++;
	if (new Set(p.numbers).size !== 7) bad++;
	if (p.numbers.some((n) => n < 1 || n > MAX)) bad++;
	if (p.numbers.some((n, j, arr) => j && arr[j - 1] > n)) bad++;
	const counts = { hot: 0, regular: 0, cold: 0 } as Record<string, number>;
	p.bands.forEach((b) => counts[b]++);
	if (counts.hot !== recipe.hot || counts.cold !== recipe.cold) bad++;
	if (p.sum !== p.numbers.reduce((s, n) => s + n, 0)) bad++;
}
check('3000 picks: right length, unique, in range, sorted, recipe honoured', bad === 0, `${bad} defects`);

// Coverage: every number in a band must be reachable.
const seen = new Set<number>();
for (let i = 0; i < 20000; i++) generate(a, 'freq', recipe, MAX).numbers.forEach((n) => seen.add(n));
check('all 52 numbers reachable over many picks', seen.size === MAX, `${seen.size}/${MAX}`);

const many = generateMany(a, 'freq', recipe, MAX, 10);
check('generateMany returns distinct sets', many.length === 10 && new Set(many.map((p) => p.numbers.join())).size === 10);

// Degenerate recipes must still terminate and produce full-length sets.
const lopsided = generateMany(a, 'gap', { hot: 7, regular: 0, cold: 0 }, MAX, 20);
check('lopsided recipe terminates with full-length sets', lopsided.every((p) => p.numbers.length === 7), `${lopsided.length} sets`);

const tiny = analyse(draws, MAX, 1);
check('window of 1 does not crash', generate(tiny, 'freq', recipe, MAX).numbers.length === 7);

// Small game with an odd pick count.
const dg = analyse(draws.map((d: { numbers: number[] }) => ({ ...d, numbers: d.numbers.slice(0, 5) })), 49, 100);
const dgRecipe = defaultRecipe(5);
check('5-number game recipe sums correctly', dgRecipe.hot + dgRecipe.regular + dgRecipe.cold === 5, JSON.stringify(dgRecipe));
check('5-number pick has 5 numbers', generate(dg, 'freq', dgRecipe, 49).numbers.length === 5);

// ---- Daily Grand: 5 main numbers 1-49 plus a grand number from its own 1-7 pool
const dgLive = JSON.parse(readFileSync('tests/fixtures/daily-grand.json', 'utf8'));
const dgDraws = dgLive.draws;

check(
	'fixture is a real 5-of-49 history',
	dgDraws.every((d: { numbers: number[] }) => d.numbers.length === 5) &&
		dgDraws.every((d: { numbers: number[] }) => d.numbers.every((n) => n >= 1 && n <= 49)),
	`${dgDraws.length} draws`
);

const grandPool = bonusHistory(dgDraws);
check('bonusHistory keeps every draw', grandPool.length === dgDraws.length);
check(
	'grand numbers all fall in 1-7',
	grandPool.every((d: { numbers: number[] }) => d.numbers.length === 1 && d.numbers[0] >= 1 && d.numbers[0] <= 7),
	`observed ${Math.min(...grandPool.map((d) => d.numbers[0]))}-${Math.max(...grandPool.map((d) => d.numbers[0]))}`
);

const dgMain = analyse(dgDraws, 49, 200);
const dgGrand = analyse(grandPool, 7, 200);
check('grand analysis covers exactly 7 numbers', dgGrand.stats.length === 7);
check(
	'grand counts total one per draw',
	dgGrand.stats.reduce((s, x) => s + x.count, 0) === 200,
	`${dgGrand.stats.reduce((s, x) => s + x.count, 0)}`
);
check('every grand number appears in 200 draws', dgGrand.stats.every((s) => s.count > 0));

const dgRec = defaultRecipe(5);
let dgBad = 0;
const grandsSeen = new Set<number>();
for (let i = 0; i < 3000; i++) {
	const p = generate(dgMain, 'freq', dgRec, 49, { analysis: dgGrand, choice: 'any' });
	if (p.numbers.length !== 5 || new Set(p.numbers).size !== 5) dgBad++;
	if (p.numbers.some((n) => n < 1 || n > 49)) dgBad++;
	if (p.grand === null || p.grand < 1 || p.grand > 7) dgBad++;
	if (p.grandBand === null) dgBad++;
	// The grand number is a separate pool, so it may legitimately coincide with
	// a main number; what it must never do is displace one.
	if (p.numbers.length !== 5) dgBad++;
	if (p.grand !== null) grandsSeen.add(p.grand);
}
check('3000 Daily Grand picks: 5 mains + a grand number in 1-7', dgBad === 0, `${dgBad} defects`);
check('all 7 grand numbers reachable', grandsSeen.size === 7, `${grandsSeen.size}/7`);

for (const choice of ['hot', 'regular', 'cold'] as const) {
	const wanted = new Set(pool(dgGrand, 'freq', choice));
	const got = Array.from({ length: 500 }, () =>
		generate(dgMain, 'freq', dgRec, 49, { analysis: dgGrand, choice }).grand!
	);
	check(
		`grand band "${choice}" only draws from that band`,
		got.every((n) => wanted.has(n)),
		`band = [${[...wanted].join(',')}]`
	);
}

const dgSets = generateMany(dgMain, 'freq', dgRec, 49, 8, { analysis: dgGrand, choice: 'any' });
check(
	'generateMany carries the grand number through',
	dgSets.length === 8 && dgSets.every((p) => p.grand !== null && p.numbers.length === 5)
);

// Games without their own bonus pool must be unaffected.
check('no bonus options means no grand number', generate(a, 'freq', recipe, MAX).grand === null);

function avg(xs: number[]) {
	return xs.reduce((s, x) => s + x, 0) / xs.length;
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
