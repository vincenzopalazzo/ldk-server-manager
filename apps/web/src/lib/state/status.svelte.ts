import { connection } from '$lib/config/connection.svelte';
import { balances, channels, nodeInfo, peers } from './node.svelte';

export type LinkState =
	/** No server configured yet. */
	| 'disconnected'
	/** Configured, first responses not in yet. */
	| 'connecting'
	/** The node rejected the API key. */
	| 'unauthorized'
	/** The node or its bridge could not be reached. */
	| 'unreachable'
	/** Something else went wrong. */
	| 'error'
	/** Talking to the node. */
	| 'online';

const CORE = () => [nodeInfo, balances, channels, peers];

/**
 * Aggregate health of the connection to the node.
 *
 * The UI must never present an unreachable or unauthenticated node as an empty one:
 * rendering `0 sats` for a funded node reads as lost funds. Everything that shows an
 * amount checks `isOnline` first and falls back to a placeholder.
 */
class NodeLink {
	get state(): LinkState {
		if (!connection.isConfigured) return 'disconnected';
		const core = CORE();
		if (core.some((r) => r.isAuthError)) return 'unauthorized';
		if (core.some((r) => r.isUnreachable)) return 'unreachable';
		if (nodeInfo.data !== undefined || balances.data !== undefined) return 'online';
		if (core.some((r) => r.error !== null)) return 'error';
		return 'connecting';
	}

	get isOnline(): boolean {
		return this.state === 'online';
	}

	/** Headline shown in the banner, or null when there is nothing wrong. */
	get title(): string | null {
		switch (this.state) {
			case 'unauthorized':
				return 'The node rejected this API key';
			case 'unreachable':
				return 'Cannot reach the node';
			case 'error':
				return 'The node returned an error';
			default:
				return null;
		}
	}

	/** What the operator should do about it. */
	get hint(): string | null {
		switch (this.state) {
			case 'unauthorized':
				return 'Check the key against `[api] key` in the node config, then save it again in Settings. Amounts are hidden until the node answers, so nothing below reflects your balance.';
			case 'unreachable':
				return 'Check that the gRPC-Web bridge is running and reachable at the configured URL, and that the node behind it is up.';
			case 'error':
				return this.detail;
			default:
				return null;
		}
	}

	/** First underlying error message, for detail lines. */
	get detail(): string | null {
		return CORE().find((r) => r.error !== null)?.error ?? null;
	}
}

export const nodeLink = new NodeLink();
