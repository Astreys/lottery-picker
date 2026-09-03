import type { RequestHandler } from './$types';

/** Every indexable route. The app is a single page, so this is short by design. */
const PAGES = [{ path: '/', changefreq: 'daily', priority: '1.0' }];

export const GET: RequestHandler = async ({ url }) => {
	const urls = PAGES.map(
		(p) =>
			`\t<url>\n\t\t<loc>${url.origin}${p.path}</loc>\n` +
			`\t\t<changefreq>${p.changefreq}</changefreq>\n` +
			`\t\t<priority>${p.priority}</priority>\n\t</url>`
	).join('\n');

	const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

	return new Response(body, {
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'cache-control': 'public, max-age=86400'
		}
	});
};
