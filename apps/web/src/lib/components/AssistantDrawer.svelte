<script lang="ts">
	import { tick } from 'svelte';
	import { Button, Drawer, Input } from '@ldk-server-manager/ui';
	import { ui } from '$lib/state/ui.svelte';
	import { chat } from '$lib/assistant/chat.svelte';
	import { assistantKey } from '$lib/assistant/key.svelte';
	import { showToast } from '$lib/state/toast.svelte';

	const SUGGESTIONS = [
		'How is my node doing?',
		'Where is my liquidity tight?',
		'Create a 50k sat invoice'
	];

	let input = $state('');
	let keyInput = $state('');
	let body: HTMLDivElement | undefined = $state();

	async function send(text = input) {
		if (!text.trim() || chat.busy) return;
		input = '';
		void chat.send(text);
		await tick();
		scroll();
	}

	function scroll() {
		setTimeout(() => {
			if (body) body.scrollTop = body.scrollHeight;
		}, 60);
	}

	$effect(() => {
		void chat.messages.length;
		void chat.busy;
		scroll();
	});

	function saveKey() {
		assistantKey.set(keyInput);
		keyInput = '';
		showToast(assistantKey.value ? 'Assistant key saved' : 'Assistant key removed');
	}
</script>

<Drawer
	title="Node Assistant"
	subtitle={assistantKey.value ? 'claude-opus-5 · key stored locally' : 'no API key configured'}
	onclose={() => ui.toggleAssistant()}
>
	<div class="body" bind:this={body}>
		{#each chat.messages as m, i (i)}
			<div class="msg" class:user={m.role === 'user'}>{m.text}</div>
		{/each}
		{#if chat.busy}
			<div class="msg thinking"><span class="pulse">thinking…</span></div>
		{/if}
	</div>
	{#if !assistantKey.value}
		<div class="keyrow">
			<Input
				bind:value={keyInput}
				mono
				type="password"
				placeholder="Anthropic API key (sk-ant-…)"
			/>
			<Button variant="dark" size="lg" onclick={saveKey}>Save</Button>
		</div>
	{/if}
	<div class="chips">
		{#each SUGGESTIONS as s (s)}
			<button class="chip" onclick={() => send(s)}>{s}</button>
		{/each}
	</div>
	<div class="inrow">
		<Input
			bind:value={input}
			placeholder="Ask or command the node…"
			onkeydown={(e) => e.key === 'Enter' && send()}
		/>
		<Button size="lg" onclick={() => send()} disabled={chat.busy}>Send</Button>
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
	.keyrow {
		display: flex;
		gap: 8px;
		padding: 10px 14px;
		border-top: 1px solid var(--line);
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
