<script lang="ts">
	import { untrack } from 'svelte';
	import { Button, Dot, Drawer, Input } from '@ldk-server-manager/ui';
	import { ui } from '$lib/state/ui.svelte';
	import { chat } from '$lib/assistant/chat.svelte';
	import { assistantConfig } from '$lib/assistant/config.svelte';
	import { gatewayHealth, watchGateway } from '$lib/assistant/gateway.svelte';
	import { describeGateway } from '$lib/assistant/gatewayStatus';

	const SUGGESTIONS = [
		'How is my node doing?',
		'Where is my liquidity tight?',
		'Create a 50k sat invoice'
	];

	let input = $state('');
	let body: HTMLDivElement | undefined = $state();

	const provider = $derived(assistantConfig.provider);
	const subtitle = $derived(
		assistantConfig.isReady
			? [
					assistantConfig.label,
					assistantConfig.model,
					// Known after the first turn: the gateway may serve the node's own tools.
					chat.tools?.source === 'node' ? `${chat.tools.count} node tools` : null
				]
					.filter(Boolean)
					.join(' · ')
			: `${assistantConfig.label} · no key`
	);

	/** Providers whose endpoint holds the credential are served by the goose gateway. */
	const viaGateway = $derived(provider.tokenOptional === true);
	const gateway = $derived(describeGateway(gatewayHealth.data, assistantConfig.gooseProvider.name));
	/** Only a finished check that found a problem is worth interrupting the chat for. */
	const gatewayProblem = $derived(
		viaGateway && gatewayHealth.data && gatewayHealth.data.state !== 'online' ? gateway : null
	);

	// Watch the gateway while the drawer is open, restarting when the provider or host changes.
	$effect(() => {
		const active = viaGateway;
		void assistantConfig.host;
		void assistantConfig.gooseProvider.id;
		if (!active) return;
		return untrack(() => watchGateway());
	});

	function send(text = input) {
		if (!text.trim() || chat.busy || chat.pending) return;
		input = '';
		void chat.send(text);
	}

	function openProviders() {
		ui.providerPanelOpen = true;
	}

	// Keep the transcript pinned to the newest message.
	$effect(() => {
		void chat.messages.length;
		void chat.messages.at(-1)?.text; // follows a reply as it streams in
		void chat.busy;
		void chat.pending;
		setTimeout(() => {
			if (body) body.scrollTop = body.scrollHeight;
		}, 60);
	});
</script>

<Drawer title="Node Assistant" {subtitle} onclose={() => ui.toggleAssistant()}>
	{#snippet titleExtra()}
		{#if viaGateway}
			<span
				class="gwdot"
				title="Gateway {gateway.text}"
				role="img"
				aria-label="Gateway {gateway.text}"
			>
				<Dot color={gateway.dot} size={7} pulse={gatewayHealth.data?.state === 'online'} />
			</span>
		{/if}
	{/snippet}

	{#if gatewayProblem}
		<div class="gw" class:red={gatewayProblem.tone === 'red'}>
			<div class="gwtext">
				<div class="atitle">{gatewayProblem.title}</div>
				<div class="gwhint">{gatewayProblem.hint}</div>
			</div>
			{#if gatewayHealth.data?.state === 'no-credential'}
				<Button variant="outline" size="md" onclick={openProviders}>Set up</Button>
			{:else}
				<Button
					variant="outline"
					size="md"
					onclick={() => gatewayHealth.refresh()}
					disabled={gatewayHealth.loading}
				>
					{gatewayHealth.loading ? 'Checking…' : 'Check again'}
				</Button>
			{/if}
		</div>
	{/if}

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

		{#if chat.busy && !chat.streaming}
			<div class="msg thinking"><span class="pulse">thinking…</span></div>
		{/if}
	</div>

	{#if !assistantConfig.isReady}
		<div class="setup">
			<span>{provider.label} needs a key before it can answer.</span>
			<Button size="md" onclick={openProviders}>Choose a provider</Button>
		</div>
	{/if}

	<div class="chips">
		{#each SUGGESTIONS as s (s)}
			<button class="chip" onclick={() => send(s)}>{s}</button>
		{/each}
		<button class="chip" onclick={openProviders}>Provider</button>
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
		/* Approval lines show invoices and messages whole; let them wrap. */
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}
	.abtns {
		display: flex;
		gap: 8px;
	}
	.gwdot {
		display: inline-flex;
	}
	.gw {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 10px 14px;
		background: var(--amberbg);
		color: var(--amber);
		border-bottom: 1px solid var(--line);
	}
	.gw.red {
		background: var(--redbg);
		color: var(--red);
	}
	.gwtext {
		flex: 1;
		min-width: 0;
	}
	.gwhint {
		font-size: 12px;
		line-height: 1.5;
		margin-top: 2px;
		word-break: break-word;
	}
	.setup {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 14px;
		border-top: 1px solid var(--line);
		font-size: 12.5px;
		color: var(--muted);
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
