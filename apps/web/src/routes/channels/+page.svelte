<script lang="ts">
	import { Button, Card, Divider, Input, KV } from '@ldk-server-manager/ui';
	import ChannelRow from '$lib/components/ChannelRow.svelte';
	import { channels } from '$lib/state/node.svelte';
	import { aliases } from '$lib/state/aliases.svelte';
	import { prefs } from '$lib/state/prefs.svelte';
	import { ui } from '$lib/state/ui.svelte';
	import { showToast } from '$lib/state/toast.svelte';
	import { describeError } from '$lib/state/resource.svelte';
	import { closeChannel, spliceIn, spliceOut, updateChannelConfig } from '$lib/actions/node';
	import { channelStatus, localSats, remoteSats } from '$lib/domain/channels';
	import { formatScid } from '$lib/utils/scid';

	const list = $derived(channels.data ?? []);
	const sel = $derived(list.find((c) => c.channelId === ui.selectedChannelId) ?? null);
	const selStatus = $derived(sel ? channelStatus(sel) : null);
	const statusColor = $derived(
		selStatus === 'Ready' ? 'var(--green)' : selStatus === 'Pending' ? 'var(--amber)' : 'var(--red)'
	);

	let cfgBase = $state('');
	let cfgPpm = $state('');
	let spliceAmt = $state('');
	let busy = $state(false);

	$effect(() => {
		cfgBase = String(sel?.channelConfig?.forwardingFeeBaseMsat ?? '');
		cfgPpm = String(sel?.channelConfig?.forwardingFeeProportionalMillionths ?? '');
		spliceAmt = '';
	});

	async function run(label: string, fn: () => Promise<unknown>) {
		if (!sel || busy) return;
		busy = true;
		try {
			await fn();
			showToast(label);
		} catch (e) {
			showToast(describeError(e));
		} finally {
			busy = false;
		}
	}

	const updateConfig = () =>
		run('Channel config updated', () =>
			updateChannelConfig(sel!.userChannelId, sel!.counterpartyNodeId, {
				forwardingFeeBaseMsat: Number(cfgBase) || 0,
				forwardingFeeProportionalMillionths: Number(cfgPpm) || 0,
				cltvExpiryDelta: sel!.channelConfig?.cltvExpiryDelta,
				forceCloseAvoidanceMaxFeeSatoshis: sel!.channelConfig?.forceCloseAvoidanceMaxFeeSatoshis,
				acceptUnderpayingHtlcs: sel!.channelConfig?.acceptUnderpayingHtlcs,
				maxDustHtlcExposure: sel!.channelConfig?.maxDustHtlcExposure
			})
		);
	const doSpliceIn = () =>
		run('Splice-in negotiated', () =>
			spliceIn(sel!.userChannelId, sel!.counterpartyNodeId, spliceAmt)
		);
	const doSpliceOut = () =>
		run('Splice-out negotiated', () =>
			spliceOut(sel!.userChannelId, sel!.counterpartyNodeId, spliceAmt)
		);
	const doClose = () =>
		run('Cooperative close initiated', () =>
			closeChannel(sel!.userChannelId, sel!.counterpartyNodeId)
		);
	const doForce = () => {
		if (!confirm('Force-close this channel? Funds will be locked until the timelock expires.'))
			return;
		void run('Force close broadcast', () =>
			closeChannel(sel!.userChannelId, sel!.counterpartyNodeId, true)
		);
	};
</script>

<div class="grid">
	<Card title="Channels · {list.length}">
		{#snippet actions()}<Button size="md" onclick={() => ui.open('channel')}>+ Open channel</Button
			>{/snippet}
		{#each list as ch (ch.channelId)}
			<ChannelRow
				channel={ch}
				full
				selected={ch.channelId === ui.selectedChannelId}
				onclick={() => (ui.selectedChannelId = ch.channelId)}
			/>
		{:else}
			<div class="empty">
				{channels.loading ? 'Loading channels…' : (channels.error ?? 'No channels yet.')}
			</div>
		{/each}
	</Card>

	{#if sel}
		<aside>
			<div>
				<div class="peer">{aliases.get(sel.counterpartyNodeId)}</div>
				<div class="nodeid">{sel.counterpartyNodeId}</div>
			</div>
			<div class="kvgrid">
				<KV k="Local" v={prefs.fmt(localSats(sel))} />
				<KV k="Remote" v={prefs.fmt(remoteSats(sel))} />
				<KV k="SCID" v={formatScid(sel.shortChannelId)} small />
				<KV k="Status" v={selStatus ?? ''} mono={false} color={statusColor} />
			</div>
			<Divider heading="Forwarding config">
				<div class="cfg">
					<label class="lbl"
						>Base fee (msat)
						<div class="mt4"><Input bind:value={cfgBase} mono size="sm" /></div></label
					>
					<label class="lbl"
						>Fee rate (ppm)
						<div class="mt4"><Input bind:value={cfgPpm} mono size="sm" /></div></label
					>
				</div>
				<div class="mt10">
					<Button variant="dark" onclick={updateConfig} disabled={busy}>Update config</Button>
				</div>
			</Divider>
			<Divider heading="Splice">
				<div class="splice">
					<Input bind:value={spliceAmt} mono size="sm" placeholder="amount sats" />
					<Button variant="outline" size="sm" onclick={doSpliceIn} disabled={busy}>In ↧</Button>
					<Button variant="outline" size="sm" onclick={doSpliceOut} disabled={busy}>Out ↥</Button>
				</div>
			</Divider>
			<Divider>
				<div class="closes">
					<Button variant="danger" onclick={doClose} disabled={busy}>Close</Button>
					<Button variant="danger-soft" onclick={doForce} disabled={busy}>Force close</Button>
				</div>
			</Divider>
		</aside>
	{/if}
</div>

<style>
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
		gap: 12px;
		align-items: start;
	}
	@media (max-width: 760px) {
		.grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	aside {
		background: var(--card);
		border-radius: 12px;
		box-shadow: var(--shadow);
		padding: 20px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.peer {
		font-weight: 700;
		font-size: 17px;
	}
	.nodeid {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--muted);
		margin-top: 3px;
		word-break: break-all;
	}
	.kvgrid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		font-size: 12.5px;
	}
	.cfg {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.lbl {
		font-size: 11px;
		color: var(--muted);
		display: block;
	}
	.mt4 {
		margin-top: 4px;
	}
	.mt10 {
		margin-top: 10px;
	}
	.splice {
		display: flex;
		gap: 8px;
	}
	.splice :global(.input) {
		flex: 1;
	}
	.splice :global(.btn) {
		padding: 8px 12px;
		font-size: 12px;
	}
	.closes {
		display: flex;
		gap: 8px;
	}
	.closes :global(.btn) {
		padding: 8px 14px;
	}
	.empty {
		padding: 16px 20px;
		font-size: 12.5px;
		color: var(--muted);
	}
</style>
