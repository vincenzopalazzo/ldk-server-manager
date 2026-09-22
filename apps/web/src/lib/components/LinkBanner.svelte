<script lang="ts">
	import { Button } from '@ldk-server-manager/ui';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { nodeLink } from '$lib/state/status.svelte';

	const tone = $derived(nodeLink.state === 'unauthorized' ? 'red' : 'amber');
</script>

{#if nodeLink.title}
	<div class="banner {tone}" role="alert">
		<div class="text">
			<div class="title">{nodeLink.title}</div>
			{#if nodeLink.hint}<div class="hint">{nodeLink.hint}</div>{/if}
		</div>
		<Button variant="outline" size="md" onclick={() => goto(resolve('/settings'))}>Settings</Button>
	</div>
{/if}

<style>
	.banner {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		border-radius: 12px;
		padding: 14px 18px;
		box-shadow: var(--shadow);
	}
	.red {
		background: var(--redbg);
		color: var(--red);
	}
	.amber {
		background: var(--amberbg);
		color: var(--amber);
	}
	.text {
		flex: 1;
		min-width: 0;
	}
	.title {
		font-weight: 600;
		font-size: 14px;
	}
	.hint {
		font-size: 12.5px;
		margin-top: 4px;
		line-height: 1.5;
		opacity: 0.9;
	}
</style>
