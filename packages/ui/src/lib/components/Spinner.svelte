<script lang="ts">
	interface Props {
		/** Diameter in px: 34 (send modal), 20 (inline). */
		size?: number;
	}
	let { size = 34 }: Props = $props();
	const border = $derived(size >= 30 ? 3 : 2.5);
</script>

<span class="spin" style:width="{size}px" style:height="{size}px" style:border-width="{border}px"
></span>

<style>
	.spin {
		display: inline-block;
		box-sizing: border-box;
		border-style: solid;
		border-color: var(--soft);
		border-top-color: var(--acc);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		flex-shrink: 0;
	}
</style>
