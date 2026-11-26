/**
 * Connection details a self-hosted bundle serves next to the dashboard, at `/bundle.json`
 * (see docker/web). When present, the dashboard connects to its own node and gateway without
 * the operator pasting a macaroon. The bundle only serves it behind a login, since it carries
 * the credential.
 */

export interface Bundle {
	/** gRPC-Web base URL of the node. */
	nodeUrl: string;
	/** OpenAI-compatible base URL of goose-gateway. */
	gatewayUrl: string;
	/** Hex-encoded reusable v2 macaroon. */
	macaroon: string;
}

/** A v2 macaroon: even-length hex starting with the version byte. */
const MACAROON = /^02(?:[0-9a-f]{2}){16,2047}$/i;

/**
 * Validate what `/bundle.json` returned and resolve its URLs against the page's origin: an
 * empty `nodeUrl` means "this origin", and `gatewayUrl` may be a path such as `/goose/v1`.
 * Anything malformed yields null, so a missing or foreign file never half-configures the app.
 */
export function parseBundle(raw: unknown, origin: string): Bundle | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const b = raw as Record<string, unknown>;
	if (typeof b.macaroon !== 'string' || !MACAROON.test(b.macaroon.trim())) return null;
	const resolve = (value: unknown, fallback: string): string | null => {
		const v = typeof value === 'string' && value.trim() ? value.trim() : fallback;
		try {
			const url = new URL(v, origin);
			if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
			return url.href.replace(/\/+$/, '');
		} catch {
			return null;
		}
	};
	const nodeUrl = resolve(b.nodeUrl, origin);
	const gatewayUrl = resolve(b.gatewayUrl, '/goose/v1');
	if (!nodeUrl || !gatewayUrl) return null;
	return { nodeUrl, gatewayUrl, macaroon: b.macaroon.trim().toLowerCase() };
}

/** One look at `/bundle.json`: the bundle, and whether it is worth looking again. */
export interface BundleProbe {
	bundle: Bundle | null;
	/**
	 * The bundle's nginx answers 404 until the node has written its admin macaroon on a fresh stack,
	 * so a 404 may turn into a bundle. A static host answers with the app's HTML instead, and a
	 * malformed file stays malformed: neither is retried.
	 */
	retry: boolean;
}

/** Fetch `/bundle.json` from the page's own origin, once. */
export async function probeBundle(
	origin: string,
	doFetch: typeof fetch = (input, init) => globalThis.fetch(input, init),
	/** The connect screen waits on this, so a proxy that never answers must not hang it. */
	timeoutMs = 5000
): Promise<BundleProbe> {
	try {
		const res = await doFetch(new URL('/bundle.json', origin).href, {
			cache: 'no-store',
			credentials: 'same-origin',
			signal: AbortSignal.timeout(timeoutMs)
		});
		if (res.status === 404) return { bundle: null, retry: true };
		if (!res.ok || !res.headers.get('content-type')?.includes('json')) {
			return { bundle: null, retry: false };
		}
		return { bundle: parseBundle(await res.json(), origin), retry: false };
	} catch {
		return { bundle: null, retry: false };
	}
}

/**
 * Fetch `/bundle.json` from the page's own origin. Resolves null when there is no bundle: a
 * static host answers unknown paths with the app's HTML, so anything but JSON is "no bundle".
 */
export async function loadBundle(
	origin: string,
	doFetch: typeof fetch = (input, init) => globalThis.fetch(input, init),
	timeoutMs = 5000
): Promise<Bundle | null> {
	return (await probeBundle(origin, doFetch, timeoutMs)).bundle;
}

/**
 * Look for the bundle until it appears, while `keepLooking()` holds, a few minutes at most:
 * a page opened on a fresh stack keeps waiting for the node's macaroon instead of staying on the
 * connect screen until reloaded. `afterFirst` runs once the first answer is in, so the
 * connect screen is not held back while it waits.
 */
export async function waitForBundle(
	origin: string,
	opts: {
		keepLooking: () => boolean;
		afterFirst?: () => void;
		fetch?: typeof fetch;
		intervalMs?: number;
		attempts?: number;
	}
): Promise<Bundle | null> {
	const { intervalMs = 5000, attempts = 120 } = opts;
	for (let i = 0; i < attempts; i++) {
		const probe = await probeBundle(origin, opts.fetch);
		if (i === 0) opts.afterFirst?.();
		if (probe.bundle || !probe.retry || !opts.keepLooking()) return probe.bundle;
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
		if (!opts.keepLooking()) return null;
	}
	return null;
}
