<script lang="ts">
	import { GAMES, type Game } from '$lib/games';
	import { parseText, type Draw } from '$lib/parse';
	import { analyse, bonusHistory, type Analysis } from '$lib/stats';
	import { track } from '$lib/analytics';
	import ThemeToggle from '$lib/ThemeToggle.svelte';
	import {
		defaultRecipe,
		formatPick,
		formatPicks,
		generateMany,
		type BandChoice,
		type Metric,
		type Pick,
		type Recipe
	} from '$lib/picker';

	let game = $state<Game>(GAMES[0]);
	let draws = $state<Draw[]>([]);
	let fetchedAt = $state('');
	let origin = $state<'' | 'cache' | 'live' | 'stale' | 'file'>('');
	let loading = $state(false);
	let err = $state('');

	let windowSize = $state(200);
	let metric = $state<Metric>('freq');
	let recipe = $state<Recipe>(defaultRecipe(GAMES[0].pick));
	let lines = $state(5);
	let picks = $state<Pick[]>([]);
	let sortBy = $state<'n' | 'count' | 'gap'>('n');
	let grandChoice = $state<BandChoice>('any');
	/** Which copy button last succeeded: a set index, 'all', or null. */
	let copied = $state<number | 'all' | null>(null);
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;

	/** 0 means "every draw we have". */
	const WINDOWS = [50, 100, 200, 500, 0];
	const BANDS: Array<[keyof Recipe, string]> = [
		['hot', 'Hot'],
		['regular', 'Regular'],
		['cold', 'Cold']
	];

	const GRAND_CHOICES: BandChoice[] = ['any', 'hot', 'regular', 'cold'];

	const effectiveWindow = $derived(windowSize === 0 ? draws.length : windowSize);

	const analysis = $derived<Analysis | null>(
		draws.length ? analyse(draws, game.max, effectiveWindow) : null
	);

	/**
	 * Games whose extra ball has its own pool (Daily Grand's grand number, 1–7)
	 * get a second, independent analysis so it can be picked as well.
	 */
	const grandAnalysis = $derived<Analysis | null>(
		game.bonusMax && draws.length
			? analyse(bonusHistory(draws), game.bonusMax, effectiveWindow)
			: null
	);

	const bonusOptions = $derived(
		grandAnalysis ? { analysis: grandAnalysis, choice: grandChoice } : undefined
	);

	const recipeTotal = $derived(recipe.hot + recipe.regular + recipe.cold);
	const recipeOk = $derived(recipeTotal === game.pick);

	const rows = $derived(
		analysis
			? [...analysis.stats].sort((a, b) =>
					sortBy === 'n'
						? a.n - b.n
						: sortBy === 'count'
							? b.count - a.count || a.n - b.n
							: b.gap - a.gap || a.n - b.n
				)
			: []
	);

	const maxCount = $derived(analysis ? Math.max(1, ...analysis.stats.map((s) => s.count)) : 1);
	const when = $derived(fetchedAt ? new Date(fetchedAt).toLocaleString() : '');

	async function load(refresh = false) {
		loading = true;
		err = '';
		try {
			const res = await fetch(`/api/draws/${game.id}${refresh ? '?refresh=1' : ''}`);
			const body = await res.json();
			if (!res.ok) throw new Error(body.message ?? `HTTP ${res.status}`);
			draws = body.draws;
			fetchedAt = body.fetchedAt;
			origin = body.source;
			picks = [];
			track('load_results', { game: game.id, source: body.source, draws: body.draws.length });
		} catch (e) {
			err = (e as Error).message;
			track('load_failed', { game: game.id });
		} finally {
			loading = false;
		}
	}

	function onFile(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			draws = parseText(String(reader.result), game.pick);
			fetchedAt = '';
			origin = 'file';
			err = draws.length ? '' : 'No draws found — check that the game matches the file.';
			picks = [];
		};
		reader.readAsText(file);
	}

	function selectGame(id: string) {
		game = GAMES.find((g) => g.id === id)!;
		recipe = defaultRecipe(game.pick);
		draws = [];
		picks = [];
		origin = '';
		err = '';
	}

	function setBand(key: keyof Recipe, value: number) {
		recipe = { ...recipe, [key]: Math.max(0, Math.min(game.pick, value)) };
	}

	function roll() {
		if (!analysis) return;
		picks = generateMany(analysis, metric, recipe, game.max, lines, bonusOptions);
		copied = null;
		track('generate', {
			game: game.id,
			metric,
			window: analysis.window,
			sets: picks.length,
			// Recorded as one string so the split reads as a single dimension in GA.
			split: `${recipe.hot}-${recipe.regular}-${recipe.cold}`
		});
	}

	async function copy(which: number | 'all') {
		const text = which === 'all' ? formatPicks(picks) : formatPick(picks[which]);
		try {
			await navigator.clipboard.writeText(text);
			copied = which;
			clearTimeout(copiedTimer);
			copiedTimer = setTimeout(() => (copied = null), 1500);
		} catch {
			err = 'Could not copy — your browser blocked clipboard access.';
		}
	}
