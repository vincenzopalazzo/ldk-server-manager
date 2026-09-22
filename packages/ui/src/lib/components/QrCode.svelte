<script lang="ts">
	import qrcode from 'qrcode-generator';

	interface Props {
		value: string;
		/** Box size in px (design: 180 with 10px inset). */
		size?: number;
	}
	let { value, size = 180 }: Props = $props();

	const svg = $derived.by(() => {
		try {
			const qr = qrcode(0, 'M');
			qr.addData(value);
			qr.make();
			return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
		} catch {
			return '';
		}
	});
</script>

<div class="qr" style:width="{size}px" style:height="{size}px">
	{#if svg}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG generated locally by qrcode-generator, no user markup -->
		<div class="inner">{@html svg}</div>
	{/if}
</div>

<style>
	.qr {
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 10px;
		position: relative;
		overflow: hidden;
		flex-shrink: 0;
		box-sizing: border-box;
	}
	.inner {
		position: absolute;
		inset: 10px;
	}
	.inner :global(svg) {
		width: 100%;
		height: 100%;
		display: block;
	}
</style>
