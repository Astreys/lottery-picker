<script lang="ts">
	import '../app.css';
	import { dev } from '$app/environment';
	import { env } from '$env/dynamic/public';
	import { init } from '$lib/analytics';

	let { children } = $props();

	$effect(() => {
		// Skipped in dev so local work never shows up in the reports.
		if (!dev) init(env.PUBLIC_GA_ID);
	});
</script>

<svelte:head>
	<title>Lottery Number Picker</title>
	<meta name="description" content="Hot / cold / overdue number analysis for Canadian lotteries" />
</svelte:head>

{@render children()}
