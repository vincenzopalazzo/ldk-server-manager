<script lang="ts">
	import {
		Button,
		Checkbox,
		Field,
		Input,
		Modal,
		Notice,
		Pill,
		PillTabs
	} from '@ldk-server-manager/ui';
	import { requireClient } from '$lib/api/client.svelte';
	import { createBolt11Invoice, openChannel } from '$lib/actions/node';
	import { ui } from '$lib/state/ui.svelte';
	import { peers } from '$lib/state/node.svelte';
	import { showToast } from '$lib/state/toast.svelte';
	import { describeError } from '$lib/state/resource.svelte';
	import { truncateId } from '$lib/utils/format';
	import ReceiveResult from './ReceiveResult.svelte';

	type Tab = 'peer' | 'lsp';
	const TABS: { key: Tab; label: string }[] = [
		{ key: 'peer', label: 'Open to a peer' },
		{ key: 'lsp', label: 'Buy from an LSP' }
	];

	interface Found {
		pubkey: string;
		alias: string;
		color: string;
		channels: number;
		address: string | null;
		addressCount: number;
		connected: boolean;
	}

	let tab = $state<Tab>('peer');
	let search = $state('');
	let results = $state<Found[] | null>(null);
	let picked = $state<string | null>(null);
	let node = $state('');
	let amount = $state('');
	let push = $state('');
	let announce = $state(true);
	let busy = $state(false);

	let lspAmount = $state('');
	let lspInvoice = $state<string | null>(null);

	const PRESETS = [250000, 500000, 1000000, 2000000, 5000000];
	const presetLabel = (v: number) => (v >= 1000000 ? `${v / 1000000}M` : `${v / 1000}k`);

	async function runSearch() {
		const q = search.trim();
		if (!q) return (results = null);
		if (q.includes('@')) {
			node = q;
			results = null;
			return showToast('Peer address filled in');
		}
		if (!/^0[23][0-9a-f]{64}$/i.test(q)) {
			results = [];
			return;
		}
		try {
			const res = await requireClient().api.graphGetNode({ nodeId: q.toLowerCase() });
			const ann = res.node?.announcementInfo;
			if (!res.node || !ann) return (results = []);
			const addrs = ann.addresses ?? [];
			results = [
				{
					pubkey: q.toLowerCase(),
					alias: ann.alias?.trim() || truncateId(q, 12, 6),
					color: ann.rgb ? `#${ann.rgb}` : 'var(--border)',
					channels: res.node.channels.length,
					address: addrs[0] ?? null,
					addressCount: addrs.length,
					connected: (peers.data ?? []).some((p) => p.nodeId === q.toLowerCase())
				}
			];
		} catch {
			results = [];
		}
	}

	function pick(r: Found) {
		picked = r.pubkey;
		node = r.address ? `${r.pubkey}@${r.address}` : r.pubkey;
	}

	async function confirm() {
		const [pubkey, address] = node.trim().split('@');
		if (!pubkey || !address) return showToast('Peer address must be node_id@host:port');
		busy = true;
		try {
			await openChannel({
				nodePubkey: pubkey,
				address,
				amountSats: amount,
				pushMsat: push,
				announce
			});
			showToast('Channel opening — awaiting confirmation');
			ui.close();
		} catch (e) {
			showToast(describeError(e));
		} finally {
			busy = false;
		}
	}

	async function createJit() {
		busy = true;
		try {
			const r = await createBolt11Invoice({
				amountSats: lspAmount,
				description: 'Inbound liquidity via LSP',
				expirySecs: 3600,
				viaJitChannel: true
			});
			lspInvoice = r.invoice;
			showToast('JIT invoice created — pay it to open the channel');
		} catch (e) {
			showToast(describeError(e));
		} finally {
			busy = false;
		}
	}
</script>

