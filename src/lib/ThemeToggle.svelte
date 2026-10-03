<script lang="ts">
	import { onMount } from 'svelte';
	import { LABELS, applyTheme, nextTheme, readTheme, type Theme } from './theme';

	let theme = $state<Theme>('system');

	onMount(() => {
		theme = readTheme(localStorage);
	});

	function toggle() {
		theme = nextTheme(theme);
		applyTheme(theme, document.documentElement, localStorage);
	}
</script>

<button
	class="theme"
	onclick={toggle}
	title={`${LABELS[theme]} — click to switch`}
	aria-label={`${LABELS[theme]}. Switch to ${LABELS[nextTheme(theme)].toLowerCase()}`}
	data-theme-choice={theme}
>
	<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
		{#if theme === 'light'}
			<circle cx="12" cy="12" r="4.5" />
			<path
				d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8"
			/>
		{:else if theme === 'dark'}
			<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
		{:else}
			<rect x="3" y="4.5" width="18" height="12.5" rx="1.5" />
			<path d="M8.5 20.5h7M12 17v3.5" />
		{/if}
	</svg>
	<span class="label">{theme === 'system' ? 'Auto' : theme === 'light' ? 'Light' : 'Dark'}</span>
</button>

<style>
	.theme {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.65rem;
	}
	svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.label {
		font-size: 0.8rem;
	}
</style>
