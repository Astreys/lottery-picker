import type { Draw } from '$lib/parse';

export interface Cached {
	draws: Draw[];
	fetchedAt: string;
}

/**
 * Netlify Blobs is only present in the deployed environment. Locally we fall
 * back to an in-process map, so `npm run dev` works with no Netlify login and
 * no environment variables.
 */
const memory = new Map<string, Cached>();

async function blobs() {
	try {
		const { getStore } = await import('@netlify/blobs');
		return getStore('draws');
	} catch {
		return null;
	}
}

export async function read(key: string): Promise<Cached | null> {
	const store = await blobs();
	if (!store) return memory.get(key) ?? null;
	try {
		return (await store.get(key, { type: 'json' })) as Cached | null;
	} catch {
		return memory.get(key) ?? null;
	}
}

export async function write(key: string, value: Cached): Promise<void> {
	memory.set(key, value);
	const store = await blobs();
	if (!store) return;
	try {
		await store.setJSON(key, value);
	} catch {
		// A cache write failure is not worth failing the request over.
	}
}
