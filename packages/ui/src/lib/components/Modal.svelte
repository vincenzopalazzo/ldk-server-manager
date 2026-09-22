<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		/** Panel width in px (design uses 460 and 520). */
		width?: number;
		/** Allow the panel to scroll when tall (add liquidity modal). */
		scroll?: boolean;
		onclose: () => void;
		children: Snippet;
	}
	let { title, width = 460, scroll = false, onclose, children }: Props = $props();

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window {onkeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overlay" onclick={onclose}>
	<div
		class="panel"
		class:scroll
		style:width="{width}px"
		role="dialog"
		aria-modal="true"
		aria-label={title}
		tabindex="-1"
		onclick={(e) => e.stopPropagation()}
	>
		<div class="head">
			<span class="title">{title}</span>
			<button class="close" onclick={onclose} aria-label="Close">✕</button>
		</div>
		{@render children()}
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(15, 15, 12, 0.55);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 50;
		padding: 20px;
	}
	.panel {
		background: var(--card);
		border-radius: 14px;
		max-width: 100%;
		padding: 24px;
		box-sizing: border-box;
	}
	.scroll {
		max-height: 88vh;
		overflow-y: auto;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.title {
		font-weight: 700;
		font-size: 17px;
	}
	.close {
		cursor: pointer;
		color: var(--muted);
		font-size: 18px;
		background: none;
		border: none;
		padding: 0;
		line-height: 1;
	}
</style>
