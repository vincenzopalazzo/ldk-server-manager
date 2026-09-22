<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		/** Extra content rendered inline after the title (a status dot, a pill). */
		titleExtra?: Snippet;
		subtitle?: string;
		icon?: string;
		onclose: () => void;
		children: Snippet;
		/** Rendered above the input row, below the scrolling body. */
		footer?: Snippet;
	}
	let { title, titleExtra, subtitle, icon = '✦', onclose, children, footer }: Props = $props();
</script>

<aside class="drawer">
	<div class="head">
		<span class="icon">{icon}</span>
		<div class="titles">
			<div class="title">
				{title}{#if titleExtra}{@render titleExtra()}{/if}
			</div>
			{#if subtitle}<div class="sub">{subtitle}</div>{/if}
		</div>
		<button class="close" onclick={onclose} aria-label="Close">✕</button>
	</div>
	{@render children()}
	{#if footer}{@render footer()}{/if}
</aside>

<style>
	.drawer {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 400px;
		max-width: 92vw;
		background: var(--card);
		box-shadow: -8px 0 30px rgba(15, 15, 12, 0.18);
		z-index: 60;
		display: flex;
		flex-direction: column;
		animation: slidein 0.22s ease;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px 18px;
		border-bottom: 1px solid var(--line);
		background: var(--head);
		color: var(--headink);
	}
	.icon {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--acc);
		color: #161613;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 13px;
	}
	.titles {
		flex: 1;
	}
	.title {
		font-weight: 700;
		font-size: 14px;
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.sub {
		font-size: 10.5px;
		opacity: 0.7;
		font-family: var(--font-mono);
	}
	.close {
		cursor: pointer;
		font-size: 17px;
		opacity: 0.8;
		background: none;
		border: none;
		color: inherit;
		padding: 0;
		line-height: 1;
	}
</style>
