import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Stands in for the Netlify Blobs store present in a deployed site. */
const blob = { get: vi.fn(), setJSON: vi.fn() };
vi.mock('@netlify/blobs', () => ({ getStore: vi.fn(() => blob) }));

const { getStore } = await import('@netlify/blobs');
const { read, write } = await import('$lib/server/store');

const value = { draws: [{ date: '2026-01-01', numbers: [1, 2], bonus: 3 }], fetchedAt: 'now' };

describe('store on Netlify', () => {
	beforeEach(() => {
		blob.get.mockReset();
		blob.setJSON.mockReset();
	});

	it('reads JSON from the "draws" store', async () => {
		blob.get.mockResolvedValue(value);
		expect(await read('lotto-max')).toEqual(value);
		expect(getStore).toHaveBeenCalledWith('draws');
		expect(blob.get).toHaveBeenCalledWith('lotto-max', { type: 'json' });
	});

	it('writes JSON to the store', async () => {
		await write('lotto-max', value);
		expect(blob.setJSON).toHaveBeenCalledWith('lotto-max', value);
	});

	it('falls back to memory when a read fails', async () => {
		await write('fallback', value);
		blob.get.mockRejectedValue(new Error('blobs down'));
		expect(await read('fallback')).toEqual(value);
	});

	it('swallows a failed write — the cache is not worth failing a request over', async () => {
		blob.setJSON.mockRejectedValue(new Error('blobs down'));
		await expect(write('lotto-max', value)).resolves.toBeUndefined();
	});
});
