import { describe, expect, it, vi } from 'vitest';
import { loadBundle, parseBundle } from './bundle';

const key = 'ab'.repeat(32);
const origin = 'http://umbrel.local:2150';

describe('parseBundle', () => {
	it('resolves an empty node URL and a gateway path against the page origin', () => {
		expect(parseBundle({ nodeUrl: '', gatewayUrl: '/goose/v1', apiKey: key }, origin)).toEqual({
			nodeUrl: 'http://umbrel.local:2150',
			gatewayUrl: 'http://umbrel.local:2150/goose/v1',
			apiKey: key
		});
	});

	it('defaults a missing gateway to /goose/v1 and keeps absolute URLs', () => {
		const b = parseBundle(
			{ nodeUrl: 'https://node.example:8080/', apiKey: key.toUpperCase() },
			origin
		);
		expect(b).toEqual({
			nodeUrl: 'https://node.example:8080',
			gatewayUrl: 'http://umbrel.local:2150/goose/v1',
			apiKey: key
		});
	});

	it('rejects anything that is not a 32-byte hex key or an http(s) URL', () => {
		expect(parseBundle(null, origin)).toBeNull();
		expect(parseBundle('<!doctype html>', origin)).toBeNull();
		expect(parseBundle({ apiKey: 'abc' }, origin)).toBeNull();
		expect(parseBundle({ apiKey: 'zz'.repeat(32) }, origin)).toBeNull();
		expect(parseBundle({ apiKey: key, nodeUrl: 'javascript:alert(1)' }, origin)).toBeNull();
	});
});

describe('loadBundle', () => {
	const respond = (body: string, type: string, status = 200) =>
		vi.fn().mockResolvedValue(new Response(body, { status, headers: { 'content-type': type } }));

	it('reads the bundle from the page origin', async () => {
		const fetch = respond(
			JSON.stringify({ nodeUrl: '', gatewayUrl: '/goose/v1', apiKey: key }),
			'application/json'
		);
		expect((await loadBundle(origin, fetch))?.apiKey).toBe(key);
		expect(fetch.mock.calls[0][0]).toBe('http://umbrel.local:2150/bundle.json');
	});

	it('treats a static host answering with the app shell as no bundle', async () => {
		expect(
			await loadBundle(origin, respond('<!doctype html><html></html>', 'text/html'))
		).toBeNull();
	});

	it('gives up on a request that never answers', async () => {
		const hang = vi.fn(
			(_input: RequestInfo | URL, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) =>
					init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
				)
		);
		expect(await loadBundle(origin, hang as unknown as typeof fetch, 20)).toBeNull();
	});

	it('treats a 404 or a network failure as no bundle', async () => {
		expect(await loadBundle(origin, respond('{}', 'application/json', 404))).toBeNull();
		expect(
			await loadBundle(origin, vi.fn().mockRejectedValue(new TypeError('offline')))
		).toBeNull();
	});
});
