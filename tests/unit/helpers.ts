import { readFileSync } from 'node:fs';
import type { Draw } from '$lib/parse';

/** Real histories scraped from lotto-8.com, newest first. */
export function fixture(name: 'lotto-max' | 'daily-grand'): Draw[] {
	return JSON.parse(readFileSync(`tests/fixtures/${name}.json`, 'utf8')).draws;
}

export const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
