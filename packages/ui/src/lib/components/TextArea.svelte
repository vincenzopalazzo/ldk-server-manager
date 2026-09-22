<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	interface Props extends HTMLTextareaAttributes {
		value?: string;
	}
	let { value = $bindable(''), class: cls = '', ...rest }: Props = $props();
</script>

<textarea class="ta {cls}" bind:value {...rest}></textarea>

<style>
	.ta {
		width: 100%;
		box-sizing: border-box;
		padding: 12px;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg);
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 12px;
		resize: vertical;
	}
	.ta:focus {
		outline: 2px solid var(--acc);
		outline-offset: -1px;
	}
</style>
