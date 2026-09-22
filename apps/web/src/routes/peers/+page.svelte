<script lang="ts">
	import { Button, Card, Dot, Ellipsis, Input, ListRow } from '@ldk-server-manager/ui';
	import { peers } from '$lib/state/node.svelte';
	import { aliases } from '$lib/state/aliases.svelte';
	import { showToast } from '$lib/state/toast.svelte';
	import { describeError } from '$lib/state/resource.svelte';
	import { connectPeer, disconnectPeer, parsePeerUri } from '$lib/actions/node';

	let input = $state('');
	let busy = $state(false);
	const list = $derived(peers.data ?? []);

	async function connect() {
		if (!input.includes('@')) return showToast('Format: node_id@host:port');
		busy = true;
		try {
			const { nodePubkey, address } = parsePeerUri(input);
			await connectPeer(nodePubkey, address, true);
			input = '';
			showToast('Peer connected');
		} catch (e) {
			showToast(describeError(e));
		} finally {
			busy = false;
		}
	}

	async function disconnect(nodeId: string) {
		try {
			await disconnectPeer(nodeId);
			showToast('Peer disconnected');
		} catch (e) {
			showToast(describeError(e));
		}
	}
</script>

<div class="col">
	<Card padding="16px 20px">
		<div class="connect">
			<Input
				bind:value={input}
				mono
				placeholder="node_id@host:port"
				onkeydown={(e) => e.key === 'Enter' && connect()}
			/>
			<Button size="lg" onclick={connect} disabled={busy}>Connect peer</Button>
		</div>
	</Card>
	<Card title="Peers · {list.length}">
		{#each list as p (p.nodeId)}
			<ListRow columns="10px minmax(0,1fr) minmax(0,1.6fr) auto auto">
				<Dot color={p.isConnected ? 'var(--live)' : 'var(--border)'} />
				<Ellipsis strong>{aliases.get(p.nodeId)}</Ellipsis>
				<Ellipsis mono muted size={11}>{p.nodeId}</Ellipsis>
				<span class="persist">{p.isPersisted ? 'persisted' : 'transient'}</span>
				<Button variant="outline" size="sm" class="red" onclick={() => disconnect(p.nodeId)}
					>Disconnect</Button
				>
			</ListRow>
		{:else}
			<div class="empty">
				{peers.loading ? 'Loading peers…' : (peers.error ?? 'No peers connected.')}
			</div>
		{/each}
	</Card>
</div>

<style>
	.col {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.connect {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
	.connect :global(.input) {
		flex: 1;
		min-width: 240px;
		width: auto;
	}
	.persist {
		font-size: 11px;
		color: var(--muted);
	}
	:global(.btn.red) {
		color: var(--red);
	}
	.empty {
		padding: 16px 20px;
		font-size: 12.5px;
		color: var(--muted);
	}
</style>
