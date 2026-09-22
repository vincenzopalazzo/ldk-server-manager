import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GATEWAY_POLL_MS, gatewayHealth, watchGateway } from './gateway.svelte';

const healthy = () =>
	Promise.resolve(
		new Response(JSON.stringify({ ok: true, provider: 'xai_oauth', credential: true }), {
			headers: { 'content-type': 'application/json' }
		})
	);

describe('watchGateway', () => {
	let fetch: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.useFakeTimers();
		fetch = vi.fn().mockImplementation(healthy);
		vi.stubGlobal('fetch', fetch);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('keeps polling until the last view lets go', async () => {
		const releaseCard = watchGateway();
		await vi.advanceTimersByTimeAsync(0);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(gatewayHealth.data?.state).toBe('online');

		// Opening the drawer checks right away rather than waiting for the next tick.
		const releaseDrawer = watchGateway();
		await vi.advanceTimersByTimeAsync(0);
		expect(fetch).toHaveBeenCalledTimes(2);

		// Closing the drawer must not stop the Settings card's updates.
		releaseDrawer();
		await vi.advanceTimersByTimeAsync(GATEWAY_POLL_MS);
		expect(fetch).toHaveBeenCalledTimes(3);

		releaseCard();
		await vi.advanceTimersByTimeAsync(GATEWAY_POLL_MS * 3);
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it('ignores a release called twice', async () => {
		const a = watchGateway();
		const b = watchGateway();
		await vi.advanceTimersByTimeAsync(0);
		const before = fetch.mock.calls.length;

		b();
		b(); // must not also release a's hold
		await vi.advanceTimersByTimeAsync(GATEWAY_POLL_MS);
		expect(fetch.mock.calls.length).toBe(before + 1);

		a();
		await vi.advanceTimersByTimeAsync(GATEWAY_POLL_MS * 2);
		expect(fetch.mock.calls.length).toBe(before + 1);
	});
});
