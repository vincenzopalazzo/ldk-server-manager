<script lang="ts">
	interface Props {
		checked: boolean;
		label: string;
		onchange: (checked: boolean) => void;
	}
	let { checked, label, onchange }: Props = $props();
</script>

<button
	type="button"
	class="cb"
	role="checkbox"
	aria-checked={checked}
	onclick={() => onchange(!checked)}
>
	<span class="box" class:on={checked}>{checked ? '✓' : ''}</span>
	{label}
</button>

<style>
	.cb {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12.5px;
		cursor: pointer;
		user-select: none;
		background: none;
		border: none;
		padding: 0;
		color: var(--ink);
		font-family: inherit;
	}
	.box {
		width: 16px;
		height: 16px;
		border-radius: 4px;
		border: 1.5px solid var(--border);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		color: #161613;
		font-size: 11px;
		font-weight: 700;
		box-sizing: border-box;
	}
	.on {
		background: var(--acc);
	}
</style>
