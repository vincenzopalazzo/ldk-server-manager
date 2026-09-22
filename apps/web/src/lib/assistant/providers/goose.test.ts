import { afterEach, describe, expect, it, vi } from 'vitest';
import { gooseProvider, GOOSE_GATEWAY_HOST } from './goose';
import { xaiProvider, XAI_DEFAULT_HOST } from './xai';
import { ProviderAuthError, type Turn } from './types';
import { TOOLS } from '../tools';

const turn: Turn = {
	system: 'sys',
	history: [{ role: 'user', text: 'hi' }],
	tools: TOOLS,
	resolved: []
};

/** A fresh Response each call: a body can only be consumed once. */
function respond(body: unknown, status = 200) {
	return vi.fn().mockImplementation(() =>
		Promise.resolve(
			new Response(JSON.stringify(body), {
				status,
				headers: { 'content-type': 'application/json' }
			})
		)
	);
}

const reply = { choices: [{ message: { role: 'assistant', content: 'pong', tool_calls: [] } }] };

afterEach(() => vi.unstubAllGlobals());

describe('goose preset', () => {
	it('is the xAI provider aimed at the gateway, with no token required', () => {
		expect(gooseProvider.id).toBe('goose');
		expect(gooseProvider.defaultHost).toBe(GOOSE_GATEWAY_HOST);
		expect(gooseProvider.tokenOptional).toBe(true);
		expect(gooseProvider.models).toBe(xaiProvider.models);
	});

	it('posts to the gateway with a placeholder bearer when no token is set', async () => {
		const fetchMock = respond(reply);
		vi.stubGlobal('fetch', fetchMock);
		const out = await gooseProvider.send(turn, { token: '', model: 'grok-4.7' });
		expect(out.text).toBe('pong');
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(`${GOOSE_GATEWAY_HOST}/chat/completions`);
		expect((init.headers as Record<string, string>).authorization).toBe('Bearer goose');
	});

	it('honours a host override', async () => {
		const fetchMock = respond(reply);
		vi.stubGlobal('fetch', fetchMock);
		await gooseProvider.send(turn, {
			token: '',
			model: 'grok-4.7',
			host: 'http://gw.local:9000/v1/'
		});
		expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
			'http://gw.local:9000/v1/chat/completions'
		);
	});
});

describe('xAI provider host handling', () => {
	it('defaults to api.x.ai', async () => {
		const fetchMock = respond(reply);
		vi.stubGlobal('fetch', fetchMock);
		await xaiProvider.send(turn, { token: 't', model: 'grok-4.7' });
		expect((fetchMock.mock.calls[0] as [string])[0]).toBe(`${XAI_DEFAULT_HOST}/chat/completions`);
	});

	it('surfaces the gateway error message on 401', async () => {
		vi.stubGlobal('fetch', respond({ error: { message: 'run goose configure first' } }, 401));
		const err = await xaiProvider.send(turn, { token: 't', model: 'grok-4.7' }).catch((e) => e);
		expect(err).toBeInstanceOf(ProviderAuthError);
		expect(err.message).toBe('run goose configure first');
	});

	it('reports an unreachable host as an auth-class error, not a crash', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
		await expect(
			xaiProvider.send(turn, { token: 't', model: 'grok-4.7', host: 'http://127.0.0.1:1/v1' })
		).rejects.toThrow(/Could not reach/);
	});
});
