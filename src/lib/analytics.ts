/**
 * Google Analytics 4, loaded only when a measurement ID is configured.
 *
 * The ID comes from PUBLIC_GA_ID at runtime rather than being baked in, so the
 * repo stays free of account identifiers and a fork or a local checkout with no
 * ID set simply runs without analytics.
 */

declare global {
	interface Window {
		dataLayer: unknown[];
		gtag: (...args: unknown[]) => void;
	}
}

let ready = false;

/** GA4 measurement IDs look like G-XXXXXXXXXX. */
const VALID = /^G-[A-Z0-9]+$/i;

export function init(id: string | undefined): void {
	if (ready || !id || !VALID.test(id) || typeof window === 'undefined') return;

	window.dataLayer = window.dataLayer ?? [];
	window.gtag = function gtag() {
		// GA requires the raw `arguments` object here — it reads the array-like
		// shape directly, so spreading into an array breaks it.
		// eslint-disable-next-line prefer-rest-params
		window.dataLayer.push(arguments);
	};

	window.gtag('js', new Date());
	window.gtag('config', id);

	const script = document.createElement('script');
	script.async = true;
	script.src = `https://www.googletagmanager.com/gtag/js?${new URLSearchParams({ id })}`;
	document.head.appendChild(script);

	ready = true;
}

/**
 * Record a custom event. A no-op when analytics never initialised, so callers
 * do not have to guard every call site.
 */
export function track(event: string, params: Record<string, string | number> = {}): void {
	if (!ready) return;
	window.gtag('event', event, params);
}
