import { describe, expect, it, vi } from 'vitest';
import { checkGateway, healthUrl } from './gateway';

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

describe('healthUrl', () => {
	it('swaps the /v1 API prefix for /health', () => {
		expect(healthUrl('http://127.0.0.1:8791/v1')).toBe('http://127.0.0.1:8791/health');
		expect(healthUrl('http://127.0.0.1:8791/v1/')).toBe('http://127.0.0.1:8791/health');
	});

	it('keeps a reverse-proxy path prefix', () => {
		expect(healthUrl('https://box.example/goose/v1')).toBe('https://box.example/goose/health');
	});

	it('works when the host has no /v1 at all', () => {
		expect(healthUrl('http://gw:9000')).toBe('http://gw:9000/health');
	});
});

describe('checkGateway', () => {
	it('reports online with the provider when goose has a credential', async () => {
		const fetch = respond({ ok: true, provider: 'xai_oauth', credential: true });
		const check = await checkGateway('http://127.0.0.1:8791/v1', { fetch });
		expect(check.state).toBe('online');
		expect(check.provider).toBe('xai_oauth');
		expect(check.latencyMs).not.toBeNull();
		expect(check.url).toBe('http://127.0.0.1:8791/health');
	});

	it('reports no-credential when the gateway runs but nobody signed in', async () => {
		const fetch = respond({ ok: true, provider: 'xai_oauth', credential: false });
		const check = await checkGateway('http://127.0.0.1:8791/v1', { fetch });
		expect(check.state).toBe('no-credential');
	});

	it('reports unreachable instead of throwing on a network failure', async () => {
		const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
		const check = await checkGateway('http://127.0.0.1:1/v1', { fetch });
		expect(check.state).toBe('unreachable');
		expect(check.latencyMs).toBeNull();
	});

	it('reports unreachable when the request times out', async () => {
		const fetch = vi
			.fn()
			.mockImplementation(
				(_url: string, init: RequestInit) =>
					new Promise((_resolve, reject) =>
						init.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError')))
					)
			);
		const check = await checkGateway('http://10.255.255.1/v1', { fetch, timeoutMs: 20 });
		expect(check.state).toBe('unreachable');
	});

	it('reports an error for a non-2xx answer or an unexpected body', async () => {
		expect((await checkGateway('http://gw/v1', { fetch: respond({}, 500) })).detail).toBe(
			'HTTP 500'
		);
		const odd = await checkGateway('http://gw/v1', { fetch: respond({ hello: 'world' }) });
		expect(odd.state).toBe('error');
		expect(odd.detail).toBe('unexpected health response');
	});
});
