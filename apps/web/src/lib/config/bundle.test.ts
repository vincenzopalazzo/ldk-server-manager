import { describe, expect, it, vi } from 'vitest';
import { loadBundle, parseBundle, probeBundle, waitForBundle } from './bundle';

const macaroon =
	'0201000207746573742d6964000006203846eea2ed59d53650493222c2380a3540668ade20044e28f9cb1e0b5b4e4429';
const origin = 'http://umbrel.local:2150';

describe('parseBundle', () => {
	it('resolves an empty node URL and a gateway path against the page origin', () => {
		expect(parseBundle({ nodeUrl: '', gatewayUrl: '/goose/v1', macaroon }, origin)).toEqual({
			nodeUrl: 'http://umbrel.local:2150',
			gatewayUrl: 'http://umbrel.local:2150/goose/v1',
			macaroon
		});
	});

	it('defaults a missing gateway to /goose/v1 and keeps absolute URLs', () => {
		const b = parseBundle(
			{ nodeUrl: 'https://node.example:8080/', macaroon: macaroon.toUpperCase() },
			origin
		);
		expect(b).toEqual({
			nodeUrl: 'https://node.example:8080',
			gatewayUrl: 'http://umbrel.local:2150/goose/v1',
			macaroon
		});
	});

	it('rejects a non-macaroon credential or a non-http URL', () => {
		expect(parseBundle(null, origin)).toBeNull();
		expect(parseBundle('<!doctype html>', origin)).toBeNull();
		expect(parseBundle({ macaroon: 'abc' }, origin)).toBeNull();
		expect(parseBundle({ macaroon: 'ab'.repeat(32) }, origin)).toBeNull();
		expect(parseBundle({ macaroon, nodeUrl: 'javascript:alert(1)' }, origin)).toBeNull();
	});
});

describe('loadBundle', () => {
	const respond = (body: string, type: string, status = 200) =>
		vi.fn().mockResolvedValue(new Response(body, { status, headers: { 'content-type': type } }));

	it('reads the bundle from the page origin', async () => {
		const fetch = respond(
			JSON.stringify({ nodeUrl: '', gatewayUrl: '/goose/v1', macaroon }),
			'application/json'
		);
		expect((await loadBundle(origin, fetch))?.macaroon).toBe(macaroon);
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

describe('waitForBundle', () => {
	const bundleBody = JSON.stringify({ nodeUrl: '', gatewayUrl: '/goose/v1', macaroon });
	const answers = (...rs: Response[]) => {
		const f = vi.fn();
		for (const r of rs) f.mockResolvedValueOnce(r);
		return f;
	};
	const notYet = () =>
		new Response('<html>404</html>', { status: 404, headers: { 'content-type': 'text/html' } });
	const ready = () => new Response(bundleBody, { headers: { 'content-type': 'application/json' } });
	const shell = () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } });

	it('keeps looking while nginx has no bundle yet, then connects', async () => {
		const fetch = answers(notYet(), notYet(), ready());
		const afterFirst = vi.fn();
		const b = await waitForBundle(origin, {
			keepLooking: () => true,
			afterFirst,
			fetch,
			intervalMs: 1
		});
		expect(b?.macaroon).toBe(macaroon);
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(afterFirst).toHaveBeenCalledTimes(1);
	});

	it('stops at once where there is no bundle (the public site answers with the shell)', async () => {
		const fetch = answers(shell());
		expect(
			await waitForBundle(origin, { keepLooking: () => true, fetch, intervalMs: 1 })
		).toBeNull();
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('stops once the operator connects by hand, and gives up after its attempts', async () => {
		let connected = false;
		const fetch = vi.fn(async () => {
			connected = true;
			return notYet();
		});
		expect(
			await waitForBundle(origin, { keepLooking: () => !connected, fetch, intervalMs: 1 })
		).toBeNull();
		expect(fetch).toHaveBeenCalledTimes(1);

		const always404 = vi.fn(async () => notYet());
		expect(
			await waitForBundle(origin, {
				keepLooking: () => true,
				fetch: always404,
				intervalMs: 1,
				attempts: 3
			})
		).toBeNull();
		expect(always404).toHaveBeenCalledTimes(3);
	});

	it('only a 404 is worth another look', async () => {
		expect((await probeBundle(origin, answers(notYet()))).retry).toBe(true);
		expect((await probeBundle(origin, answers(shell()))).retry).toBe(false);
		expect((await probeBundle(origin, answers(ready()))).bundle?.macaroon).toBe(macaroon);
	});
});
