<script lang="ts">
	import '../app.css';
	import { dev } from '$app/environment';
	import { page } from '$app/state';
	import { env } from '$env/dynamic/public';
	import { init } from '$lib/analytics';
	import { DESCRIPTION, SITE_NAME, TITLE, structuredData } from '$lib/seo';

	let { children } = $props();

	$effect(() => {
		// Skipped in dev so local work never shows up in the reports.
		if (!dev) init(env.PUBLIC_GA_ID);
	});

	// Taken from the request rather than hardcoded, so previews, the Netlify
	// subdomain and any future custom domain each describe themselves correctly.
	const origin = $derived(page.url.origin);
	const canonical = $derived(`${origin}${page.url.pathname}`);
	const image = $derived(`${origin}/og.png`);
</script>

<svelte:head>
	<title>{TITLE}</title>
	<meta name="description" content={DESCRIPTION} />
	<link rel="canonical" href={canonical} />

	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:title" content={TITLE} />
	<meta property="og:description" content={DESCRIPTION} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={image} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="Five lottery balls coloured by hot, regular and cold bands" />
	<meta property="og:locale" content="en_CA" />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={TITLE} />
	<meta name="twitter:description" content={DESCRIPTION} />
	<meta name="twitter:image" content={image} />

	{@html `<script type="application/ld+json">${JSON.stringify(structuredData(origin))}</script>`}
</svelte:head>

{@render children()}
