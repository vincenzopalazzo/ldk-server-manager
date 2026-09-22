<script lang="ts">
	interface Props {
		/** 0..100 */
		percent: number;
		fill?: 'accent' | 'ink';
	}
	let { percent, fill = 'accent' }: Props = $props();
	const width = $derived(`${Math.max(0, Math.min(100, percent))}%`);
</script>

<div class="track"><div class="fill {fill}" style:width></div></div>

<style>
	.track {
		height: 6px;
		border-radius: 3px;
		background: var(--soft);
		position: relative;
		overflow: hidden;
	}
	.fill {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
	}
	.accent {
		background: var(--acc);
	}
	.ink {
		background: var(--ink);
	}
</style>
