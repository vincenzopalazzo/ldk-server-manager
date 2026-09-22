<script lang="ts">
	import { Button, Field, Input } from '@ldk-server-manager/ui';
	import { connection, validateConnection } from '$lib/config/connection.svelte';
	import { getClient } from '$lib/api/client.svelte';
	import { describeError } from '$lib/state/resource.svelte';

	let url = $state(connection.settings?.url ?? 'http://localhost:8080');
	let apiKey = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);

	async function connect() {
		const err = validateConnection({ url, apiKey });
		if (err) return (error = err);
		busy = true;
		error = null;
		try {
			connection.save({ url, apiKey });
			await getClient()!.api.getNodeInfo();
		} catch (e) {
			error = describeError(e);
			connection.clear();
		} finally {
			busy = false;
		}
	}
</script>

<div class="wrap">
	<section class="card">
		<div class="title">Connect to LDK Server</div>
		<div class="hint">
			Enter the URL of your node's gRPC-Web bridge and the API key from its config. Everything runs
			in this browser; the key never leaves it.
		</div>
		<div class="form">
			<Field label="Server URL"
				><Input bind:value={url} mono placeholder="https://node.example:8080" /></Field
			>
			<Field label="API key"
				><Input bind:value={apiKey} mono type="password" placeholder="api key" /></Field
			>
			{#if error}<div class="err">{error}</div>{/if}
			<Button block onclick={connect} disabled={busy}>{busy ? 'Connecting…' : 'Connect'}</Button>
		</div>
	</section>
</div>

<style>
	.wrap {
		display: flex;
		justify-content: center;
		padding: 40px 0;
	}
	.card {
		background: var(--card);
		border-radius: 14px;
		width: 460px;
		max-width: 100%;
		padding: 24px;
		box-sizing: border-box;
		box-shadow: var(--shadow);
	}
	.title {
		font-weight: 700;
		font-size: 17px;
	}
	.hint {
		font-size: 12.5px;
		color: var(--muted);
		margin-top: 6px;
		line-height: 1.5;
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 14px;
	}
	.err {
		font-size: 12.5px;
		color: var(--red);
	}
</style>
