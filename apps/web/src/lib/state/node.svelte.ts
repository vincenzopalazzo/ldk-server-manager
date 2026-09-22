import { requireClient } from '$lib/api/client.svelte';
import { Resource } from './resource.svelte';

export const nodeInfo = new Resource(() => requireClient().api.getNodeInfo());
export const balances = new Resource(() => requireClient().api.getBalances());
export const channels = new Resource(async () => (await requireClient().api.listChannels()).channels);
export const peers = new Resource(async () => (await requireClient().api.listPeers()).peers);

/** Reset every cached resource, e.g. after disconnecting or switching servers. */
export function resetAll() {
	for (const r of [nodeInfo, balances, channels, peers]) r.reset();
}
