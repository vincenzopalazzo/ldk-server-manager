<script lang="ts" generics="K extends string">
	interface Props {
		items: { key: K; label: string }[];
		active: K;
		onselect: (key: K) => void;
		/** segment: flex:1 / 9px / r8 (modals). filter: 6x14 / r99 (payments). */
		variant?: 'segment' | 'filter';
	}
	let { items, active, onselect, variant = 'segment' }: Props = $props();
</script>

<div class="tabs {variant}">
	{#each items as it (it.key)}
		<button class="tab" class:active={it.key === active} onclick={() => onselect(it.key)}
			>{it.label}</button
		>
	{/each}
</div>

<style>
	.tabs {
		display: flex;
		gap: 6px;
	}
	.tab {
		font-family: inherit;
		font-weight: 600;
		border: none;
		cursor: pointer;
		color: var(--muted);
		background: var(--soft);
	}
	.tab.active {
		color: #161613;
		background: var(--acc);
	}
	.segment .tab {
		flex: 1;
		font-size: 12.5px;
		border-radius: 8px;
		padding: 9px;
	}
	.filter .tab {
		font-size: 12px;
		border-radius: 99px;
		padding: 6px 14px;
	}
</style>
