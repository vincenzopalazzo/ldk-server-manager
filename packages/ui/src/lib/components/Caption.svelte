<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** letter-spacing: 0.1em (default) or 0.08em/0.09em */
		spacing?: string;
		size?: number;
		children: Snippet;
	}
	let { spacing = '0.1em', size = 11, children }: Props = $props();
</script>

<div class="cap" style:letter-spacing={spacing} style:font-size="{size}px">
	{@render children()}
</div>

<style>
	.cap {
		font-family: var(--font-mono);
		color: var(--muted);
		text-transform: uppercase;
	}
</style>
