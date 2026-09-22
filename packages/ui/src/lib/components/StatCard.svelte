<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		value: string;
		/** Footer note (11.5px muted). */
		note?: string;
		/** Space between value and note when nothing sits in between. */
		noteGap?: number;
		/** Larger value treatment for the graph counters (24px / 600). */
		big?: boolean;
		children?: Snippet;
	}
	let { label, value, note, noteGap = 8, big = false, children }: Props = $props();
</script>

<div class="stat" class:big>
	<div class="label">{label}</div>
	<div class="value">{value}</div>
	{#if children}{@render children()}{/if}
	{#if note}<div class="note" style:margin-top="{noteGap}px">{note}</div>{/if}
</div>

<style>
	.stat {
		background: var(--card);
		border-radius: 12px;
		padding: 18px 20px;
		box-shadow: var(--shadow);
		min-width: 0;
	}
	.big {
		padding: 16px 20px;
	}
	.label {
		font-size: 12.5px;
		color: var(--muted);
		font-weight: 500;
	}
	.big .label {
		font-size: 12px;
		font-weight: 400;
	}
	.value {
		font-family: var(--font-mono);
		font-size: 22px;
		font-weight: 500;
		margin-top: 6px;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.big .value {
		font-size: 24px;
		font-weight: 600;
		margin-top: 4px;
	}
	.note {
		font-size: 11.5px;
		color: var(--muted);
	}
</style>
