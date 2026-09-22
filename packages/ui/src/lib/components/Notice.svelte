<script lang="ts">
	import type { Snippet } from 'svelte';
	interface Props {
		children: Snippet;
	}
	let { children }: Props = $props();
</script>

<div class="notice">{@render children()}</div>

<style>
	.notice {
		border: 1px dashed var(--border);
		border-radius: 10px;
		padding: 16px;
		font-size: 12.5px;
		color: var(--muted);
		text-align: center;
	}
</style>
