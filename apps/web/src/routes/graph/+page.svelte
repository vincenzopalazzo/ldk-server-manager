<script lang="ts">
	import { Button, Caption, Card, Input, KV, StatCard } from '@ldk-server-manager/ui';
	import { requireClient } from '$lib/api/client.svelte';
	import { graphChannelCount, graphNodeCount } from '$lib/state/graph.svelte';
	import { nodeInfo } from '$lib/state/node.svelte';
	import { prefs } from '$lib/state/prefs.svelte';
	import { describeError } from '$lib/state/resource.svelte';
	import { relativeTime, truncateId } from '$lib/utils/format';
	import { isScid, parseScid } from '$lib/utils/scid';

	interface Result {
		type: string;
		title: string;
		sub: string;
		facts: { k: string; v: string }[];
	}

	let query = $state('');
	let result = $state<Result | null>(null);
	let busy = $state(false);

	$effect(() => {
		if (graphNodeCount.isEmpty && !graphNodeCount.loading) void graphNodeCount.refresh();
		if (graphChannelCount.isEmpty && !graphChannelCount.loading) void graphChannelCount.refresh();
	});

	const counter = (r: { data?: number; loading: boolean; error: string | null }) =>
		r.data !== undefined ? r.data.toLocaleString('en-US') : r.error ? '—' : '…';

	async function search() {
		const q = query.trim();
		if (!q || busy) return;
		busy = true;
		const api = requireClient().api;
		try {
			if (isScid(q)) {
				const res = await api.graphGetChannel({ shortChannelId: parseScid(q)! });
				const c = res.channel;
				if (!c) return (result = notFound());
				const a = c.oneToTwo;
				const b = c.twoToOne;
				const dir =
					a?.enabled && b?.enabled
						? 'both enabled'
						: a?.enabled
							? 'one → two only'
							: b?.enabled
								? 'two → one only'
								: 'disabled';
				result = {
					type: 'channel',
					title: `Channel ${q}`,
					sub: `${truncateId(c.nodeOne, 10, 3)} ⟷ ${truncateId(c.nodeTwo, 10, 3)}`,
					facts: [
						{
							k: 'Capacity',
							v: c.capacitySats !== undefined ? prefs.withUnit(c.capacitySats) : 'unknown'
						},
						{ k: 'Base fee', v: `${(a?.fees?.baseMsat ?? 0).toLocaleString('en-US')} msat` },
						{
							k: 'Fee rate',
							v: `${(a?.fees?.proportionalMillionths ?? 0).toLocaleString('en-US')} ppm`
						},
						{ k: 'CLTV delta', v: String(a?.cltvExpiryDelta ?? '—') },
						{ k: 'Last update', v: relativeTime(Math.max(a?.lastUpdate ?? 0, b?.lastUpdate ?? 0)) },
						{ k: 'Direction', v: dir }
					]
				};
			} else if (/^0[23][0-9a-f]{64}$/i.test(q)) {
				const res = await api.graphGetNode({ nodeId: q.toLowerCase() });
				const n = res.node;
				if (!n) return (result = notFound());
				const ann = n.announcementInfo;
				const features = Object.values(ann?.features ?? {});
				result = {
					type: 'node',
					title: ann?.alias?.trim() || 'Unannounced node',
					sub: q.toLowerCase(),
					facts: [
						{ k: 'Channels', v: n.channels.length.toLocaleString('en-US') },
						{
							k: 'Addresses',
							v: ann
								? `${ann.addresses.length}${ann.addresses.length ? ` (${ann.addresses.slice(0, 2).join(', ')})` : ''}`
								: '—'
						},
						{
							k: 'Features',
							v: features.length
								? `${features.length}: ${features
										.map((f) => f.name)
										.slice(0, 6)
										.join(', ')}`
								: '—'
						},
						{ k: 'Last announce', v: ann ? relativeTime(ann.lastUpdate) : '—' },
						{ k: 'Color', v: ann?.rgb ? `#${ann.rgb}` : '—' }
					]
				};
			} else {
				result = notFound();
			}
		} catch (e) {
			result = { type: 'error', title: 'Lookup failed', sub: describeError(e), facts: [] };
		} finally {
			busy = false;
		}
	}

	const notFound = (): Result => ({
		type: 'not found',
		title: 'No match in graph',
		sub: 'Enter a 66-char node id or scid like 861023x1204x0',
		facts: []
	});
</script>

<div class="col">
	<div class="stats">
		<StatCard big label="Known nodes" value={counter(graphNodeCount)} />
		<StatCard big label="Known channels" value={counter(graphChannelCount)} />
		<StatCard
			big
			label="Last RGS sync"
			value={relativeTime(nodeInfo.data?.latestRgsSnapshotTimestamp)}
		/>
	</div>
	<Card padding="16px 20px">
		<div class="search">
			<Input
				bind:value={query}
				mono
				placeholder="node id (02…/03…) or short channel id (861023x1204x0)"
				onkeydown={(e) => e.key === 'Enter' && search()}
			/>
			<Button variant="dark" size="lg" onclick={search} disabled={busy}>Look up</Button>
		</div>
	</Card>
	{#if result}
		<Card padding="20px">
			<Caption size={10.5}>{result.type}</Caption>
			<div class="title">{result.title}</div>
			<div class="sub">{result.sub}</div>
			{#if result.facts.length}
				<div class="facts">
					{#each result.facts as f (f.k)}<KV k={f.k} v={f.v} fact />{/each}
				</div>
			{/if}
		</Card>
	{/if}
</div>

<style>
	.col {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 12px;
	}
	.search {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.search :global(.input) {
		flex: 1;
		min-width: 260px;
		width: auto;
	}
	.title {
		font-weight: 700;
		font-size: 17px;
		margin-top: 4px;
	}
	.sub {
		font-family: var(--font-mono);
		font-size: 11.5px;
		color: var(--muted);
		margin-top: 4px;
		word-break: break-all;
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 8px;
		margin-top: 14px;
	}
</style>
