import { describe, expect, it } from 'vitest';
import { Resource } from './resource.svelte';

describe('Resource', () => {
	it('stores data on success', async () => {
		const r = new Resource(async () => 42);
		await expect(r.refresh()).resolves.toBe(42);
		expect(r.data).toBe(42);
		expect(r.error).toBeNull();
		expect(r.loading).toBe(false);
	});

	it('treats a fetcher that throws synchronously like a failed request', async () => {
		// Mirrors `() => requireClient().api.getBalances()` with no connection configured.
		const r = new Resource<number>(() => {
			throw new Error('Not connected to an ldk-server instance');
		});
		await expect(r.refresh()).resolves.toBeUndefined();
		expect(r.error).toBe('Not connected to an ldk-server instance');
		expect(r.loading).toBe(false);
	});

	it('records a rejected fetch and clears stale data', async () => {
		let ok = true;
		const r = new Resource(async () => {
			if (!ok) throw new Error('boom');
			return 'fresh';
		});
		await r.refresh();
		ok = false;
		await r.refresh();
		expect(r.data).toBeUndefined();
		expect(r.error).toBe('boom');
	});
});
