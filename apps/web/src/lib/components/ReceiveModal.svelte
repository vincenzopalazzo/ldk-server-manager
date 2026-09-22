<script lang="ts">
	import { Button, Input, Modal, PillTabs } from '@ldk-server-manager/ui';
	import { createBolt11Invoice, createBolt12Offer, newOnchainAddress } from '$lib/actions/node';
	import { ui } from '$lib/state/ui.svelte';
	import { showToast } from '$lib/state/toast.svelte';
	import { describeError } from '$lib/state/resource.svelte';
	import ReceiveResult from './ReceiveResult.svelte';

	type Tab = 'BOLT11' | 'BOLT12' | 'On-chain';
	const TABS: { key: Tab; label: string }[] = [
		{ key: 'BOLT11', label: 'BOLT11' },
		{ key: 'BOLT12', label: 'BOLT12' },
		{ key: 'On-chain', label: 'On-chain' }
	];

	let tab = $state<Tab>('BOLT11');
	let amount = $state('');
	let desc = $state('');
	let generated = $state<string | null>(null);
	let busy = $state(false);

	const needsAmount = $derived(tab !== 'On-chain');
	const btnLabel = $derived(
		tab === 'BOLT11' ? 'Generate invoice' : tab === 'BOLT12' ? 'Generate offer' : 'Generate address'
	);

	async function generate() {
		busy = true;
		try {
			if (tab === 'BOLT11') {
				generated = (
					await createBolt11Invoice({ amountSats: amount, description: desc, expirySecs: 3600 })
				).invoice;
			} else if (tab === 'BOLT12') {
				generated = (await createBolt12Offer(desc, amount)).offer;
			} else {
				generated = await newOnchainAddress();
			}
		} catch (e) {
			showToast(describeError(e));
		} finally {
			busy = false;
		}
	}
</script>

<Modal title="Receive" onclose={() => ui.close()}>
	<div class="gap14">
		<PillTabs items={TABS} active={tab} onselect={(t) => ((tab = t), (generated = null))} />
	</div>
	{#if needsAmount}
		<div class="row gap12">
			<Input bind:value={amount} mono placeholder="amount in sats (empty = any)" />
			<Input bind:value={desc} placeholder="description" />
		</div>
	{/if}
	<div class="gap12">
		<Button block onclick={generate} disabled={busy}>{busy ? 'Generating…' : btnLabel}</Button>
	</div>
	{#if generated}
		<ReceiveResult value={generated} />
	{/if}
</Modal>

<style>
	.gap14 {
		margin-top: 14px;
	}
	.gap12 {
		margin-top: 12px;
	}
	.row {
		display: flex;
		gap: 8px;
	}
</style>
