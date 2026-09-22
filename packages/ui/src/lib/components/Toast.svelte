<script lang="ts">
	interface Props {
		message: string | null;
	}
	let { message }: Props = $props();
</script>

{#if message}
	<div class="toast" role="status">{message}</div>
{/if}

<style>
	.toast {
		position: fixed;
		bottom: 24px;
		left: 50%;
		transform: translateX(-50%);
		background: var(--head);
		color: var(--headink);
		border-radius: 99px;
		padding: 10px 22px;
		font-size: 13px;
		font-weight: 600;
		z-index: 80;
		box-shadow: 0 4px 16px rgba(15, 15, 12, 0.3);
		max-width: calc(100vw - 48px);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
