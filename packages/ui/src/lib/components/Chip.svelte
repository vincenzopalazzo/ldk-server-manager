<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Show a colored dot before the text. */
		dot?: string;
		/** Uppercase network tag variant (10px, 3x8). */
		tag?: boolean;
		children: Snippet;
	}
	let { dot, tag = false, children }: Props = $props();
</script>

<span class="chip" class:tag>
	{#if dot}<span class="dot" style:background={dot}></span>{/if}
	{@render children()}
</span>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: var(--font-mono);
		font-size: 11.5px;
		background: var(--chip);
		color: var(--headink);
		padding: 5px 12px;
		border-radius: 99px;
		white-space: nowrap;
	}
	.tag {
		font-size: 10px;
		padding: 3px 8px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}
</style>
