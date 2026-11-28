import { SvelteMap } from 'svelte/reactivity';
import { getClient } from '$lib/api/client.svelte';
import { truncateId } from '$lib/utils/format';
import { isTransientRpcError, retryTransient } from './resource.svelte';

/**
 * Resolves node aliases from the gossip graph (GraphGetNode), cached per node id.
 * Unknown or unannounced nodes fall back to a shortened node id.
 */
class AliasStore {
	private cache = new SvelteMap<string, string | null>();
	private pending = new Set<string>();

	/** Synchronous accessor; triggers a background lookup on first use. */
	get(nodeId: string | undefined | null): string {
		if (!nodeId) return 'unknown';
		const hit = this.cache.get(nodeId);
		if (hit) return hit;
		if (hit === undefined && !this.pending.has(nodeId)) void this.lookup(nodeId);
		return truncateId(nodeId, 10, 6);
	}

	/** True when the graph knows an alias for this node. */
	has(nodeId: string): boolean {
		return !!this.cache.get(nodeId);
	}

	async lookup(nodeId: string): Promise<string | null> {
		const client = getClient();
		if (!client) return null;
		this.pending.add(nodeId);
		try {
			const res = await retryTransient(() => client.api.graphGetNode({ nodeId }));
			const alias = res.node?.announcementInfo?.alias?.trim() || null;
			this.cache.set(nodeId, alias);
			return alias;
		} catch (e) {
			// A dropped proxy call is not "this node has no alias". Caching that
			// leaves the page on a truncated pubkey until a full reload.
			if (!isTransientRpcError(e)) this.cache.set(nodeId, null);
			return null;
		} finally {
			this.pending.delete(nodeId);
		}
	}

	clear() {
		this.cache.clear();
	}
}

export const aliases = new AliasStore();