<Modal title="Add liquidity" width={520} scroll onclose={() => ui.close()}>
	<div class="gap14"><PillTabs items={TABS} active={tab} onselect={(t) => (tab = t)} /></div>

	{#if tab === 'peer'}
		<div class="col gap14">
			<div>
				<div class="label">Find a peer in the network graph</div>
				<div class="row">
					<Input
						bind:value={search}
						placeholder="node id, or paste node_id@host:port"
						onkeydown={(e) => e.key === 'Enter' && runSearch()}
					/>
					<Button variant="dark" size="lg" onclick={runSearch}>Search</Button>
				</div>
				<div class="label mt6">Looks up the node's gossip graph by node id</div>
			</div>
			{#if results && results.length > 0}
				<div class="results">
					{#each results as r (r.pubkey)}
						<button class="res" class:on={picked === r.pubkey} onclick={() => pick(r)}>
							<div class="resl">
								<div class="resh">
									<span class="sq" style:background={r.color}></span>
									<span class="alias">{r.alias}</span>
									{#if r.connected}<Pill tone="green" tiny>connected</Pill>{/if}
								</div>
								<div class="pub">
									{truncateId(r.pubkey, 16, 6)}{#if r.address}
										· {r.address}{/if}
								</div>
							</div>
							<div class="resr">
								<div>{r.channels.toLocaleString('en-US')} ch</div>
								<div>{r.addressCount} addr</div>
							</div>
						</button>
					{/each}
				</div>
			{:else if results && results.length === 0}
				<Notice
					>No node in the gossip graph matches that. You can still paste a full <span class="mono"
						>node_id@host:port</span
					> below.</Notice
				>
			{/if}
			<Field label="Peer address"
				><Input bind:value={node} mono placeholder="03abc…@host:9735" /></Field
			>
			<div class="row">
				<Field label="Capacity (sats)" grow
					><Input bind:value={amount} mono placeholder="1000000" /></Field
				>
				<Field label="Push (sats)" grow><Input bind:value={push} mono placeholder="0" /></Field>
			</div>
			<Checkbox
				checked={announce}
				label="Announce channel (public)"
				onchange={(v) => (announce = v)}
			/>
			<div class="mt4"><Button block onclick={confirm} disabled={busy}>Open channel</Button></div>
		</div>
	{:else}
		<div class="col gap12">
			<div class="desc">
				Buy inbound liquidity from the LSPS2 provider configured on this node. The LSP opens a
				just-in-time channel when this invoice is paid — you pay the LSP fee out of the payment, not
				the channel capacity.
			</div>
			<Field label="Inbound capacity wanted (sats)"
				><Input bind:value={lspAmount} mono placeholder="2000000" /></Field
			>
			<div class="presets">
				{#each PRESETS as v (v)}
					<button class="preset" onclick={() => (lspAmount = String(v))}>{presetLabel(v)}</button>
				{/each}
			</div>
			<Button variant="dark" block onclick={createJit} disabled={busy}
				>{busy ? 'Requesting…' : 'Create JIT invoice'}</Button
			>
			{#if lspInvoice}<ReceiveResult value={lspInvoice} />{/if}
		</div>
	{/if}
</Modal>

<style>
	.gap14 {
		margin-top: 14px;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.gap12 {
		margin-top: 14px;
		gap: 12px;
	}
	.label {
		font-size: 11px;
		color: var(--muted);
		margin-bottom: 4px;
	}
	.mt6 {
		margin-top: 6px;
		margin-bottom: 0;
	}
	.mt4 {
		margin-top: 4px;
	}
	.row {
		display: flex;
		gap: 8px;
	}
	.results {
		border: 1px solid var(--line);
		border-radius: 10px;
		overflow-y: auto;
		max-height: 230px;
	}
	.res {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 10px;
		align-items: center;
		padding: 11px 14px;
		border: none;
		border-bottom: 1px solid var(--soft);
		cursor: pointer;
		background: transparent;
		width: 100%;
		text-align: left;
		font-family: inherit;
		color: var(--ink);
	}
	.res.on {
		background: var(--soft);
	}
	.resl {
		min-width: 0;
	}
	.resh {
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.sq {
		width: 8px;
		height: 8px;
		border-radius: 2px;
		flex-shrink: 0;
	}
	.alias {
		font-weight: 600;
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pub {
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--muted);
		margin-top: 3px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.resr {
		text-align: right;
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--muted);
		white-space: nowrap;
	}
	.mono {
		font-family: var(--font-mono);
	}
	.desc {
		font-size: 12.5px;
		color: var(--muted);
		line-height: 1.5;
	}
	.presets {
		display: flex;
		gap: 6px;
	}
	.preset {
		font-family: inherit;
		flex: 1;
		font-size: 11.5px;
		font-weight: 600;
		background: var(--soft);
		color: var(--ink);
		border: 1px solid var(--border);
		border-radius: 99px;
		padding: 6px 0;
		cursor: pointer;
	}
</style>
