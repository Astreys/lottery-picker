/**
 * Parsers for draw history. Two input paths produce the same Draw[]:
 * scraped HTML from lotto-8.com, and a pasted/uploaded text file.
 */

export interface Draw {
	/** ISO date, YYYY-MM-DD. Empty string when the source gave us no date. */
	date: string;
	/** The main winning numbers, ascending. */
	numbers: number[];
	/** Bonus / grand number, when the game has one. */
	bonus: number | null;
}

/**
 * lotto-8.com renders every Canadian game with the same three-column table:
 * a date cell as DD/MM<br>YY(DOW), a number cell of &nbsp;-joined values,
 * and a bonus cell. One regex therefore covers all six games.
 */
const ROW =
	/<td class="date-cell"[^>]*>(.*?)<\/td>\s*<td class="number-cell"[^>]*>(.*?)<\/td>\s*<td class="bonus-cell"[^>]*>(.*?)<\/td>/gis;

const nums = (html: string): number[] =>
	(html.replace(/&nbsp;/g, ' ').match(/\d+/g) ?? []).map(Number);

/** "31/08<br>26(MON)" -> "2026-08-31" */
function parseDate(cell: string): string {
	const m = cell.replace(/&nbsp;/g, ' ').match(/(\d{2})\/(\d{2})\D+(\d{2})/);
	if (!m) return '';
	const [, dd, mm, yy] = m;
	// The site only ever shows 2-digit years; everything in range is 19xx or 20xx.
	const year = Number(yy) > 50 ? `19${yy}` : `20${yy}`;
	return `${year}-${mm}-${dd}`;
}

export function parseSourceHtml(html: string): Draw[] {
	const out: Draw[] = [];
	for (const m of html.matchAll(ROW)) {
		const numbers = nums(m[2]).sort((a, b) => a - b);
		if (!numbers.length) continue;
		const bonusValues = nums(m[3]);
		out.push({
			date: parseDate(m[1]),
			numbers,
			bonus: bonusValues.length ? bonusValues[0] : null
		});
	}
	return out;
}

/**
 * Free-form text: one draw per line, numbers in any separator. The last value
 * on a line is treated as the bonus when the line holds exactly `pick + 1`
 * numbers, which matches the tab-separated format in uploads/lotto-max.txt.
 */
export function parseText(text: string, pick: number): Draw[] {
	const out: Draw[] = [];
	for (const line of text.split(/\r?\n/)) {
		const values = (line.match(/\d+/g) ?? []).map(Number);
		if (values.length < pick) continue;
		out.push({
			date: '',
			numbers: values.slice(0, pick).sort((a, b) => a - b),
			bonus: values.length > pick ? values[pick] : null
		});
	}
	return out;
}
