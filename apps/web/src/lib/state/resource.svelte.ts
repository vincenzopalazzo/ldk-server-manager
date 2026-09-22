import { GrpcCode, LdkServerError } from '@ldk-server-manager/client';

/** Human-readable message for any error thrown by the data layer. */
export function describeError(e: unknown): string {
	if (e instanceof LdkServerError) return e.message ? `${e.codeName}: ${e.message}` : e.codeName;
	if (e instanceof Error) return e.message;
	return String(e);
}

/** gRPC status of a failure, when the error came from the server. */
export function errorCode(e: unknown): number | null {
	return e instanceof LdkServerError ? e.code : null;
}

/**
 * A reactive, refreshable async value. Wraps a fetcher with loading/error state
 * and optional polling. Built on Svelte 5 runes so it can live in a module.
 */
export class Resource<T> {
	data = $state<T | undefined>(undefined);
	error = $state<string | null>(null);
	/** gRPC status of the last failure, or null when it was not a server error. */
	code = $state<number | null>(null);
	loading = $state(false);
	lastUpdated = $state<number | null>(null);

	private timer: ReturnType<typeof setInterval> | null = null;
	private inflight: Promise<T | undefined> | null = null;

	constructor(private readonly fetcher: () => Promise<T>) {}

	get isEmpty(): boolean {
		return this.data === undefined;
	}

	/** The node rejected our credentials. Retrying cannot fix this on its own. */
	get isAuthError(): boolean {
		return this.code === GrpcCode.UNAUTHENTICATED;
	}

	/** The node could not be reached at all. */
	get isUnreachable(): boolean {
		return this.code === GrpcCode.UNAVAILABLE;
	}

	/** Fetch (or re-fetch). Concurrent calls share one request. */
	refresh(): Promise<T | undefined> {
		if (this.inflight) return this.inflight;
		this.loading = true;
		// Run the fetcher inside an async boundary: a fetcher that throws synchronously
		// (e.g. requireClient() with no connection) must land in .catch like any failed
		// request, not escape to the caller and leave `loading` stuck on.
		this.inflight = (async () => this.fetcher())()
			.then((value) => {
				this.data = value;
				this.error = null;
				this.code = null;
				this.lastUpdated = Date.now();
				return value;
			})
			.catch((e: unknown) => {
				this.error = describeError(e);
				this.code = errorCode(e);
				// Stale data must not outlive a failed refresh: showing the last known
				// balance next to an error reads as current, which is worse than nothing.
				this.data = undefined;
				// A rejected key will be rejected again; stop the timer until settings change.
				if (this.isAuthError) this.stop();
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
		this.code = null;
		this.loading = false;
		this.lastUpdated = null;
	}
}
