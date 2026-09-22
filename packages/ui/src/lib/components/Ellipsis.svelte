<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Primary line: 600 weight. */
		strong?: boolean;
		mono?: boolean;
		muted?: boolean;
		size?: number;
		children: Snippet;
	}
	let { strong = false, mono = false, muted = false, size, children }: Props = $props();
</script>

<div
	class="ell"
	class:strong
	class:mono
	class:muted
	style:font-size={size ? `${size}px` : undefined}
>
	{@render children()}
</div>

<style>
	.ell {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.strong {
		font-weight: 600;
	}
	.mono {
		font-family: var(--font-mono);
	}
	.muted {
		color: var(--muted);
	}
</style>
