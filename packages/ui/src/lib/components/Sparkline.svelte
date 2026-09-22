<script lang="ts">
	interface Props {
		/** Bars as 0..100 heights; the last `accent` bars are highlighted. */
		bars: number[];
		accent?: number;
	}
	let { bars, accent = 2 }: Props = $props();
</script>

<div class="spark">
	{#each bars as h, i (i)}
		<span class:acc={i >= bars.length - accent} style:height="{Math.max(4, h)}%"></span>
	{/each}
</div>

<style>
	.spark {
		display: flex;
		gap: 3px;
		align-items: flex-end;
		height: 22px;
		margin-top: 8px;
	}
	span {
		flex: 1;
		background: var(--border);
	}
	.acc {
		background: var(--acc);
	}
</style>
