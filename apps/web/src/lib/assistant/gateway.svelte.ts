import { Resource } from '$lib/state/resource.svelte';
import { assistantConfig } from './config.svelte';
import { checkGateway, type GatewayCheck } from './gateway';

/**
 * Live gateway status for the active assistant settings. Reads the host at call time,
 * so changing it in the assistant's Setup panel is picked up on the next check.
 */
export const gatewayHealth = new Resource<GatewayCheck>(() => checkGateway(assistantConfig.host));

export const GATEWAY_POLL_MS = 15_000;

let watchers = 0;
let stopPolling: (() => void) | null = null;

/**
 * Keep the gateway status fresh while at least one view shows it.
 *
 * The Settings card and the assistant drawer can be on screen together. `Resource.poll` owns a
 * single timer, so if each view polled directly, closing the drawer would silently stop the
 * card's updates too. Watchers are counted instead: the first starts polling, later ones just
 * trigger an immediate check, and the timer stops only when the last one lets go.
 *
 * Returns a release function; calling it more than once is harmless.
 */
export function watchGateway(): () => void {
	watchers += 1;
	if (watchers === 1) stopPolling = gatewayHealth.poll(GATEWAY_POLL_MS);
	else void gatewayHealth.refresh();

	let released = false;
	return () => {
		if (released) return;
		released = true;
		watchers -= 1;
		if (watchers === 0) {
			stopPolling?.();
			stopPolling = null;
		}
	};
}
