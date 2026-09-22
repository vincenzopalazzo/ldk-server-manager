<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		/** Stretch inside a flex row. */
		grow?: boolean;
		children: Snippet;
	}
	let { label, grow = false, children }: Props = $props();
</script>

<label class="field" class:grow>
	{label}
	<div class="ctl">{@render children()}</div>
</label>

<style>
	.field {
		display: block;
		font-size: 11px;
		color: var(--muted);
		min-width: 0;
	}
	.grow {
		flex: 1;
	}
	.ctl {
		margin-top: 4px;
	}
</style>
