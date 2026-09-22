/**
 * Health of the goose gateway (https://github.com/vincenzopalazzo/goose-gateway).
 *
 * The gateway serves the OpenAI API under `/v1` and a health report at `/health` beside it,
 * so the health URL is the configured host with its trailing `/v1` swapped for `/health`.
 * That keeps working when the gateway sits behind a reverse proxy under a path prefix.
 */

export type GatewayState =
	/** Answered, and goose has a usable credential. */
	| 'online'
	/** Answered, but goose could not build its provider: nobody has signed in. */
	| 'no-credential'
	/** Nothing answered: not running, wrong address, or blocked. */
	| 'unreachable'
	/** Answered with something unexpected. */
	| 'error';

export interface GatewayCheck {
	state: GatewayState;
	/** The goose provider behind the gateway, e.g. `xai_oauth`. */
	provider: string | null;
	/** Round trip of the health request. */
	latencyMs: number | null;
	/** Extra detail for `error`. */
	detail: string | null;
	/** Where the check went, so the UI can show exactly what was probed. */
	url: string;
	checkedAt: number;
}

/** `http://127.0.0.1:8791/v1` -> `http://127.0.0.1:8791/health`; `…/goose/v1/` -> `…/goose/health`. */
export function healthUrl(host: string): string {
	const base = host.trim().replace(/\/+$/, '').replace(/\/v1$/, '');
	return `${base}/health`;
}

interface HealthBody {
	ok?: unknown;
	provider?: unknown;
	credential?: unknown;
}

/**
 * Probe the gateway. Never throws: every outcome, including a network failure or a
 * timeout, comes back as a `GatewayCheck`, so callers only ever render a state.
 */
export async function checkGateway(
	host: string,
	opts: { fetch?: typeof fetch; timeoutMs?: number; now?: () => number } = {}
): Promise<GatewayCheck> {
	const doFetch = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
	const now = opts.now ?? (() => performance.now());
	const url = healthUrl(host);
	const base = { provider: null, latencyMs: null, detail: null, url, checkedAt: Date.now() };

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000);
	const started = now();
	try {
		const res = await doFetch(url, { signal: controller.signal, cache: 'no-store' });
		const latencyMs = Math.round(now() - started);
		if (!res.ok) {
			return { ...base, state: 'error', latencyMs, detail: `HTTP ${res.status}` };
		}
		const body = (await res.json().catch(() => null)) as HealthBody | null;
		if (!body || body.ok !== true) {
			return { ...base, state: 'error', latencyMs, detail: 'unexpected health response' };
		}
		const provider = typeof body.provider === 'string' ? body.provider : null;
		return {
			...base,
			state: body.credential === true ? 'online' : 'no-credential',
			provider,
			latencyMs
		};
	} catch {
		return { ...base, state: 'unreachable' };
	} finally {
		clearTimeout(timer);
	}
}
