<script lang="ts">
	import { Network } from '@ldk-server-manager/client';
	import { Button, Card, Field, Input } from '@ldk-server-manager/ui';
	import { nodeInfo } from '$lib/state/node.svelte';
	import { connection, validateConnection } from '$lib/config/connection.svelte';
	import { showToast } from '$lib/state/toast.svelte';
	import { relativeTime, truncateId } from '$lib/utils/format';
	import AssistantStatusCard from '$lib/components/AssistantStatusCard.svelte';

	const info = $derived(nodeInfo.data);
	const networkName = (n?: Network) =>
		n === Network.BITCOIN
			? 'bitcoin'
			: n === Network.TESTNET
				? 'testnet'
				: n === Network.TESTNET4
					? 'testnet4'
					: n === Network.SIGNET
						? 'signet'
						: n === Network.REGTEST
							? 'regtest'
							: '—';

	const configRows = $derived([
		{ k: 'network', v: networkName(info?.network) },
		{ k: 'listening_addresses', v: info?.listeningAddresses.join(', ') || '—' },
		{ k: 'announcement_addresses', v: info?.announcementAddresses.join(', ') || '—' },
		{ k: 'node_uris', v: info?.nodeUris.length ? `${info.nodeUris.length} configured` : '—' },
		{ k: 'lightning_wallet_sync', v: relativeTime(info?.latestLightningWalletSyncTimestamp) },
		{ k: 'onchain_wallet_sync', v: relativeTime(info?.latestOnchainWalletSyncTimestamp) },
		{ k: 'fee_rate_cache', v: relativeTime(info?.latestFeeRateCacheUpdateTimestamp) },
		{ k: 'rgs_snapshot', v: relativeTime(info?.latestRgsSnapshotTimestamp) },
		{ k: 'node_announcement', v: relativeTime(info?.latestNodeAnnouncementBroadcastTimestamp) },
		{ k: 'pathfinding_scores', v: relativeTime(info?.latestPathfindingScoresSyncTimestamp) },
		{ k: 'features', v: `${Object.keys(info?.features ?? {}).length} advertised` }
	]);

	let url = $state(connection.settings?.url ?? '');
	let apiKey = $state('');

	async function copyNodeId() {
		if (!info?.nodeId) return;
		try {
			await navigator.clipboard.writeText(info.nodeId);
			showToast('Node ID copied');
		} catch {
			showToast('Clipboard unavailable');
		}
	}

	function save() {
		const key = apiKey.trim() || connection.settings?.apiKey || '';
		const err = validateConnection({ url, apiKey: key });
		if (err) return showToast(err);
		connection.save({ url, apiKey: key });
		apiKey = '';
		showToast('Connection updated');
		void nodeInfo.refresh();
	}

	function disconnect() {
		connection.clear();
		showToast('Disconnected');
	}
</script>

<div class="grid">
	<Card padding="20px">
		<div class="h">Node</div>
		<div class="node">
			<div>
				<div class="k">Alias</div>
				<div class="v strong">{info?.nodeAlias || '—'}</div>
			</div>
			<div>
				<div class="k">Node ID <button class="copy" onclick={copyNodeId}>copy</button></div>
				<div class="v mono small">{info?.nodeId ?? '—'}</div>
			</div>
			<div>
				<div class="k">Listening address</div>
				<div class="v mono">{info?.listeningAddresses.join(' · ') || '—'}</div>
			</div>
			<div>
				<div class="k">Best block</div>
				<div class="v mono">
					{info?.currentBestBlock
						? `${info.currentBestBlock.height.toLocaleString('en-US')} · ${truncateId(info.currentBestBlock.blockHash, 10, 6)}`
						: '—'}
				</div>
			</div>
		</div>
	</Card>
	<Card padding="20px">
		<div class="h">Configuration</div>
		<div class="cfg">
			{#each configRows as c (c.k)}
				<div class="row"><span class="ck">{c.k}</span><span class="cv">{c.v}</span></div>
			{/each}
		</div>
	</Card>
	<Card padding="20px">
		<div class="h tight">API access</div>
		<div class="api">
			Connected to ldk-server through a gRPC-Web bridge at <span class="mono ink"
				>{connection.settings?.url}</span
			>. Requests are signed with HMAC-SHA256 <span class="mono ink">x-auth</span> headers. The API key
			is stored only in this browser.
		</div>
		<div class="form">
			<Field label="Bridge URL"><Input bind:value={url} mono /></Field>
			<Field label="API key"
				><Input bind:value={apiKey} mono type="password" placeholder="unchanged" /></Field
			>
		</div>
		<div class="btns">
			<Button variant="dark" onclick={save}>Save connection</Button>
			<Button variant="danger" onclick={disconnect}>Disconnect</Button>
		</div>
	</Card>
	<AssistantStatusCard />
</div>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: 12px;
		align-items: start;
	}
	.h {
		font-weight: 600;
		font-size: 14.5px;
		margin-bottom: 12px;
	}
	.tight {
		margin-bottom: 6px;
	}
	.node {
		display: flex;
		flex-direction: column;
		gap: 10px;
		font-size: 13px;
	}
	.k {
		font-size: 11px;
		color: var(--muted);
	}
	.v {
		margin-top: 2px;
	}
	.strong {
		font-weight: 600;
	}
	.mono {
		font-family: var(--font-mono);
		font-size: 12px;
	}
	.small {
		font-size: 11.5px;
		word-break: break-all;
	}
	.copy {
		cursor: pointer;
		text-decoration: underline;
		background: none;
		border: none;
		padding: 0;
		color: inherit;
		font: inherit;
	}
	.cfg {
		display: flex;
		flex-direction: column;
		font-family: var(--font-mono);
		font-size: 12px;
	}
	.row {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 0;
		border-bottom: 1px solid var(--soft);
	}
	.ck {
		color: var(--muted);
	}
	.cv {
		text-align: right;
		word-break: break-all;
	}
	.api {
		font-size: 12.5px;
		color: var(--muted);
		line-height: 1.6;
	}
	.ink {
		color: var(--ink);
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 12px;
	}
	.btns {
		display: flex;
		gap: 8px;
		margin-top: 14px;
	}
</style>
