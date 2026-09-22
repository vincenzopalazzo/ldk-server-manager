import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	checkRedirectAddress,
	externalLink,
	gatewayBase,
	groupProviders,
	providerKind,
	saveProvider,
	signIn,
	type GatewayProvider,
	type SignInEvent
} from './gatewayProviders';

const provider = (over: Partial<GatewayProvider>): GatewayProvider => ({
	id: 'x',
	name: 'X',
	description: '',
	method: 'single_api_key',
	featured: true,
	docs_url: null,
	sign_in: false,
	fields: [],
	configured: false,
	default_model: 'm',
	models: [],
	...over
});

const key = (name: string, required = true) => ({
	key: name,
	label: name,
	secret: true,
	required,
	placeholder: null,
	default: null,
	set: false,
	value: null
});
const host = (name: string) => ({ ...key(name), secret: false });

afterEach(() => vi.unstubAllGlobals());

describe('gatewayBase', () => {
	it('drops the OpenAI /v1 prefix', () => {
		expect(gatewayBase('http://127.0.0.1:8791/v1/')).toBe('http://127.0.0.1:8791');
	});
});

describe('providerKind and groupProviders', () => {
	const list = [
		provider({ id: 'copilot', name: 'GitHub Copilot', sign_in: true, method: 'oauth_device_code' }),
		provider({
			id: 'xai_oauth',
			name: 'xAI',
			sign_in: true,
			method: 'oauth_browser',
			configured: true
		}),
		provider({ id: 'anthropic', name: 'Anthropic', fields: [key('ANTHROPIC_API_KEY')] }),
		provider({
			id: 'ollama',
			name: 'Ollama',
			method: 'config_fields',
			fields: [host('OLLAMA_HOST')]
		}),
		provider({
			id: 'lmstudio',
			name: 'LM Studio',
			method: 'config_fields',
			featured: false,
			fields: [key('LMSTUDIO_API_KEY', false), host('LMSTUDIO_HOST')]
		}),
		provider({ id: 'vertex', name: 'Vertex', method: 'cloud_credentials' }),
		provider({ id: 'groq', name: 'Groq', featured: false, fields: [key('GROQ_API_KEY')] })
	];

	it('tells sign-ins, keys, local servers and host-only setups apart', () => {
		const kinds = Object.fromEntries(list.map((p) => [p.id, providerKind(p)]));
		expect(kinds).toEqual({
			copilot: 'subscription',
			xai_oauth: 'subscription',
			anthropic: 'key',
			ollama: 'local',
			lmstudio: 'key', // an optional key still makes it a key provider
			vertex: 'host',
			groq: 'key'
		});
	});

	it('puts ready providers first and tucks the niche ones under More', () => {
		const g = groupProviders(list);
		expect(g.subscriptions.map((p) => p.id)).toEqual(['xai_oauth', 'copilot']);
		expect(g.keys.map((p) => p.id)).toEqual(['anthropic']);
		expect(g.local.map((p) => p.id)).toEqual(['ollama']);
		expect(g.more.map((p) => p.id).sort()).toEqual(['groq', 'lmstudio', 'vertex']);
	});
});

describe('checkRedirectAddress', () => {
	it('accepts the loopback redirect and explains anything else', () => {
		expect(checkRedirectAddress('http://127.0.0.1:56121/callback?code=a&state=b')).toBeNull();
		expect(checkRedirectAddress('http://localhost:1455/auth/callback?code=a')).toBeNull();
		expect(checkRedirectAddress('https://auth.x.ai/oauth2/authorize?x=1')).toMatch(/localhost/);
		expect(checkRedirectAddress('http://127.0.0.1:56121/callback')).toMatch(/cut off/);
		expect(checkRedirectAddress('hello')).toMatch(/whole address/);
	});
});

describe('externalLink', () => {
	it('only lets https pages through', () => {
		expect(externalLink('https://github.com/login/device')).toBe('https://github.com/login/device');
		expect(externalLink('javascript:alert(1)')).toBeNull();
		expect(externalLink('http://example.com')).toBeNull();
		expect(externalLink(null)).toBeNull();
	});
});

describe('saveProvider', () => {
	it('posts the fields and surfaces the gateway’s error message', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ error: { message: 'groq has no setting called EVIL' } }), {
				status: 400
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		await expect(saveProvider('http://gw/v1', 'groq', { EVIL: 'x' })).rejects.toThrow(
			'groq has no setting called EVIL'
		);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://gw/v1/providers/groq/config');
		expect(JSON.parse(init.body as string)).toEqual({ fields: { EVIL: 'x' } });
	});
});

describe('signIn', () => {
	it('reports each step and returns the final one', async () => {
		const done = provider({ id: 'copilot', configured: true, sign_in: true });
		const body =
			`data: ${JSON.stringify({ type: 'started', provider: 'copilot' })}\n\n` +
			`data: ${JSON.stringify({ type: 'device_code', user_code: 'AB-12', verification_uri: 'https://github.com/login/device', expires_in: 900 })}\n\n` +
			`data: ${JSON.stringify({ type: 'done', provider: done })}\n\n`;
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(new Response(body, { headers: { 'content-type': 'text/event-stream' } }))
		);
		const seen: SignInEvent['type'][] = [];
		const last = await signIn('http://gw/v1', 'copilot', (e) => seen.push(e.type));
		expect(seen).toEqual(['started', 'device_code', 'done']);
		expect(last).toEqual({ type: 'done', provider: done });
	});

	it('treats a stream that ends early as a failure', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					new Response(`data: ${JSON.stringify({ type: 'started', provider: 'copilot' })}\n\n`)
				)
		);
		expect((await signIn('http://gw/v1', 'copilot', () => {})).type).toBe('error');
	});
});
