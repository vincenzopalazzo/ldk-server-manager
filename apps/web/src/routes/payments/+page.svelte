<script lang="ts">
	import { Button, Card, Ellipsis, ListRow, Pill, PillTabs } from '@ldk-server-manager/ui';
	import { payments } from '$lib/state/payments.svelte';
	import { prefs } from '$lib/state/prefs.svelte';
	import {
		isOutbound,
		matchesFilter,
		paymentDescription,
		paymentKind,
		paymentShortId,
		paymentStatusLabel,
		paymentTone,
		type PayFilter
	} from '$lib/domain/payments';
	import { msatToSats, relativeTime } from '$lib/utils/format';
	import { PaymentStatus } from '@ldk-server-manager/client';

	const FILTERS: { key: PayFilter; label: string }[] = ['All', 'Sent', 'Received', 'Failed'].map(
		(f) => ({ key: f as PayFilter, label: f })
	);
	let filter = $state<PayFilter>('All');
	const rows = $derived(payments.items.filter((p) => matchesFilter(p, filter)));
	const COLS = '26px minmax(0,2fr) 90px minmax(0,1.2fr) 80px 90px';

	$effect(() => {
		if (!payments.loadedOnce) void payments.refresh();
	});
</script>

<Card title="Payments">
	{#snippet actions()}<PillTabs
			items={FILTERS}
			active={filter}
			onselect={(f) => (filter = f)}
			variant="filter"
		/>{/snippet}
	{#each rows as p (p.paymentId)}
		<ListRow columns={COLS}>
			<span class="arrow">{isOutbound(p) ? '↑' : '↓'}</span>
			<div class="who">
				<Ellipsis strong>{paymentDescription(p)}</Ellipsis>
				<Ellipsis mono muted size={10.5}>{paymentShortId(p)}</Ellipsis>
			</div>
			<span class="kind">{paymentKind(p)}</span>
			<span class="amt" class:failed={p.status === PaymentStatus.FAILED} class:in={!isOutbound(p)}>
				{isOutbound(p) ? '−' : '+'}{prefs.fmt(msatToSats(p.amountMsat))}
			</span>
			<Pill tone={paymentTone(p)} center>{paymentStatusLabel(p)}</Pill>
			<span class="time">{relativeTime(p.latestUpdateTimestamp)}</span>
		</ListRow>
	{:else}
		<div class="empty">
			{payments.loading ? 'Loading payments…' : (payments.error ?? 'No payments yet.')}
		</div>
	{/each}
	{#if payments.hasMore}
		<div class="more">
			<Button
				variant="soft"
				size="sm"
				onclick={() => payments.loadMore()}
				disabled={payments.loading}>Load more</Button
			>
		</div>
	{/if}
</Card>

<style>
	.arrow {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--soft);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
	}
	.who {
		min-width: 0;
	}
	.kind {
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--muted);
		text-transform: uppercase;
	}
	.amt {
		font-family: var(--font-mono);
		font-weight: 600;
		text-align: right;
		color: var(--ink);
	}
	.amt.in {
		color: var(--green);
	}
	.amt.failed {
		color: var(--muted);
	}
	.time {
		font-size: 11.5px;
		color: var(--muted);
		text-align: right;
	}
	.empty {
		padding: 16px 20px;
		font-size: 12.5px;
		color: var(--muted);
	}
	.more {
		display: flex;
		justify-content: center;
		padding: 12px;
	}
</style>
