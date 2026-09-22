<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLInputAttributes, 'size'> {
		value?: string;
		/** Monospace text (ids, amounts, addresses). */
		mono?: boolean;
		/** sm: 8x10 / 12px / r7 (channel aside). md: 10x12 / 12.5px / r8. */
		size?: 'sm' | 'md';
	}

	let {
		value = $bindable(''),
		mono = false,
		size = 'md',
		class: cls = '',
		...rest
	}: Props = $props();
</script>

<input class="input {size} {cls}" class:mono bind:value {...rest} />

<style>
	.input {
		width: 100%;
		box-sizing: border-box;
		border: 1px solid var(--border);
		background: var(--bg);
		color: var(--ink);
		font-family: inherit;
		min-width: 0;
	}
	.input:focus {
		outline: 2px solid var(--acc);
		outline-offset: -1px;
	}
	.md {
		padding: 10px 12px;
		border-radius: 8px;
		font-size: 12.5px;
	}
	.sm {
		padding: 8px 10px;
		border-radius: 7px;
		font-size: 12px;
	}
	.mono {
		font-family: var(--font-mono);
	}
	.mono.md {
		font-size: 12.5px;
	}
</style>
