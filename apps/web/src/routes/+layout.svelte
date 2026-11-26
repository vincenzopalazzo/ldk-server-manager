<script lang="ts">
	import '@ldk-server-manager/ui/styles.css';
	import { onMount, type Snippet } from 'svelte';
	import { Toast } from '@ldk-server-manager/ui';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import ConnectCard from '$lib/components/ConnectCard.svelte';
	import LinkBanner from '$lib/components/LinkBanner.svelte';
	import SendModal from '$lib/components/SendModal.svelte';
	import ReceiveModal from '$lib/components/ReceiveModal.svelte';
	import LiquidityModal from '$lib/components/LiquidityModal.svelte';
	import AssistantDrawer from '$lib/components/AssistantDrawer.svelte';
	import ProviderPanel from '$lib/components/ProviderPanel.svelte';
	import { connection } from '$lib/config/connection.svelte';
	import { waitForBundle } from '$lib/config/bundle';
	import { assistantConfig } from '$lib/assistant/config.svelte';
	import { balances, channels, nodeInfo, peers, resetAll } from '$lib/state/node.svelte';
	import { forwardedPayments, payments } from '$lib/state/payments.svelte';
	import { feeSummary, forwardingStats } from '$lib/state/forwarding.svelte';
	import { eventFeed } from '$lib/state/events.svelte';
	import { aliases } from '$lib/state/aliases.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import { ui } from '$lib/state/ui.svelte';

	let { children }: { children: Snippet } = $props();

	// A self-hosted bundle serves its own connection details next to the page: use them, so
	// the operator never pastes a macaroon. Elsewhere (the public site) there is no bundle.
	onMount(() => {
		const applyBundle = connection.beginBundleProbe();
		let mounted = true;
		void waitForBundle(window.location.origin, {
			// On a fresh stack the key appears a little after the page; stop once connected.
			keepLooking: () => mounted && !connection.isConfigured,
			afterFirst: () => connection.markReady()
		}).then((bundle) => {
			if (bundle) {
				applyBundle({ url: bundle.nodeUrl, macaroon: bundle.macaroon });
				assistantConfig.bundleGateway = bundle.gatewayUrl;
			}
		});
		return () => {
			mounted = false;
		};
	});

	// Poll authoritative state while connected and keep the live event stream open.
	$effect(() => {
		// Tracked so that saving a different URL or key tears the old pollers and event
		// stream down and starts fresh ones against the new client.
		const settings = connection.settings;
		// Whatever was loaded belongs to the previous connection (or none): drop it, requests
		// in flight included, so no view or assistant snapshot mixes two nodes.
		resetAll();
		payments.reset();
		forwardedPayments.reset();
		if (!settings) {
			eventFeed.stop();
			return;
		}
		const stops = [
			nodeInfo.poll(30_000),
			balances.poll(15_000),
			channels.poll(15_000),
			peers.poll(30_000)
		];
		void payments.refresh();
		void feeSummary.refresh();
		eventFeed.start();
		const off = eventFeed.onEvent((env) => {
			switch (env.event.case) {
				case 'paymentReceived':
				case 'paymentSuccessful':
				case 'paymentFailed':
				case 'paymentClaimable':
					void payments.refresh();
					void balances.refresh();
					break;
				case 'paymentForwarded':
					void feeSummary.refresh();
					void forwardingStats.refresh();
					break;
				default:
					void channels.refresh();
					void balances.refresh();
			}
		});
		return () => {
			stops.forEach((s) => s());
			off();
			eventFeed.stop();
			aliases.clear();
		};
	});
</script>

<div class="root">
	<AppHeader />
	<main>
		{#if connection.isConfigured}
			<div class="stack">
				<LinkBanner />
				{@render children()}
			</div>
		{:else if connection.ready}
			<ConnectCard />
		{/if}
	</main>

	{#if ui.modal === 'send'}<SendModal />{/if}
	{#if ui.modal === 'receive'}<ReceiveModal />{/if}
	{#if ui.modal === 'channel'}<LiquidityModal />{/if}
	{#if ui.assistantOpen}<AssistantDrawer />{/if}
	{#if ui.providerPanelOpen}<ProviderPanel />{/if}
	<Toast message={toast.message} />
</div>

<style>
	.root {
		font-family: var(--font-sans);
		color: var(--ink);
		background: var(--bg);
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	main {
		width: 100%;
		max-width: 1200px;
		margin: 0 auto;
		padding: 24px;
		box-sizing: border-box;
		flex: 1;
	}
</style>
