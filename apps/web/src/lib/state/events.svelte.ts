import type { EventEnvelope } from '@ldk-server-manager/client';
import { getClient } from '$lib/api/client.svelte';
import { describeError } from './resource.svelte';

export interface ReceivedEvent {
	id: number;
	receivedAt: number;
	envelope: EventEnvelope;
}

const MAX_EVENTS = 200;

/**
 * Live event feed from `SubscribeEvents`, with automatic reconnection.
 * Events are best-effort (see ldk-server docs): consumers should re-fetch
 * authoritative state when an event arrives.
 */
class EventFeed {
	events = $state<ReceivedEvent[]>([]);
	connected = $state(false);
	error = $state<string | null>(null);

	private controller: AbortController | null = null;
	private seq = 0;
	private listeners = new Set<(e: EventEnvelope) => void>();

	/** Register a callback for every incoming event. Returns an unsubscribe function. */
	onEvent(cb: (e: EventEnvelope) => void): () => void {
		this.listeners.add(cb);
		return () => this.listeners.delete(cb);
	}

	start() {
		if (this.controller) return;
		this.controller = new AbortController();
		void this.run(this.controller.signal);
	}

	stop() {
		this.controller?.abort();
		this.controller = null;
		this.connected = false;
	}

	clear() {
		this.events = [];
	}

	private async run(signal: AbortSignal) {
		let backoff = 1000;
		while (!signal.aborted) {
			const client = getClient();
			if (!client) {
				await sleep(1000, signal);
				continue;
			}
			try {
				this.connected = true;
				this.error = null;
				for await (const envelope of client.subscribeEvents(signal)) {
					backoff = 1000;
					this.push(envelope);
				}
			} catch (e) {
				if (signal.aborted) break;
				this.error = describeError(e);
			} finally {
				this.connected = false;
			}
			await sleep(backoff, signal);
			backoff = Math.min(backoff * 2, 30_000);
		}
	}

	private push(envelope: EventEnvelope) {
		const entry: ReceivedEvent = { id: ++this.seq, receivedAt: Date.now(), envelope };
		this.events = [entry, ...this.events].slice(0, MAX_EVENTS);
		for (const l of this.listeners) l(envelope);
	}
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const t = setTimeout(resolve, ms);
		signal.addEventListener('abort', () => {
			clearTimeout(t);
			resolve();
		});
	});
}

export const eventFeed = new EventFeed();
