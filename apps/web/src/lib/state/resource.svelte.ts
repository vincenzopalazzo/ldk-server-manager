import { LdkServerError } from '@ldk-server-manager/client';

/** Human-readable message for any error thrown by the data layer. */
export function describeError(e: unknown): string {
	if (e instanceof LdkServerError) return e.message ? `${e.codeName}: ${e.message}` : e.codeName;
	if (e instanceof Error) return e.message;
	return String(e);
}

/**
 * A reactive, refreshable async value. Wraps a fetcher with loading/error state
 * and optional polling. Built on Svelte 5 runes so it can live in a module.
 */
export class Resource<T> {
	data = $state<T | undefined>(undefined);
	error = $state<string | null>(null);
	loading = $state(false);
	lastUpdated = $state<number | null>(null);

	private timer: ReturnType<typeof setInterval> | null = null;
	private inflight: Promise<T | undefined> | null = null;

	constructor(private readonly fetcher: () => Promise<T>) {}

	get isEmpty(): boolean {
		return this.data === undefined;
	}

	/** Fetch (or re-fetch). Concurrent calls share one request. */
	refresh(): Promise<T | undefined> {
		if (this.inflight) return this.inflight;
		this.loading = true;
		this.inflight = this.fetcher()
			.then((value) => {
				this.data = value;
				this.error = null;
				this.lastUpdated = Date.now();
				return value;
			})
			.catch((e: unknown) => {
				this.error = describeError(e);
				return undefined;
			})
			.finally(() => {
				this.loading = false;
				this.inflight = null;
			});
		return this.inflight;
	}

	/** Refresh now and keep refreshing every `intervalMs`. Returns a stop function. */
	poll(intervalMs: number): () => void {
		this.stop();
		void this.refresh();
		this.timer = setInterval(() => void this.refresh(), intervalMs);
		return () => this.stop();
	}

	stop() {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}

	reset() {
		this.stop();
		this.data = undefined;
		this.error = null;
		this.loading = false;
		this.lastUpdated = null;
	}
}
