<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button, Card, Dot, Sparkline, StatCard } from '@ldk-server-manager/ui';
	import ChannelRow from '$lib/components/ChannelRow.svelte';
	import { balances, channels, nodeInfo } from '$lib/state/node.svelte';
	import { feeSummary } from '$lib/state/forwarding.svelte';
	import { eventFeed } from '$lib/state/events.svelte';
	import { aliases } from '$lib/state/aliases.svelte';
	import { prefs } from '$lib/state/prefs.svelte';
	import { ui } from '$lib/state/ui.svelte';
	import { describeEvent } from '$lib/domain/events';
	import { relativeTime } from '$lib/utils/format';

	const alias = $derived(nodeInfo.data?.nodeAlias || 'node');
	const ln = $derived(balances.data?.totalLightningBalanceSats ?? 0n);
	const oc = $derived(balances.data?.totalOnchainBalanceSats ?? 0n);
	const sweeps = $derived(balances.data?.pendingBalancesFromChannelClosures ?? []);
	const claimable = $derived(
		sweeps.reduce((a, b) => {
			const v = b.balanceType.value;
			return a + (v && 'amountSatoshis' in v ? v.amountSatoshis : 0n);
		}, 0n)
	);
	const total = $derived(ln + oc + claimable);
	const pct = (part: bigint) =>
		total === 0n ? 0 : Math.round((Number(part) * 100) / Number(total));
	const chList = $derived(channels.data ?? []);
	const fees = $derived(feeSummary.data);
	const events = $derived(
		eventFeed.events.map((e) => ({
			id: e.id,
			...describeEvent(e.envelope, (id) => aliases.get(id)),
			time: relativeTime(Math.floor(e.receivedAt / 1000))
		}))
	);
</script>

<div class="col">
	<div class="top">
		<div>
			<div class="caption">{alias} · total balance</div>
			<div class="total">{prefs.fmt(total)} <span class="unit">{prefs.unitSuffix}</span></div>
		</div>
		<div class="actions">
			<Button variant="dark" size="xl" onclick={() => ui.open('send')}>↑ Send</Button>
			<Button size="xl" onclick={() => ui.open('receive')}>↓ Receive</Button>
			<Button variant="outline" size="xl" onclick={() => ui.open('channel')}>+ Open channel</Button>
		</div>
	</div>

	<div class="stats">
		<StatCard
			label="⚡ Lightning"
			value={prefs.fmt(ln)}
			note="{chList.length} channels · {pct(ln)}% of total"
		>
			<div class="mt12">
				<div class="bar"><div class="fill acc" style:width="{pct(ln)}%"></div></div>
			</div>
		</StatCard>
		<StatCard
			label="⛓ On-chain"
			value={prefs.fmt(oc)}
			note="spendable {prefs.fmt(balances.data?.spendableOnchainBalanceSats)} · reserve {prefs.fmt(
				balances.data?.totalAnchorChannelsReserveSats
			)}"
		>
			<div class="mt12">
				<div class="bar"><div class="fill ink" style:width="{pct(oc)}%"></div></div>
			</div>
		</StatCard>
		<StatCard
			label="◷ Claimable"
			value={prefs.fmt(claimable)}
			note="{sweeps.length} pending {sweeps.length === 1 ? 'sweep' : 'sweeps'} after channel close"
			noteGap={20}
		/>
		<StatCard
			label="Fees earned · {fees?.detailed === false ? 'all time' : '30d'}"
			value={prefs.fmt(fees?.feesSats)}
			note="{fees?.count ?? 0} forwards"
		>
			<Sparkline bars={fees?.buckets ?? [0, 0, 0, 0, 0]} />
		</StatCard>
	</div>

	<div class="grid">
		<Card title="Channels">
			{#snippet actions()}<a href="/channels" class="viewall">View all</a>{/snippet}
			{#each chList.slice(0, 4) as ch (ch.channelId)}
				<ChannelRow
					channel={ch}
					onclick={() => ((ui.selectedChannelId = ch.channelId), goto('/channels'))}
				/>
			{:else}
				<div class="empty">
					{channels.loading
						? 'Loading channels…'
						: (channels.error ?? 'No channels yet — open one to start routing.')}
				</div>
			{/each}
		</Card>
		<Card title="Live events">
			{#snippet titleExtra()}<Dot color="var(--live)" size={7} pulse />{/snippet}
			<div class="events">
				{#each events as ev (ev.id)}
					<div class="ev">
						<Dot color={ev.dot} top={4} />
						<div class="evb">
							<div class="evk">{ev.kind}</div>
							<div class="evd">{ev.detail} · {ev.time}</div>
						</div>
					</div>
				{:else}
					<div class="empty">
						{eventFeed.error ? `Event stream: ${eventFeed.error}` : 'Waiting for events…'}
					</div>
				{/each}
			</div>
		</Card>
	</div>
</div>

<style>
	.col {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.top {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
	}
	.caption {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.total {
		font-size: 44px;
		font-weight: 700;
		letter-spacing: -0.02em;
		margin-top: 4px;
	}
	.unit {
		font-size: 18px;
		font-weight: 500;
		color: var(--muted);
	}
	.actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 12px;
	}
	.mt12 {
		margin-top: 12px;
	}
	.bar {
		height: 6px;
		border-radius: 3px;
		background: var(--soft);
		position: relative;
		overflow: hidden;
	}
	.fill {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
	}
	.acc {
		background: var(--acc);
	}
	.ink {
		background: var(--ink);
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1.8fr) minmax(0, 1fr);
		gap: 12px;
		align-items: start;
	}
	@media (max-width: 760px) {
		.grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.viewall {
		font-size: 12.5px;
		cursor: pointer;
		text-decoration: underline;
		text-decoration-color: var(--border);
		color: var(--ink);
	}
	.events {
		max-height: 420px;
		overflow-y: auto;
	}
	.ev {
		display: flex;
		gap: 12px;
		padding: 11px 20px;
		border-bottom: 1px solid var(--soft);
		font-size: 12.5px;
		align-items: flex-start;
	}
	.evb {
		min-width: 0;
	}
	.evk {
		font-weight: 600;
		font-family: var(--font-mono);
		font-size: 12px;
	}
	.evd {
		color: var(--muted);
		font-size: 11.5px;
		margin-top: 1px;
	}
	.empty {
		padding: 16px 20px;
		font-size: 12.5px;
		color: var(--muted);
	}
</style>
