<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends HTMLButtonAttributes {
		/** Visual style. Mirrors the button treatments used across the design. */
		variant?: 'primary' | 'dark' | 'outline' | 'soft' | 'danger' | 'danger-soft' | 'chip';
		/** sm: 11.5px/6x12, md: 12.5px/8x16, lg: 13px/10x20, xl: 14px/11x22 */
		size?: 'sm' | 'md' | 'lg' | 'xl';
		/** Full-width block button (modal primary actions). */
		block?: boolean;
		children: Snippet;
	}

	let {
		variant = 'primary',
		size = 'md',
		block = false,
		children,
		class: cls = '',
		...rest
	}: Props = $props();
</script>

<button class="btn {variant} {size} {cls}" class:block {...rest}>{@render children()}</button>

<style>
	.btn {
		font-family: inherit;
		font-weight: 600;
		border: none;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		white-space: nowrap;
		line-height: normal;
	}
	.btn:disabled {
		opacity: 0.55;
		cursor: default;
	}
	.sm {
		font-size: 11.5px;
		padding: 6px 12px;
		border-radius: 7px;
	}
	.md {
		font-size: 12.5px;
		padding: 8px 16px;
		border-radius: 7px;
	}
	.lg {
		font-size: 13px;
		padding: 10px 20px;
		border-radius: 8px;
	}
	.xl {
		font-size: 14px;
		padding: 11px 22px;
		border-radius: 8px;
	}
	.block {
		width: 100%;
		padding: 12px;
		font-size: 14px;
		border-radius: 8px;
	}
	.primary {
		background: var(--acc);
		color: #161613;
	}
	.dark {
		background: var(--head);
		color: var(--headink);
		border: 1px solid var(--head);
	}
	.outline {
		background: var(--card);
		color: var(--ink);
		border: 1px solid var(--border);
	}
	.soft {
		background: var(--soft);
		color: var(--ink);
	}
	.danger {
		background: var(--card);
		color: var(--red);
		border: 1px solid var(--red);
	}
	.danger-soft {
		background: var(--redbg);
		color: var(--red);
	}
	.chip {
		font-family: var(--font-mono);
		font-weight: 400;
		font-size: 11.5px;
		background: var(--chip);
		color: var(--headink);
		border-radius: 99px;
		padding: 5px 12px;
	}
</style>
