<script lang="ts">
	import { Button, Field, Input } from '@ldk-server-manager/ui';
	import { externalLink, type GatewayProvider } from '$lib/assistant/gatewayProviders';

	interface Props {
		provider: GatewayProvider;
		busy: boolean;
		onsave: (fields: Record<string, string>) => void;
		onremove: () => void;
	}
	let { provider, busy, onsave, onremove }: Props = $props();

	// Non-secret values (a host) start from what is stored; secrets always start empty.
	const initial = () =>
		Object.fromEntries(provider.fields.map((f) => [f.key, f.secret ? '' : (f.value ?? '')]));
	let values = $state<Record<string, string>>(initial());

	/** Only what changed is sent, so a saved key is kept when only the host is edited. */
	const changes = $derived(
		Object.fromEntries(
			provider.fields
				.filter((f) => {
					const v = (values[f.key] ?? '').trim();
					return v !== '' && v !== (f.secret ? '' : (f.value ?? ''));
				})
				.map((f) => [f.key, values[f.key].trim()])
		)
	);
	/** Every required field either has a stored value or a new one. */
	const complete = $derived(
		provider.fields.every((f) => !f.required || f.set || (values[f.key] ?? '').trim() !== '')
	);

	function placeholder(f: GatewayProvider['fields'][number]): string {
		if (f.secret && f.set) return 'saved · enter a new one to replace it';
		return f.placeholder ?? f.default ?? '';
	}
</script>

<div class="fields">
	{#each provider.fields as f (f.key)}
		<Field label={f.required ? f.label : `${f.label} (optional)`}>
			<Input
				bind:value={values[f.key]}
				mono
				type={f.secret ? 'password' : 'text'}
				autocomplete="off"
				placeholder={placeholder(f)}
			/>
		</Field>
	{/each}
</div>
<p class="note">
	{#if provider.fields.some((f) => f.secret)}
		Keys are sent to the gateway and stored by goose on that machine. They never come back to this
		page.
	{:else}
		Stored in goose’s configuration on the gateway’s machine.
	{/if}
	{#if externalLink(provider.docs_url)}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external https page from the gateway, checked by externalLink -->
		<a href={externalLink(provider.docs_url)} target="_blank" rel="noopener noreferrer"
			>Where to get this ↗</a
		>
	{/if}
</p>
<div class="btns">
	<Button
		size="md"
		disabled={busy || Object.keys(changes).length === 0 || !complete}
		onclick={() => onsave(changes)}>{busy ? 'Saving…' : 'Save'}</Button
	>
	{#if provider.configured && provider.fields.some((f) => f.set)}
		<Button variant="danger-soft" size="md" disabled={busy} onclick={onremove}>
			{provider.fields.some((f) => f.secret) ? 'Remove key' : 'Reset'}
		</Button>
	{/if}
</div>

<style>
	.fields {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.note {
		margin: 10px 0 0;
		font-size: 12px;
		line-height: 1.55;
		color: var(--muted);
	}
	.note a {
		color: var(--ink);
		font-weight: 600;
		text-decoration: none;
		margin-left: 4px;
	}
	.btns {
		display: flex;
		gap: 8px;
		margin-top: 10px;
	}
</style>
