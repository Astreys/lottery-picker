import { GAMES } from './games';

export const SITE_NAME = 'Lottery Number Picker';

export const TITLE = 'Lottery Number Picker — hot, cold and overdue numbers';

export const DESCRIPTION =
	'Analyse hot, cold and overdue numbers across Canadian lottery draws — Lotto Max, ' +
	'Lotto 6/49, Daily Grand, Lottario, Ontario 49 and BC/49 — then build a set from all three bands.';

/**
 * Schema.org description of the app. Search engines use this for rich results;
 * it is kept in step with the game list so the two cannot drift apart.
 */
export function structuredData(origin: string) {
	return {
		'@context': 'https://schema.org',
		'@type': 'WebApplication',
		name: SITE_NAME,
		url: origin,
		description: DESCRIPTION,
		applicationCategory: 'UtilitiesApplication',
		operatingSystem: 'Any',
		browserRequirements: 'Requires JavaScript',
		inLanguage: 'en-CA',
		isAccessibleForFree: true,
		offers: { '@type': 'Offer', price: '0', priceCurrency: 'CAD' },
		featureList: GAMES.map((g) => `${g.name} (${g.pick} of ${g.max})`)
	};
}
