<script lang="ts">
	import { Button, Drawer, Input, PillTabs } from '@ldk-server-manager/ui';
	import { ui } from '$lib/state/ui.svelte';
	import { chat } from '$lib/assistant/chat.svelte';
	import { assistantConfig, PROVIDERS } from '$lib/assistant/config.svelte';
	import type { ProviderId } from '$lib/assistant/providers/types';
	import { showToast } from '$lib/state/toast.svelte';

	const SUGGESTIONS = [
		'How is my node doing?',
		'Where is my liquidity tight?',
		'Create a 50k sat invoice'
	];

	let input = $state('');
	let tokenInput = $state('');
	let settingsOpen = $state(false);
	let body: HTMLDivElement | undefined = $state();

	const provider = $derived(assistantConfig.provider);
	const tabs = $derived(PROVIDERS.map((p) => ({ key: p.id, label: p.label })));
	const subtitle = $derived(
		assistantConfig.isReady
			? `${provider.label} · ${assistantConfig.model}`
			: `${provider.label} · no token`
	);

	function send(text = input) {
		if (!text.trim() || chat.busy || chat.pending) return;
		input = '';
		void chat.send(text);
	}

	function saveToken() {
		assistantConfig.setToken(tokenInput);
		tokenInput = '';
		showToast(assistantConfig.isReady ? 'Assistant token saved' : 'Assistant token removed');
	}

	function pickProvider(id: ProviderId) {
		assistantConfig.setProvider(id);
		tokenInput = '';
	}

	// Keep the transcript pinned to the newest message.
	$effect(() => {
		void chat.messages.length;
		void chat.busy;
		void chat.pending;
		setTimeout(() => {
			if (body) body.scrollTop = body.scrollHeight;
		}, 60);
	});
</script>

<Drawer title="Node Assistant" {subtitle} onclose={() => ui.toggleAssistant()}>
	<div class="body" bind:this={body}>
		{#each chat.messages as m, i (i)}
			<div class="msg" class:user={m.role === 'user'}>{m.text}</div>
		{/each}

		{#if chat.pending}
			<div class="approve">
				<div class="atitle">Approve before it runs</div>
				<ul>
					{#each chat.pending.lines as line, i (i)}
						<li>{line}</li>
					{/each}
				</ul>
				<div class="abtns">
					<Button size="md" onclick={() => chat.approve()}>Approve</Button>
					<Button variant="outline" size="md" onclick={() => chat.reject()}>Decline</Button>
				</div>
			</div>
		{/if}

		{#if chat.busy}
			<div class="msg thinking"><span class="pulse">thinking…</span></div>
		{/if}
	</div>

	{#if settingsOpen || !assistantConfig.isReady}
		<div class="config">
			<PillTabs items={tabs} active={assistantConfig.providerId} onselect={pickProvider} />
			<div class="row">
				<select
					class="model"
					value={assistantConfig.model}
					onchange={(e) => assistantConfig.setModel(e.currentTarget.value)}
				>
					{#each provider.models as m (m)}
						<option value={m}>{m}</option>
					{/each}
				</select>
			</div>
			<div class="row">
				<Input
					bind:value={tokenInput}
					mono
					type="password"
					placeholder={assistantConfig.isReady ? 'replace token' : 'token'}
				/>
				<Button variant="dark" size="lg" onclick={saveToken}>Save</Button>
			</div>
			<div class="hint">{provider.credentialHint}</div>
		</div>
	{/if}

	<div class="chips">
		{#each SUGGESTIONS as s (s)}
			<button class="chip" onclick={() => send(s)}>{s}</button>
		{/each}
		<button class="chip" onclick={() => (settingsOpen = !settingsOpen)}>
			{settingsOpen ? 'Hide setup' : 'Setup'}
		</button>
		<button class="chip" onclick={() => chat.clear()}>Clear</button>
	</div>

	<div class="inrow">
		<Input
			bind:value={input}
			placeholder="Ask or command the node…"
			onkeydown={(e) => e.key === 'Enter' && send()}
		/>
		<Button size="lg" onclick={() => send()} disabled={chat.busy || chat.pending !== null}
			>Send</Button
		>
	</div>
</Drawer>

<style>
	.body {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.msg {
		align-self: flex-start;
		max-width: 85%;
		background: var(--soft);
		color: var(--ink);
		border-radius: 12px 12px 12px 4px;
		padding: 10px 14px;
		font-size: 13px;
		line-height: 1.55;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.msg.user {
		align-self: flex-end;
		background: var(--head);
		color: var(--headink);
		border-radius: 12px 12px 4px 12px;
	}
	.thinking {
		padding: 10px 16px;
		color: var(--muted);
	}
	.pulse {
		animation: pulse 1s infinite;
	}
	.approve {
		align-self: stretch;
		background: var(--amberbg);
		color: var(--amber);
		border-radius: 12px;
		padding: 12px 14px;
	}
	.atitle {
		font-weight: 600;
		font-size: 13px;
	}
	.approve ul {
		margin: 6px 0 10px;
		padding-left: 18px;
		font-size: 12.5px;
		line-height: 1.5;
	}
	.abtns {
		display: flex;
		gap: 8px;
	}
	.config {
		padding: 12px 14px;
		border-top: 1px solid var(--line);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.row {
		display: flex;
		gap: 8px;
	}
	.model {
		flex: 1;
		padding: 8px 10px;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg);
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 12px;
	}
	.hint {
		font-size: 11px;
		color: var(--muted);
		line-height: 1.5;
	}
	.chips {
		padding: 10px 14px;
		border-top: 1px solid var(--line);
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		font-family: inherit;
		font-size: 11.5px;
		background: var(--soft);
		color: var(--ink);
		border: 1px solid var(--border);
		border-radius: 99px;
		padding: 6px 12px;
		cursor: pointer;
	}
	.inrow {
		display: flex;
		gap: 8px;
		padding: 12px 14px;
		border-top: 1px solid var(--line);
	}
	.inrow :global(.input) {
		padding: 11px 13px;
		border-radius: 9px;
		font-size: 13px;
	}
	.inrow :global(.btn) {
		border-radius: 9px;
		padding: 11px 18px;
	}
</style>