</script>

<main>
	<header class="top">
		<h1>Lottery number picker</h1>
		<ThemeToggle />
	</header>
	<p class="sub">
		Hot, cold and overdue analysis across Canadian draws — then a set built from all three.
	</p>

	<section class="panel">
		<h2>Draw history</h2>
		<div class="row">
			<label class="field">
				<span>Game</span>
				<select value={game.id} onchange={(e) => selectGame(e.currentTarget.value)}>
					{#each GAMES as g (g.id)}
						<option value={g.id}>{g.name} — {g.pick} of {g.max}</option>
					{/each}
				</select>
			</label>

			<div class="field">
				<span>Fetch from lotto-8.com</span>
				<div class="buttons">
					<button onclick={() => load(false)} disabled={loading}>
						{loading ? 'Loading…' : 'Load results'}
					</button>
					<button onclick={() => load(true)} disabled={loading} title="Bypass the cache">
						Refresh
					</button>
				</div>
			</div>

			<label class="field">
				<span>…or upload a results file</span>
				<input type="file" accept=".txt,.csv" onchange={onFile} />
			</label>
		</div>

		{#if err}
			<p class="err note">{err}</p>
		{:else if draws.length}
			<p class="muted note">
				{draws.length} draws loaded
				{#if origin === 'file'}
					from file
				{:else if origin === 'stale'}
					· cached {when} (source unreachable, showing stale data)
				{:else if when}
					· fetched {when}
				{/if}
			</p>
		{/if}
	</section>

	{#if analysis}
		<section class="panel">
			<h2>Analysis window</h2>
			<div class="row">
				<div class="field">
					<span>Analysing <strong>{analysis.window}</strong> of {analysis.available} draws</span>
					<div class="seg">
						{#each WINDOWS as w (w)}
							<button aria-pressed={windowSize === w} onclick={() => (windowSize = w)}>
								{w === 0 ? 'All' : w}
							</button>
						{/each}
					</div>
				</div>

				<div class="field">
					<span>Band numbers by</span>
					<div class="seg">
						<button aria-pressed={metric === 'freq'} onclick={() => (metric = 'freq')}>
							Frequency
						</button>
						<button aria-pressed={metric === 'gap'} onclick={() => (metric = 'gap')}>
							Overdue
						</button>
					</div>
				</div>
			</div>
			<p class="muted note">
				{#if metric === 'freq'}
					Hot = drawn most often in the window; cold = drawn least often.
				{:else}
					Hot = seen most recently; cold = longest since it last appeared.
				{/if}
			</p>
		</section>

		<section class="panel">
			<h2>Set composition</h2>
			<div class="row">
				{#each BANDS as [key, label] (key)}
					<label class="field">
						<span>{label}</span>
						<input
							type="number"
							min="0"
							max={game.pick}
							class="tiny"
							value={recipe[key]}
							onchange={(e) => setBand(key, +e.currentTarget.value)}
						/>
					</label>
				{/each}

				{#if grandAnalysis && game.bonusLabel}
					<div class="field">
						<span>{game.bonusLabel} (1–{game.bonusMax})</span>
						<div class="seg">
							{#each GRAND_CHOICES as c (c)}
								<button aria-pressed={grandChoice === c} onclick={() => (grandChoice = c)}>
									{c === 'any' ? 'Any' : c}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<label class="field">
					<span>Sets</span>
					<input type="number" min="1" max="20" class="tiny" bind:value={lines} />
				</label>

				<button class="primary" onclick={roll} disabled={!recipeOk}>Generate</button>
			</div>

			{#if !recipeOk}
				<p class="err note">
					{game.name} draws {game.pick} numbers — your split adds up to {recipeTotal}.
				</p>
			{/if}
		</section>

		{#if picks.length}
			<section class="panel">
				<h2>Your picks</h2>
				{#each picks as p, i (i)}
					<div
						class="line"
						aria-label={`Set ${i + 1}: ${p.numbers.join(', ')}` +
							(p.grand !== null ? `, ${game.bonusLabel} ${p.grand}` : '')}
					>
						{#each p.numbers as n, j (n)}
							<span class="ball {p.bands[j]}">{n}</span>
						{/each}
						{#if p.grand !== null}
							<span class="plus" aria-hidden="true">+</span>
							<span class="ball grand {p.grandBand}" title={game.bonusLabel ?? ''}>{p.grand}</span>
						{/if}
						<span class="meta">
							{p.low} low / {p.numbers.length - p.low} high · {p.odd} odd · sum {p.sum}
						</span>
						<button
							class="copy-one"
							onclick={() => copy(i)}
							aria-label={`Copy set ${i + 1}: ${formatPick(p)}`}
							title={formatPick(p)}
						>
							{copied === i ? 'Copied' : 'Copy'}
						</button>
					</div>
				{/each}
				<div class="buttons spaced">
					<button onclick={roll}>Generate again</button>
					<button onclick={() => copy('all')}>{copied === 'all' ? 'Copied!' : 'Copy all'}</button>
				</div>
				<p class="sr-only" aria-live="polite">
					{copied === null ? '' : copied === 'all' ? 'All sets copied' : `Set ${copied + 1} copied`}
				</p>
				<p class="muted note">
					Ball colour shows which band each number came from.
					{#if grandAnalysis && game.bonusLabel}
						The outlined ball is the {game.bonusLabel.toLowerCase()}, drawn from its own 1–{game.bonusMax}
						pool.
					{:else if game.bonusLabel}
						The {game.bonusLabel.toLowerCase()} is drawn from the same pool as the main numbers and
						is not picked here.
					{/if}
				</p>
			</section>
		{/if}

		<section class="panel">
			<h2>Every number</h2>
			<div class="scroll">
				<table>
					<thead>
						<tr>
							<th aria-sort={sortBy === 'n' ? 'ascending' : 'none'}>
								<button class="link" onclick={() => (sortBy = 'n')}>Number</button>
							</th>
							<th aria-sort={sortBy === 'count' ? 'descending' : 'none'}>
								<button class="link" onclick={() => (sortBy = 'count')}>Times drawn</button>
							</th>
							<th class="barcol"><span class="sr-only">Relative frequency</span></th>
							<th aria-sort={sortBy === 'gap' ? 'descending' : 'none'}>
								<button class="link" onclick={() => (sortBy = 'gap')}>Draws since seen</button>
							</th>
							<th>Frequency</th>
							<th>Recency</th>
						</tr>
					</thead>
					<tbody>
						{#each rows as s (s.n)}
							<tr>
								<td><strong>{s.n}</strong></td>
								<td>{s.count}</td>
								<td><div class="bar" style="width:{(s.count / maxCount) * 100}%"></div></td>
								<td>{s.gap >= analysis.window ? `${analysis.window}+` : s.gap}</td>
								<td><span class="chip {s.freqBand}">{s.freqBand}</span></td>
								<td><span class="chip {s.gapBand}">{s.gapBand}</span></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
		{#if grandAnalysis && game.bonusLabel}
			<section class="panel">
				<h2>{game.bonusLabel} pool</h2>
				<div class="scroll">
					<table>
						<thead>
							<tr>
								<th>Number</th>
								<th>Times drawn</th>
								<th class="barcol"></th>
								<th>Draws since seen</th>
								<th>Frequency</th>
								<th>Recency</th>
							</tr>
						</thead>
						<tbody>
							{#each grandAnalysis.stats as s (s.n)}
								<tr>
									<td><strong>{s.n}</strong></td>
									<td>{s.count}</td>
									<td>
										<div
											class="bar"
											style="width:{(s.count /
												Math.max(1, ...grandAnalysis.stats.map((x) => x.count))) *
												100}%"
										></div>
									</td>
									<td>{s.gap >= grandAnalysis.window ? `${grandAnalysis.window}+` : s.gap}</td>
									<td><span class="chip {s.freqBand}">{s.freqBand}</span></td>
									<td><span class="chip {s.gapBand}">{s.gapBand}</span></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="muted note">
					Drawn independently of the main numbers, so it gets its own frequency and recency counts
					over the same {grandAnalysis.window}-draw window.
				</p>
			</section>
		{/if}
	{:else if !loading && !err}
		<section class="panel">
			<p class="muted flush">
				Load results for {game.name} to see the analysis, or upload a file of past draws — one draw
				per line, numbers in any separator.
			</p>
		</section>
	{/if}

	<!-- Always rendered: explains the tool to a first-time visitor, and gives
	     search engines something to read on a page that is otherwise controls. -->
	<footer class="about">
		<section>
			<h2>How the bands work</h2>
			<p>
				Every number is measured two independent ways over the draws you choose to analyse, and
				both are shown side by side so you can see where they disagree.
			</p>
			<dl>
				<dt>Frequency</dt>
				<dd>
					How often a number came up in the window. The most-drawn third are <strong>hot</strong>,
					the least-drawn third <strong>cold</strong>, the rest <strong>regular</strong>.
				</dd>
				<dt>Recency</dt>
				<dd>
					How many draws since a number last appeared. The longest gaps are the
					<strong>overdue</strong> end. A number can easily be cold by frequency but hot by
					recency, or the other way round.
				</dd>
			</dl>
			<p>
				A set takes some numbers from each band. You choose the split, which of the two readings
				drives it, and how far back to look — 50, 100, 200 or 500 draws, or the whole history.
			</p>
		</section>

		<section>
			<h2>Games covered</h2>
			<ul class="games">
				{#each GAMES as g (g.id)}
					<li>
						<strong>{g.name}</strong> — pick {g.pick} from 1–{g.max}{#if g.bonusMax}, plus a
							{g.bonusLabel?.toLowerCase()} from its own 1–{g.bonusMax} pool{/if}
					</li>
				{/each}
			</ul>
			<p class="muted">
				Draw history is fetched from lotto-8.com, or read from a text file you upload.
			</p>
		</section>

		<section>
			<h2>About the odds</h2>
			<p>
				Lottery draws are independent events. A number being hot, cold or overdue tells you nothing
				about the next draw, and no arrangement of these bands changes the odds of any ticket. This
				is a tool for picking numbers in a way that feels considered — not a system for winning.
			</p>
		</section>
	</footer>
</main>

<style>
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.buttons {
		display: flex;
		gap: 0.5rem;
	}
	.copy-one {
		margin-left: 0.75rem;
		padding: 0.2rem 0.6rem;
		font-size: 0.78rem;
		min-width: 4.5rem;
	}
	.spaced {
		margin-top: 0.9rem;
	}
	.note {
		margin: 0.85rem 0 0;
	}
	.flush {
		margin: 0;
	}
	.tiny {
		width: 5rem;
	}
	.plus {
		color: var(--muted);
		margin: 0 0.5rem 0 0.25rem;
		font-weight: 600;
	}
	/* The extra ball comes from a different pool — outline it so it never reads
	   as a sixth main number. */
	.ball.grand {
		box-shadow: inset 0 0 0 2px currentColor;
		background: transparent;
	}
	.barcol {
		width: 30%;
	}
	th button.link {
		background: none;
		border: 0;
		padding: 0;
		font: inherit;
		color: inherit;
		cursor: pointer;
	}
	th button.link:hover {
		color: var(--accent);
	}

	.about {
		margin-top: 2.5rem;
		padding-top: 1.75rem;
		border-top: 1px solid var(--line);
		color: var(--muted);
		font-size: 0.9rem;
		display: grid;
		gap: 1.75rem;
	}
	.about :global(h2) {
		margin-bottom: 0.5rem;
	}
	.about p {
		margin: 0 0 0.6rem;
		max-width: 62ch;
	}
	.about strong {
		color: var(--ink);
		font-weight: 600;
	}
	.about dl {
		margin: 0 0 0.6rem;
		max-width: 62ch;
	}
	.about dt {
		color: var(--ink);
		font-weight: 600;
		margin-top: 0.5rem;
	}
	.about dd {
		margin: 0.15rem 0 0;
	}
	.games {
		margin: 0 0 0.6rem;
		padding-left: 1.1rem;
		max-width: 62ch;
	}
	.games li {
		margin-bottom: 0.2rem;
	}
</style>
