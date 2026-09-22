<script lang="ts">
	import { Button, QrCode } from '@ldk-server-manager/ui';
	import { showToast } from '$lib/state/toast.svelte';

	interface Props {
		value: string;
	}
	let { value }: Props = $props();

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			showToast('Copied');
		} catch {
			showToast('Clipboard unavailable');
		}
	}
</script>

<div class="result">
	<QrCode {value} />
	<div class="text">{value}</div>
	<Button variant="dark" size="lg" onclick={copy}>Copy to clipboard</Button>
</div>

<style>
	.result {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		margin-top: 16px;
	}
	.text {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--muted);
		word-break: break-all;
		background: var(--soft);
		border-radius: 8px;
		padding: 10px 12px;
		max-height: 70px;
		overflow: hidden;
		width: 100%;
		box-sizing: border-box;
	}
</style>
