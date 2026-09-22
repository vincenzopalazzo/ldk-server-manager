<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** CSS grid-template-columns for the row. */
		columns: string;
		gap?: number;
		/** Vertical/horizontal padding, e.g. "13px 20px". */
		padding?: string;
		clickable?: boolean;
		selected?: boolean;
		/** Row separator: soft (default) or line (header rows). */
		divider?: 'soft' | 'line';
		fontSize?: number;
		align?: 'center' | 'flex-start';
		onclick?: () => void;
		children: Snippet;
	}
	let {
		columns,
		gap = 14,
		padding = '12px 20px',
		clickable = false,
		selected = false,
		divider = 'soft',
		fontSize = 13,
		align = 'center',
		onclick,
		children
	}: Props = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
	class="row {divider}"
	class:clickable
	class:selected
	style:grid-template-columns={columns}
	style:gap="{gap}px"
	style:padding
	style:font-size="{fontSize}px"
	style:align-items={align}
	{onclick}
>
	{@render children()}
</div>

<style>
	.row {
		display: grid;
		border-bottom: 1px solid var(--soft);
		min-width: 0;
	}
	.line {
		border-bottom-color: var(--line);
	}
	.clickable {
		cursor: pointer;
	}
	.selected {
		background: var(--soft);
	}
</style>
