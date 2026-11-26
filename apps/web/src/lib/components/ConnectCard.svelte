<script lang="ts">
	import { Button, Field, Input } from '@ldk-server-manager/ui';
	import { connection, validateConnection } from '$lib/config/connection.svelte';
	import { macaroonFromText } from '$lib/config/macaroon-file';
	import { getClient } from '$lib/api/client.svelte';
	import { describeError } from '$lib/state/resource.svelte';

	let url = $state(connection.settings?.url ?? 'http://localhost:8080');
	let macaroon = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	async function onMacaroonFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			macaroon = macaroonFromText(await file.text());
			error = null;
		} catch (e) {
			macaroon = '';
			error = e instanceof Error ? e.message : 'Could not read macaroon file';
		}
	}

	async function connect() {
		const err = validateConnection({ url, macaroon });
		if (err) return (error = err);
		busy = true;
		error = null;
		try {
			connection.save({ url, macaroon });
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
			Enter the URL of your node's gRPC-Web bridge and choose the
			<code>admin.macaroon</code> file. The secret stays in this browser. It is not put in the address.
			Each request sends a copy bound to that call.
		</div>
		<div class="form">
			<Field label="Server URL"
				><Input bind:value={url} mono placeholder="https://node.example:8080" /></Field
			>
			<button type="button" class="file" onclick={() => fileInput?.click()}>
				Choose admin.macaroon
			</button>
			<input
				bind:this={fileInput}
				class="hidden"
				type="file"
				accept=".macaroon,.txt,text/plain"
				onchange={onMacaroonFile}
			/>
			<Field label="Macaroon"
				><Input bind:value={macaroon} mono type="password" placeholder="or paste the hex" /></Field
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
	.file {
		align-self: flex-start;
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-size: 12.5px;
		color: inherit;
		text-decoration: underline;
		cursor: pointer;
	}
	.hidden {
		display: none;
	}
</style>
