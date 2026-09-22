<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { Network } from '@ldk-server-manager/client';
	import { Chip } from '@ldk-server-manager/ui';
	import { prefs } from '$lib/state/prefs.svelte';
	import { ui } from '$lib/state/ui.svelte';
	import { nodeInfo } from '$lib/state/node.svelte';
	import { connection } from '$lib/config/connection.svelte';

	const NAV = [
		{ label: 'Dashboard', href: '/' },
		{ label: 'Channels', href: '/channels' },
		{ label: 'Payments', href: '/payments' },
		{ label: 'Peers', href: '/peers' },
		{ label: 'Forwarding', href: '/forwarding' },
		{ label: 'Graph', href: '/graph' },
		{ label: 'Settings', href: '/settings' }
	];

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);

	const network = $derived.by(() => {
		switch (nodeInfo.data?.network) {
			case Network.BITCOIN:
				return 'mainnet';
			case Network.TESTNET:
				return 'testnet';
			case Network.TESTNET4:
				return 'testnet4';
			case Network.SIGNET:
				return 'signet';
			case Network.REGTEST:
				return 'regtest';
			default:
				return connection.isConfigured ? '…' : 'offline';
		}
	});

	const sync = $derived.by(() => {
		if (!connection.isConfigured) return { dot: 'var(--nav-inactive)', text: 'not connected' };
		if (nodeInfo.error) return { dot: 'var(--live-red)', text: 'offline' };
		const h = nodeInfo.data?.currentBestBlock?.height;
		if (h === undefined) return { dot: 'var(--acc)', text: 'connecting…' };
		return { dot: 'var(--live)', text: `synced · ${h.toLocaleString('en-US')}` };
	});
</script>

<header>
	<button class="brand" onclick={() => goto('/')}>
		<span class="logo">
			<svg width="18" height="18" viewBox="0 0 26 26">
				<path
					d="M13 13c0-2.5 3.5-2.5 3.5 0c0 3.5-5.5 3.5-5.5 0c0-5 8.5-5 8.5 0c0 6.5-12 6.5-12 0"
					fill="none"
					stroke="#161613"
					stroke-width="2"
					stroke-linecap="round"
				/>
			</svg>
		</span>
		<span class="name">LDK Server</span>
		<Chip tag>{network}</Chip>
	</button>
	<nav>
		{#each NAV as item (item.href)}
			<a href={item.href} class:active={isActive(item.href)}>{item.label}</a>
		{/each}
	</nav>
	<div class="right">
		<Chip dot={sync.dot}>{sync.text}</Chip>
		<button class="chipbtn" onclick={() => prefs.toggleUnit()} title="Toggle sats / BTC"
			>{prefs.unitLabel}</button
		>
		<button class="chipbtn theme" onclick={() => prefs.toggleTheme()} title="Toggle theme"
			>{prefs.dark ? '☀' : '☾'}</button
		>
		<button class="assistant" onclick={() => ui.toggleAssistant()}>✦ Assistant</button>
	</div>
</header>

<style>
	header {
		display: flex;
		align-items: center;
		gap: 16px 22px;
		padding: 10px 24px;
		min-height: 58px;
		box-sizing: border-box;
		background: var(--head);
		color: var(--headink);
		flex-wrap: wrap;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		cursor: pointer;
		background: none;
		border: none;
		color: inherit;
		padding: 0;
		font-family: inherit;
	}
	.logo {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--acc);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.name {
		font-weight: 700;
		font-size: 16px;
	}
	nav {
		display: flex;
		gap: 4px;
		font-size: 13.5px;
		font-weight: 500;
		flex-wrap: wrap;
		min-width: 0;
	}
	nav a {
		cursor: pointer;
		padding: 6px 10px;
		border-radius: 7px;
		color: var(--nav-inactive);
		background: transparent;
		text-decoration: none;
	}
	nav a.active {
		color: var(--acc);
		background: var(--chip);
	}
	.right {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		font-family: var(--font-mono);
		font-size: 11.5px;
	}
	.chipbtn {
		font-family: inherit;
		font-size: 11.5px;
		background: var(--chip);
		color: var(--headink);
		border: none;
		border-radius: 99px;
		padding: 5px 12px;
		cursor: pointer;
	}
	.theme {
		font-size: 12px;
		padding: 5px 11px;
	}
	.assistant {
		font-family: var(--font-sans);
		font-size: 12.5px;
		font-weight: 600;
		background: var(--acc);
		color: #161613;
		border: none;
		border-radius: 99px;
		padding: 6px 14px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
</style>
