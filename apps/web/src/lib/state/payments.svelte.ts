import type { Payment, ForwardedPayment } from '@ldk-server-manager/client';
import { requireClient } from '$lib/api/client.svelte';
import { describeError } from './resource.svelte';

/**
 * Cursor-paginated list backed by ldk-server's `page_token` scheme.
 * `refresh()` reloads from the first page; `loadMore()` appends the next page.
 */
export class PagedList<T> {
	items = $state<T[]>([]);
	loading = $state(false);
	error = $state<string | null>(null);
	nextPageToken = $state<string | undefined>(undefined);
	loadedOnce = $state(false);

	constructor(
		private readonly fetchPage: (pageToken?: string) => Promise<{ items: T[]; next?: string }>
	) {}

	get hasMore(): boolean {
		return this.nextPageToken !== undefined;
	}

	async refresh(): Promise<void> {
		await this.load(undefined, true);
	}

	async loadMore(): Promise<void> {
		if (!this.hasMore || this.loading) return;
		await this.load(this.nextPageToken, false);
	}

	/** Keep loading pages until there are none left or `maxItems` is reached. */
	async loadAll(maxItems = 5000): Promise<void> {
		await this.refresh();
		while (this.hasMore && this.items.length < maxItems && !this.error) {
			await this.loadMore();
		}
	}

	private async load(token: string | undefined, replace: boolean) {
		this.loading = true;
		try {
			const page = await this.fetchPage(token);
			this.items = replace ? page.items : [...this.items, ...page.items];
			this.nextPageToken = page.next;
			this.error = null;
			this.loadedOnce = true;
		} catch (e) {
			this.error = describeError(e);
		} finally {
			this.loading = false;
		}
	}

	reset() {
		this.items = [];
		this.nextPageToken = undefined;
		this.error = null;
		this.loading = false;
		this.loadedOnce = false;
	}
}

export const payments = new PagedList<Payment>(async (pageToken) => {
	const res = await requireClient().api.listPayments({ pageToken });
	return { items: res.payments, next: res.nextPageToken };
});

export const forwardedPayments = new PagedList<ForwardedPayment>(async (pageToken) => {
	const res = await requireClient().api.listForwardedPayments({ pageToken });
	return { items: res.forwardedPayments, next: res.nextPageToken };
});
