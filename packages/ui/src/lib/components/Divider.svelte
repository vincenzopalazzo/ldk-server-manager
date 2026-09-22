<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Section heading (13px / 600) rendered above the content. */
		heading?: string;
		children: Snippet;
	}
	let { heading, children }: Props = $props();
</script>

<div class="section">
	{#if heading}<div class="heading">{heading}</div>{/if}
	{@render children()}
</div>

<style>
	.section {
		border-top: 1px solid var(--line);
		padding-top: 14px;
	}
	.heading {
		font-weight: 600;
		font-size: 13px;
		margin-bottom: 8px;
	}
</style>
