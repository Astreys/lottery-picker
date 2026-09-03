import type { RequestHandler } from './$types';

/**
 * Served dynamically so the sitemap line carries whatever origin the site is
 * actually reachable on, rather than a hardcoded domain that goes stale.
 */
export const GET: RequestHandler = async ({ url }) => {
	const body = [
		'User-agent: *',
		'Allow: /',
		'',
		'# The results endpoint is a data feed, not a page worth indexing.',
		'Disallow: /api/',
		'',
		`Sitemap: ${url.origin}/sitemap.xml`,
		''
	].join('\n');

	return new Response(body, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'public, max-age=86400'
		}
	});
};
