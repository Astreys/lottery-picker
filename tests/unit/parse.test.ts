import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSourceHtml, parseText } from '$lib/parse';

describe('parseText', () => {
	const draws = parseText(readFileSync('uploads/lotto-max.txt', 'utf8'), 7);

	it('reads every line of the sample upload', () => {
		expect(draws).toHaveLength(335);
	});

	it('gives each draw 7 ascending main numbers', () => {
		for (const d of draws) {
			expect(d.numbers).toHaveLength(7);
			expect(d.numbers).toEqual([...d.numbers].sort((a, b) => a - b));
		}
	});

	it('splits the bonus off rather than counting it as a main number', () => {
		expect(draws[0]).toEqual({ date: '', numbers: [6, 11, 23, 31, 35, 43, 48], bonus: 9 });
	});

	it('accepts any separator and sorts the numbers', () => {
		expect(parseText('49;3 , 17\t8-22/1', 6)).toEqual([
			{ date: '', numbers: [1, 3, 8, 17, 22, 49], bonus: null }
		]);
	});

	it('skips lines with too few numbers, blanks and CRLF endings', () => {
		const text = 'header line\r\n1 2 3\r\n\r\n1 2 3 4 5 6 7\r\n';
		expect(parseText(text, 6)).toEqual([{ date: '', numbers: [1, 2, 3, 4, 5, 6], bonus: 7 }]);
	});
});

describe('parseSourceHtml', () => {
	const row = (date: string, numbers: string, bonus: string) =>
		`<tr><td class="date-cell" align="center">${date}</td>` +
		`<td class="number-cell">${numbers}</td>` +
		`<td class="bonus-cell">${bonus}</td></tr>`;

	it('parses the lotto-8.com table layout', () => {
		const html =
			'<table>' +
			row('31/08<br>26(MON)', '25&nbsp;5&nbsp;12&nbsp;30&nbsp;39&nbsp;50&nbsp;52', '19') +
			row('28/08<br>26(FRI)', '1&nbsp;7&nbsp;8&nbsp;10&nbsp;41&nbsp;42&nbsp;48', '') +
			'</table>';
		expect(parseSourceHtml(html)).toEqual([
			{ date: '2026-08-31', numbers: [5, 12, 25, 30, 39, 50, 52], bonus: 19 },
			{ date: '2026-08-28', numbers: [1, 7, 8, 10, 41, 42, 48], bonus: null }
		]);
	});

	it('puts two-digit years above 50 in the 1900s', () => {
		const [d] = parseSourceHtml(row('01/02<br>99(SAT)', '1&nbsp;2', '3'));
		expect(d.date).toBe('1999-02-01');
	});

	it('leaves the date empty when the cell has none', () => {
		const [d] = parseSourceHtml(row('n/a', '1&nbsp;2', '3'));
		expect(d.date).toBe('');
	});

	it('skips rows with no numbers and returns nothing for unrelated HTML', () => {
		expect(parseSourceHtml(row('01/02<br>24(SAT)', '&nbsp;', '3'))).toEqual([]);
		expect(parseSourceHtml('<html><body>Maintenance</body></html>')).toEqual([]);
	});
});
