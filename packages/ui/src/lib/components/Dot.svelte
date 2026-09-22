<script lang="ts">
	interface Props {
		color: string;
		size?: number;
		pulse?: boolean;
		/** Top offset used when aligned with the first text line. */
		top?: number;
	}
	let { color, size = 8, pulse = false, top = 0 }: Props = $props();
</script>

<span
	class="dot"
	class:pulse
	style:background={color}
	style:width="{size}px"
	style:height="{size}px"
	style:margin-top="{top}px"
></span>

<style>
	.dot {
		display: inline-block;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.pulse {
		animation: pulse 2s infinite;
	}
</style>
