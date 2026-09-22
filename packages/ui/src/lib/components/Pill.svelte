<script lang="ts">
	import type { Snippet } from 'svelte';

	export type PillTone = 'green' | 'amber' | 'red' | 'muted';

	interface Props {
		tone?: PillTone;
		/** Centered text (payments table). */
		center?: boolean;
		/** Tiny variant used for the "connected" tag (10px, 2x7). */
		tiny?: boolean;
		children: Snippet;
	}

	let { tone = 'muted', center = false, tiny = false, children }: Props = $props();
</script>

<span class="pill {tone}" class:center class:tiny>{@render children()}</span>

<style>
	.pill {
		display: inline-block;
		font-size: 11.5px;
		font-weight: 600;
		padding: 4px 10px;
		border-radius: 99px;
		white-space: nowrap;
	}
	.center {
		text-align: center;
	}
	.tiny {
		font-size: 10px;
		padding: 2px 7px;
	}
	.green {
		color: var(--green);
		background: var(--greenbg);
	}
	.amber {
		color: var(--amber);
		background: var(--amberbg);
	}
	.red {
		color: var(--red);
		background: var(--redbg);
	}
	.muted {
		color: var(--muted);
		background: var(--soft);
	}
</style>
