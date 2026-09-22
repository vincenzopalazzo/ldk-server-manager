import type { ChannelForwardingStats, ForwardedPayment } from '@ldk-server-manager/client';
import { requireClient } from '$lib/api/client.svelte';
import { PagedList } from './payments.svelte';
import { Resource } from './resource.svelte';

/** Per-channel forwarding statistics (all pages). */
export const forwardingStats = new PagedList<ChannelForwardingStats>(async (pageToken) => {
	const res = await requireClient().api.listChannelForwardingStats({ pageToken });
	return { items: res.stats, next: res.nextPageToken };
});

const THIRTY_DAYS = 30 * 24 * 3600;

export interface FeeSummary {
	/** Fees earned in the window, in sats. */
	feesSats: bigint;
	/** Number of forwards in the window. */
	count: number;
	/** Five 6-day buckets (oldest first) as 0..100 of the max bucket. */
	buckets: number[];
	/** True when detailed forwarded-payment tracking is available. */
	detailed: boolean;
}

/**
 * Fees earned in the last 30 days, computed from ListForwardedPayments (most recent
 * first). Falls back to the aggregate channel stats when detailed tracking is off.
 */
export const feeSummary = new Resource<FeeSummary>(async () => {
	const api = requireClient().api;
	const now = Math.floor(Date.now() / 1000);
	const since = now - THIRTY_DAYS;
	const recent: ForwardedPayment[] = [];
	let token: string | undefined;
	let pages = 0;
	let older = false;
	do {
		const res = await api.listForwardedPayments({ pageToken: token });
		for (const fp of res.forwardedPayments) {
			if (Number(fp.forwardedAtTimestamp) < since) {
				older = true;
				break;
			}
			recent.push(fp);
		}
		token = res.nextPageToken;
		pages++;
	} while (token && !older && pages < 20);

	if (recent.length === 0 && !older) {
		// No detailed history: aggregate from channel stats.
		let fees = 0n;
		let count = 0;
		let t: string | undefined;
		do {
			const res = await api.listChannelForwardingStats({ pageToken: t });
			for (const s of res.stats) {
				fees += (s.totalFeeEarnedMsat ?? 0n) / 1000n;
				count += Number(s.outboundPaymentsForwarded);
			}
			t = res.nextPageToken;
		} while (t);
		return { feesSats: fees, count, buckets: [0, 0, 0, 0, 0], detailed: false };
	}

	const bucketMs = new Array<bigint>(5).fill(0n);
	let fees = 0n;
	for (const fp of recent) {
		const fee = fp.totalFeeEarnedMsat ?? 0n;
		fees += fee;
		const age = now - Number(fp.forwardedAtTimestamp);
		const idx = Math.min(4, Math.max(0, 4 - Math.floor(age / (6 * 24 * 3600))));
		bucketMs[idx] += fee;
	}
	const max = bucketMs.reduce((a, b) => (b > a ? b : a), 0n);
	const buckets = bucketMs.map((b) =>
		max === 0n ? 0 : Math.round((Number(b) * 100) / Number(max))
	);
	return { feesSats: fees / 1000n, count: recent.length, buckets, detailed: true };
});
