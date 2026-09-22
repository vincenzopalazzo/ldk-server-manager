<script lang="ts">
	import { Card, Ellipsis, ListRow } from '@ldk-server-manager/ui';
	import { forwardingStats } from '$lib/state/forwarding.svelte';
	import { channels } from '$lib/state/node.svelte';
	import { aliases } from '$lib/state/aliases.svelte';
	import { prefs } from '$lib/state/prefs.svelte';
	import { formatScid } from '$lib/utils/scid';
	import { msatToSats } from '$lib/utils/format';

	const COLS = 'minmax(0,1.4fr) 90px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)';

	$effect(() => {
		if (!forwardingStats.loadedOnce) void forwardingStats.loadAll();
	});

	const rows = $derived(
		forwardingStats.items.map((s) => {
			const ch = (channels.data ?? []).find((c) => c.channelId === s.channelId);
			const peerId = s.counterpartyNodeId ?? ch?.counterpartyNodeId;
			const fees = msatToSats(s.totalFeeEarnedMsat);
			return {
				id: s.channelId,
				peer: peerId
					? aliases.get(peerId)
					: ch
						? aliases.get(ch.counterpartyNodeId)
						: 'closed channel',
				scid: ch ? formatScid(ch.shortChannelId) : '—',
				count: Number(s.inboundPaymentsForwarded + s.outboundPaymentsForwarded).toLocaleString(
					'en-US'
				),
				inVol: prefs.fmt(msatToSats(s.totalInboundAmountMsat)),
				outVol: prefs.fmt(msatToSats(s.totalOutboundAmountMsat)),
				fees: prefs.fmt(fees),
				earned: fees > 0n
			};
		})
	);
</script>

<Card title="Forwarding stats · per channel">
	<ListRow columns={COLS} padding="10px 20px" divider="line" fontSize={10.5}>
		<span class="h">Channel</span>
		<span class="h r">Forwards</span>
		<span class="h r">Inbound vol</span>
		<span class="h r">Outbound vol</span>
		<span class="h r">Fees earned</span>
	</ListRow>
	{#each rows as f (f.id)}
		<ListRow columns={COLS}>
			<div class="who">
				<Ellipsis strong>{f.peer}</Ellipsis>
				<div class="scid">{f.scid}</div>
			</div>
			<span class="mono r">{f.count}</span>
			<span class="mono r muted">{f.inVol}</span>
			<span class="mono r muted">{f.outVol}</span>
			<span class="mono r fees" class:earned={f.earned}>{f.fees}</span>
		</ListRow>
	{:else}
		<div class="empty">
			{forwardingStats.loading
				? 'Loading…'
				: (forwardingStats.error ?? 'No forwards recorded yet.')}
		</div>
	{/each}
</Card>

<style>
	.h {
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.r {
		text-align: right;
	}
	.who {
		min-width: 0;
	}
	.scid {
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--muted);
	}
	.mono {
		font-family: var(--font-mono);
	}
	.muted {
		color: var(--muted);
	}
	.fees {
		font-weight: 600;
		color: var(--muted);
	}
	.earned {
		color: var(--green);
	}
	.empty {
		padding: 16px 20px;
		font-size: 12.5px;
		color: var(--muted);
	}
</style>
