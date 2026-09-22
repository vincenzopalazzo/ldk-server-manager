<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Uppercase mono caption above the rows (LSPS quote). */
		caption?: string;
		rows: { k: string; v: string; mono?: boolean; strong?: boolean; total?: boolean }[];
		/** Row vertical padding: 4 (send summary) or 3 (quote). */
		rowPad?: number;
		children?: Snippet;
	}
	let { caption, rows, rowPad = 4, children }: Props = $props();
</script>

<div class="box">
	{#if caption}<div class="cap">{caption}</div>{/if}
	{#each rows as r (r.k)}
		<div class="row" class:total={r.total} style:padding="{rowPad}px 0">
			<span class="k">{r.k}</span>
			<span class="v" class:mono={r.mono} class:strong={r.strong}>{r.v}</span>
		</div>
	{/each}
	{#if children}{@render children()}{/if}
</div>

<style>
	.box {
		background: var(--soft);
		border-radius: 10px;
		padding: 14px 16px;
		font-size: 13px;
	}
	.cap {
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.09em;
		margin-bottom: 6px;
	}
	.row {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}
	.total {
		border-top: 1px solid var(--border);
		margin-top: 6px;
		padding-top: 8px !important;
	}
	.k {
		color: var(--muted);
	}
	.v {
		text-align: right;
		overflow-wrap: anywhere;
	}
	.mono {
		font-family: var(--font-mono);
	}
	.strong {
		font-weight: 600;
	}
	.total .v {
		font-weight: 700;
	}
</style>
