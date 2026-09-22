import { Resource } from '$lib/state/resource.svelte';
import { assistantConfig } from './config.svelte';
import { checkGateway, type GatewayCheck } from './gateway';

/**
 * Live gateway status for the active assistant settings. Reads the host at call time,
 * so changing it in the assistant's Setup panel is picked up on the next check.
 */
export const gatewayHealth = new Resource<GatewayCheck>(() => checkGateway(assistantConfig.host));
