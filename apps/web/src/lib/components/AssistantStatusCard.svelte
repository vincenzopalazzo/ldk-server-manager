<script lang="ts">
	import { untrack } from 'svelte';
	import { Button, Card, Pill, type PillTone } from '@ldk-server-manager/ui';
	import { assistantConfig } from '$lib/assistant/config.svelte';
	import { gatewayHealth } from '$lib/assistant/gateway.svelte';
	import type { GatewayState } from '$lib/assistant/gateway';
	import { ui } from '$lib/state/ui.svelte';
	import { relativeTime } from '$lib/utils/format';

	const STATUS: Record<GatewayState, { text: string; tone: PillTone }> = {
		online: { text: 'online', tone: 'green' },
		'no-credential': { text: 'no credential', tone: 'amber' },
		unreachable: { text: 'unreachable', tone: 'red' },
		error: { text: 'error', tone: 'red' }
	};

	const provider = $derived(assistantConfig.provider);
	/** Providers whose endpoint holds the credential are served by the goose gateway. */
	const viaGateway = $derived(provider.tokenOptional === true);
	const check = $derived(gatewayHealth.data);
	const status = $derived(
		check ? STATUS[check.state] : { text: 'checking…', tone: 'muted' as PillTone }
	);

	const hint = $derived.by(() => {
		if (!viaGateway || !check) return null;
		switch (check.state) {
			case 'online':
				return null;
			case 'no-credential':
				return 'The gateway is running but goose has no usable credential. On the host, run `goose configure` and choose xai_oauth.';
			case 'unreachable':
				return `Nothing answered at ${check.url}. Start it from the repository root with \`docker compose up -d\`, or fix the address in the assistant's Setup panel.`;
			case 'error':
				return `The gateway answered unexpectedly (${check.detail}).`;
		}
	});

	// Poll while this card is on screen. Tracks the provider and host explicitly, so a change
	// in the assistant's Setup panel restarts the check against the new address.
	$effect(() => {
		const active = viaGateway;
		void assistantConfig.host;
		if (!active) return;
		return untrack(() => gatewayHealth.poll(15_000));
	});
</script>

<Card padding="20px">
	<div class="h">Assistant</div>
	<div class="cfg">
		<div class="row"><span class="ck">provider</span><span class="cv">{provider.label}</span></div>
		<div class="row">
			<span class="ck">model</span><span class="cv">{assistantConfig.model}</span>
		</div>
		<div class="row">
			<span class="ck">endpoint</span><span class="cv">{assistantConfig.host || '—'}</span>
		</div>
		{#if viaGateway}
			<div class="row">
				<span class="ck">gateway</span>
				<Pill tone={status.tone}>{status.text}</Pill>
			</div>
			<div class="row">
				<span class="ck">upstream</span><span class="cv">{check?.provider ?? '—'}</span>
			</div>
			<div class="row">
				<span class="ck">latency</span>
				<span class="cv">{check?.latencyMs != null ? `${check.latencyMs} ms` : '—'}</span>
			</div>
			<div class="row">
				<span class="ck">last_check</span>
				<span class="cv">{check ? relativeTime(Math.floor(check.checkedAt / 1000)) : '—'}</span>
			</div>
		{:else}
			<div class="row">
				<span class="ck">credential</span>
				<Pill tone={assistantConfig.token ? 'green' : 'amber'}>
					{assistantConfig.token ? 'saved in this browser' : 'not set'}
				</Pill>
			</div>
		{/if}
	</div>
	{#if hint}<div class="hint">{hint}</div>{/if}
	{#if !viaGateway}
		<div class="hint">
			Calls go straight from this browser to the provider; no gateway involved.
		</div>
	{/if}
	<div class="btns">
		{#if viaGateway}
			<Button
				variant="dark"
				onclick={() => gatewayHealth.refresh()}
				disabled={gatewayHealth.loading}
			>
				{gatewayHealth.loading ? 'Checking…' : 'Check now'}
			</Button>
		{/if}
		<Button variant="outline" onclick={() => (ui.assistantOpen = true)}>Open assistant</Button>
	</div>
</Card>

<style>
	.h {
		font-weight: 600;
		font-size: 14.5px;
		margin-bottom: 12px;
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
		align-items: center;
		gap: 12px;
		padding: 8px 0;
		border-bottom: 1px solid var(--soft);
		min-height: 18px;
	}
	.ck {
		color: var(--muted);
	}
	.cv {
		text-align: right;
		word-break: break-all;
	}
	.hint {
		font-size: 12.5px;
		color: var(--muted);
		line-height: 1.6;
		margin-top: 12px;
	}
	.btns {
		display: flex;
		gap: 8px;
		margin-top: 14px;
	}
</style>
