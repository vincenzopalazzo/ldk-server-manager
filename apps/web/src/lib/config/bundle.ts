/**
 * Connection details a self-hosted bundle serves next to the dashboard, at `/bundle.json`
 * (see docker/web). When present, the dashboard connects to its own node and gateway without
 * the operator pasting an API key. The bundle only serves it behind a login, since it carries
 * the key.
 */

export interface Bundle {
	/** gRPC-Web base URL of the node. */
	nodeUrl: string;
	/** OpenAI-compatible base URL of goose-gateway. */
	gatewayUrl: string;
	/** ldk-server API key, hex. */
	apiKey: string;
}

/** An ldk-server API key: 32 random bytes, hex encoded. */
const API_KEY = /^[0-9a-f]{64}$/i;

/**
 * Validate what `/bundle.json` returned and resolve its URLs against the page's origin: an
 * empty `nodeUrl` means "this origin", and `gatewayUrl` may be a path such as `/goose/v1`.
 * Anything malformed yields null, so a missing or foreign file never half-configures the app.
 */
export function parseBundle(raw: unknown, origin: string): Bundle | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const b = raw as Record<string, unknown>;
	if (typeof b.apiKey !== 'string' || !API_KEY.test(b.apiKey)) return null;
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
	return { nodeUrl, gatewayUrl, apiKey: b.apiKey.toLowerCase() };
}

/**
 * Fetch `/bundle.json` from the page's own origin. Resolves null when there is no bundle: a
 * static host answers unknown paths with the app's HTML, so anything but JSON is "no bundle".
 */
export async function loadBundle(
	origin: string,
	doFetch: typeof fetch = (input, init) => globalThis.fetch(input, init)
): Promise<Bundle | null> {
	try {
		const res = await doFetch(new URL('/bundle.json', origin).href, {
			cache: 'no-store',
			credentials: 'same-origin'
		});
		if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
		return parseBundle(await res.json(), origin);
	} catch {
		return null;
	}
}
