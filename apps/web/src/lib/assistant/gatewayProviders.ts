import { sseData } from './providers/openaiStream';

/**
 * The goose gateway's provider setup API: what goose can use, whether each is set up, and
 * how to set it up (save a key, or run a subscription sign-in).
 *
 * See https://github.com/vincenzopalazzo/goose-gateway#readme. Secrets go to the gateway and
 * are stored by goose on that machine; the gateway never sends one back.
 */

export interface GatewayField {
	key: string;
	label: string;
	secret: boolean;
	required: boolean;
	placeholder: string | null;
	default: string | null;
	/** A value is stored. */
	set: boolean;
	/** The stored value, for non-secret fields only. */
	value: string | null;
}

export interface GatewayProvider {
	id: string;
	name: string;
	description: string;
	/** goose's setup method, e.g. `oauth_browser`, `single_api_key`, `config_fields`. */
	method: string;
	/** In goose's default list; the rest are niche or enterprise. */
	featured: boolean;
	docs_url: string | null;
	/** Set up by signing in to an account rather than with fields. */
	sign_in: boolean;
	fields: GatewayField[];
	configured: boolean;
	default_model: string;
	models: string[];
}

export type SignInEvent =
	| { type: 'started'; provider: string }
	| { type: 'device_code'; user_code: string; verification_uri: string; expires_in: number }
	| { type: 'open_url'; url: string }
	| { type: 'done'; provider: GatewayProvider }
	| { type: 'error'; message: string };

/** `http://127.0.0.1:8791/v1` -> `http://127.0.0.1:8791`. */
export function gatewayBase(host: string): string {
	return host.trim().replace(/\/+$/, '').replace(/\/v1$/, '');
}

async function failure(res: Response): Promise<Error> {
	const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
	return new Error(body?.error?.message ?? `The gateway answered ${res.status}`);
}

async function call<T>(host: string, path: string, init?: RequestInit): Promise<T> {
	let res: Response;
	try {
		res = await fetch(`${gatewayBase(host)}${path}`, init);
	} catch {
		throw new Error(`Could not reach the gateway at ${gatewayBase(host)}.`);
	}
	if (!res.ok) throw await failure(res);
	return (await res.json()) as T;
}

export async function listProviders(host: string): Promise<GatewayProvider[]> {
	const body = await call<{ providers: GatewayProvider[] }>(host, '/v1/providers');
	return body.providers;
}

const json = (body: unknown): RequestInit => ({
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify(body)
});

export function saveProvider(
	host: string,
	id: string,
	fields: Record<string, string>
): Promise<GatewayProvider> {
	return call(host, `/v1/providers/${encodeURIComponent(id)}/config`, json({ fields }));
}

export function removeProvider(host: string, id: string): Promise<GatewayProvider> {
	return call(host, `/v1/providers/${encodeURIComponent(id)}/config`, { method: 'DELETE' });
}

/** Hand the address a redirect sign-in landed on back to the gateway. */
export async function submitSignInCallback(host: string, id: string, url: string): Promise<void> {
	await call(
		host,
		`/v1/providers/${encodeURIComponent(id)}/sign-in/callback`,
		json({ url: url.trim() })
	);
}

/**
 * Run a sign-in, reporting each step. Resolves with the final event (`done` or `error`).
 * Aborting the signal cancels the sign-in on the gateway too.
 */
export async function signIn(
	host: string,
	id: string,
	onEvent: (event: SignInEvent) => void,
	signal?: AbortSignal
): Promise<SignInEvent> {
	let res: Response;
	try {
		res = await fetch(`${gatewayBase(host)}/v1/providers/${encodeURIComponent(id)}/sign-in`, {
			method: 'POST',
			signal
		});
	} catch (e) {
		if (signal?.aborted) throw e;
		throw new Error(`Could not reach the gateway at ${gatewayBase(host)}.`, { cause: e });
	}
	if (!res.ok) throw await failure(res);
	if (!res.body) throw new Error('The gateway sent no sign-in progress.');

	for await (const data of sseData(res.body)) {
		let event: SignInEvent;
		try {
			event = JSON.parse(data) as SignInEvent;
		} catch {
			continue;
		}
		onEvent(event);
		if (event.type === 'done' || event.type === 'error') return event;
	}
	return { type: 'error', message: 'The sign-in stopped before it finished.' };
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

export type ProviderKind = 'subscription' | 'key' | 'local' | 'host';

/**
 * What the operator does to set a provider up:
 * sign in to an account, paste a key, point at a local server, or (cloud credentials, CLIs)
 * set it up on the gateway's machine, which a page cannot do.
 */
export function providerKind(p: GatewayProvider): ProviderKind {
	if (p.sign_in) return 'subscription';
	if (['cloud_credentials', 'cli_auth', 'none'].includes(p.method)) return 'host';
	if (p.method === 'local') return 'local';
	// Anything that takes a secret is set up with a key, even when goose marks it optional
	// (OpenAI-compatible hosts, Databricks with its OAuth fallback). Only key-less ones are local.
	return p.fields.some((f) => f.secret) ? 'key' : 'local';
}

export interface ProviderGroups {
	subscriptions: GatewayProvider[];
	keys: GatewayProvider[];
	local: GatewayProvider[];
	/** Not in goose's default list, or only configurable on the gateway's machine. */
	more: GatewayProvider[];
}

/** Ready ones first, then by name. */
function byReadiness(a: GatewayProvider, b: GatewayProvider): number {
	if (a.configured !== b.configured) return a.configured ? -1 : 1;
	return a.name.localeCompare(b.name);
}

export function groupProviders(list: GatewayProvider[]): ProviderGroups {
	const groups: ProviderGroups = { subscriptions: [], keys: [], local: [], more: [] };
	for (const p of list) {
		const kind = providerKind(p);
		// A subscription is always worth showing; the rest only when goose features it.
		if (kind === 'subscription') groups.subscriptions.push(p);
		else if (kind === 'host' || !p.featured) groups.more.push(p);
		else if (kind === 'key') groups.keys.push(p);
		else groups.local.push(p);
	}
	groups.subscriptions.sort(byReadiness);
	groups.keys.sort(byReadiness);
	groups.local.sort(byReadiness);
	groups.more.sort(byReadiness);
	return groups;
}

/**
 * A link from the gateway, only if it is an https page. The gateway's address is editable, so
 * whatever answers there is not trusted to put a `javascript:` URL into this page.
 */
export function externalLink(raw: string | null | undefined): string | null {
	if (!raw) return null;
	try {
		return new URL(raw).protocol === 'https:' ? raw : null;
	} catch {
		return null;
	}
}

/** The address a redirect sign-in lands on, or why what was pasted is not it. */
export function checkRedirectAddress(raw: string): string | null {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		return 'Paste the whole address from the browser’s address bar.';
	}
	const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
	if (url.protocol !== 'http:' || !loopback) {
		return 'That is the sign-in page, not the callback. Paste the address the browser tried to open. It starts with http://127.0.0.1 or http://localhost and includes ?code=.';
	}
	if (!url.search) return 'The address is cut off: it should include the part after “?”.';
	return null;
}
