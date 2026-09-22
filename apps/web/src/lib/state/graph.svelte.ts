import { requireClient } from '$lib/api/client.svelte';
import { Resource } from './resource.svelte';

/** Number of nodes known to the gossip graph. Loaded lazily (the list can be large). */
export const graphNodeCount = new Resource(
	async () => (await requireClient().api.graphListNodes()).nodeIds.length
);

/** Number of channels known to the gossip graph. */
export const graphChannelCount = new Resource(
	async () => (await requireClient().api.graphListChannels()).shortChannelIds.length
);
