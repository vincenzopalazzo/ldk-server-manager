<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Optional header title (14.5px / 600). */
		title?: string;
		/** Right-aligned header content (buttons, links). */
		actions?: Snippet;
		/** Extra content rendered inside the title cell, after the text. */
		titleExtra?: Snippet;
		/** Inner padding for free-form cards. Lists usually keep padding 0. */
		padding?: string;
		class?: string;
		children: Snippet;
	}

	let { title, actions, titleExtra, padding = '0', class: cls = '', children }: Props = $props();
</script>

<section class="card {cls}">
	{#if title || actions}
		<div class="head">
			<span class="title"
				>{title}{#if titleExtra}{@render titleExtra()}{/if}</span
			>
			{#if actions}{@render actions()}{/if}
		</div>
	{/if}
	<div class="body" style:padding>{@render children()}</div>
</section>

<style>
	.card {
		background: var(--card);
		border-radius: 12px;
		box-shadow: var(--shadow);
		overflow: hidden;
		min-width: 0;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 14px 20px;
		border-bottom: 1px solid var(--line);
		flex-wrap: wrap;
		gap: 10px;
	}
	.title {
		font-weight: 600;
		font-size: 14.5px;
		display: flex;
		align-items: center;
		gap: 8px;
	}
</style>
