<script lang="ts">
	interface Props {
		k: string;
		v: string;
		/** Value font: mono (default) or sans. */
		mono?: boolean;
		/** Value color override (status). */
		color?: string;
		/** Compact value size (11px) for long ids. */
		small?: boolean;
		/** Graph facts variant: 10.5px key, 13px value. */
		fact?: boolean;
	}
	let { k, v, mono = true, color, small = false, fact = false }: Props = $props();
</script>

<div class="kv" class:fact>
	<div class="k">{k}</div>
	<div class="v" class:mono class:small style:color>{v}</div>
</div>

<style>
	.kv {
		background: var(--soft);
		border-radius: 8px;
		padding: 10px 12px;
		min-width: 0;
		font-size: 12.5px;
	}
	.k {
		color: var(--muted);
		font-size: 11px;
	}
	.fact .k {
		font-size: 10.5px;
	}
	.v {
		font-weight: 600;
		margin-top: 2px;
		overflow-wrap: anywhere;
	}
	.fact .v {
		font-size: 13px;
	}
	.mono {
		font-family: var(--font-mono);
	}
	.small {
		font-size: 11px;
	}
</style>
