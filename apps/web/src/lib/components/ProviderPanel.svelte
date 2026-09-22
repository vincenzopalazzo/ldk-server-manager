<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { Button, Dot, Input, Modal, Pill, Spinner } from '@ldk-server-manager/ui';
	import { assistantConfig, providerById } from '$lib/assistant/config.svelte';
	import { gatewayHealth, watchGateway } from '$lib/assistant/gateway.svelte';
	import { describeGateway } from '$lib/assistant/gatewayStatus';
	import {
		externalLink,
		groupProviders,
		providerKind,
		removeProvider,
		saveProvider,
		type GatewayProvider
	} from '$lib/assistant/gatewayProviders';
	import { gatewayCatalog, signInFlow } from '$lib/assistant/providerSetup.svelte';
	import { GOOSE_GATEWAY_HOST } from '$lib/assistant/providers/goose';
	import type { ProviderId } from '$lib/assistant/providers/types';
	import { showToast } from '$lib/state/toast.svelte';
	import { ui } from '$lib/state/ui.svelte';
	import ProviderFields from './ProviderFields.svelte';
	import ProviderSignIn from './ProviderSignIn.svelte';

	/** Providers the page talks to itself, with a key kept in this browser. */
	const DIRECT: { id: ProviderId; hint: string; placeholder: string }[] = [
		{ id: 'xai', hint: 'Straight to api.x.ai with an xAI API key.', placeholder: 'xai-…' },
		{
			id: 'anthropic',
			hint: 'Straight to the Anthropic API with an API key.',
			placeholder: 'sk-ant-…'
		}
	];

	let expanded = $state<string | null>(null);
	let showMore = $state(false);
	let busy = $state<string | null>(null);
	let hostInput = $state(assistantConfig.hostFor('goose'));
	let keyInputs = $state<Record<string, string>>({ xai: '', anthropic: '' });

	const catalog = $derived(gatewayCatalog.data ?? []);
	const groups = $derived(groupProviders(catalog));
	const sections = $derived(
		[
			{ title: 'Subscriptions', items: groups.subscriptions },
			{ title: 'API keys', items: groups.keys },
			{ title: 'Local models', items: groups.local }
		].filter((s) => s.items.length > 0)
	);
	/** The gateway itself: it is online whenever it answers, set up or not. */
	const gatewayView = $derived(
		gatewayHealth.data?.state === 'no-credential'
			? describeGateway({ ...gatewayHealth.data, state: 'online' })
			: describeGateway(gatewayHealth.data)
	);
	const selectedGoose = $derived(
		assistantConfig.providerId === 'goose' ? assistantConfig.gooseProvider.id : null
	);
	const selectedEntry = $derived(catalog.find((p) => p.id === selectedGoose));
	const models = $derived(
		assistantConfig.providerId === 'goose'
			? (selectedEntry?.models ?? [])
			: [...assistantConfig.provider.models]
	);

	// Keep the list and the gateway status fresh while the panel is open.
	$effect(() => {
		void assistantConfig.hostFor('goose');
		untrack(() => void gatewayCatalog.refresh());
	});
	$effect(() => untrack(() => watchGateway()));
	onDestroy(() => signInFlow.cancel());

	function close() {
		ui.providerPanelOpen = false;
	}

	function useGoose(p: GatewayProvider) {
		assistantConfig.useGooseProvider(p, p.default_model);
		void gatewayHealth.refresh();
	}

	function clickRow(p: GatewayProvider) {
		if (p.configured) useGoose(p);
		expanded = expanded === p.id ? (p.configured ? p.id : null) : p.id;
	}

	/** Swap an entry in the list without refetching everything. */
	function replace(updated: GatewayProvider) {
		gatewayCatalog.data = catalog.map((p) => (p.id === updated.id ? updated : p));
	}

	async function save(p: GatewayProvider, fields: Record<string, string>) {
		busy = p.id;
		try {
			const updated = await saveProvider(assistantConfig.hostFor('goose'), p.id, fields);
			replace(updated);
			if (updated.configured) {
				useGoose(updated);
				showToast(`${updated.name} is ready`);
			}
		} catch (e) {
			showToast(e instanceof Error ? e.message : String(e));
		} finally {
			busy = null;
		}
	}

	async function remove(p: GatewayProvider) {
		busy = p.id;
		try {
			replace(await removeProvider(assistantConfig.hostFor('goose'), p.id));
			void gatewayHealth.refresh();
			showToast(
				p.sign_in
					? `Signed out of ${p.name}`
					: p.fields.some((f) => f.secret)
						? `${p.name} key removed`
						: `${p.name} settings reset`
			);
		} catch (e) {
			showToast(e instanceof Error ? e.message : String(e));
		} finally {
			busy = null;
		}
	}

	function signedIn(p: GatewayProvider) {
		replace(p);
		useGoose(p);
		showToast(`Signed in to ${p.name}`);
	}

	function saveHost() {
		assistantConfig.setHostFor('goose', hostInput);
		hostInput = assistantConfig.hostFor('goose');
		void gatewayHealth.refresh();
	}

	function clickDirect(id: ProviderId) {
		if (assistantConfig.tokenFor(id)) assistantConfig.setProvider(id);
		expanded = expanded === id ? null : id;
	}

	function saveKey(id: ProviderId) {
		assistantConfig.setTokenFor(id, keyInputs[id]);
		keyInputs[id] = '';
		assistantConfig.setProvider(id);
		showToast(`${providerById(id).label} key saved in this browser`);
	}

	function forgetKey(id: ProviderId) {
		assistantConfig.setTokenFor(id, '');
		if (assistantConfig.providerId === id) {
			assistantConfig.useGooseProvider(assistantConfig.gooseProvider, '');
		}
		showToast(`${providerById(id).label} key removed`);
	}

	function status(p: GatewayProvider): { tone: 'green' | 'muted'; text: string } {
		if (p.configured) return { tone: 'green', text: p.sign_in ? 'signed in' : 'ready' };
		const kind = providerKind(p);
		return {
			tone: 'muted',
			text:
				kind === 'subscription'
					? 'sign in'
					: kind === 'key'
						? 'add key'
						: kind === 'host'
							? 'on host'
							: 'set up'
		};
	}
</script>

{#snippet row(p: GatewayProvider)}
	{@const s = status(p)}
	{@const selected = selectedGoose === p.id}
	<div class="item" class:selected class:open={expanded === p.id}>
		<button class="head" onclick={() => clickRow(p)} aria-expanded={expanded === p.id}>
			<span class="radio" class:on={selected} aria-hidden="true"></span>
			<span class="names">
				<span class="name">{p.name}</span>
				<span class="desc">{p.description}</span>
			</span>
			<Pill tone={s.tone} tiny>{s.text}</Pill>
		</button>
		{#if expanded === p.id}
			<div class="body">
				{#if providerKind(p) === 'subscription'}
					<ProviderSignIn provider={p} onsignedin={signedIn} onsignout={() => remove(p)} />
				{:else if providerKind(p) === 'host'}
					<p class="note">
						{p.name} needs credentials this page cannot provide. Set it up on the gateway’s machine with
						<code>goose configure</code>, then reopen this panel.
						{#if externalLink(p.docs_url)}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external https page from the gateway, checked by externalLink -->
							<a href={externalLink(p.docs_url)} target="_blank" rel="noopener noreferrer">Docs ↗</a
							>
						{/if}
					</p>
				{:else}
					{#key p}
						<ProviderFields
							provider={p}
							busy={busy === p.id}
							onsave={(fields) => save(p, fields)}
							onremove={() => remove(p)}
						/>
					{/key}
				{/if}
			</div>
		{/if}
	</div>
{/snippet}

<Modal title="Assistant provider" width={580} scroll z={70} onclose={close}>
	<p class="lede">
		Choose who answers the assistant. Through goose-gateway, goose holds the sign-in or key on your
		machine and nothing secret stays in this browser.
	</p>

	<div class="cap">
		<span>goose-gateway</span>
		<span class="gw"><Dot color={gatewayView.dot} size={7} /> {gatewayView.text}</span>
	</div>
	<div class="hostrow">
		<Input bind:value={hostInput} mono size="sm" placeholder={GOOSE_GATEWAY_HOST} />
		<Button
			variant="outline"
			size="md"
			disabled={hostInput.trim() === assistantConfig.hostFor('goose')}
			onclick={saveHost}>Save</Button
		>
	</div>

	{#if gatewayCatalog.error && !gatewayCatalog.data}
		<div class="down">
			<b>Can’t reach goose-gateway.</b>
			{gatewayCatalog.error} Start it from this repository with <code>docker compose up -d</code>,
			or fix the address above.
			<div class="btns">
				<Button variant="outline" size="md" onclick={() => gatewayCatalog.refresh()}>Retry</Button>
			</div>
		</div>
	{:else if !gatewayCatalog.data}
		<div class="loading"><Spinner size={18} /> Loading goose’s providers…</div>
	{:else}
		{#each sections as section (section.title)}
			<div class="sub">{section.title}</div>
			<div class="list">
				{#each section.items as p (p.id)}{@render row(p)}{/each}
			</div>
		{/each}
		{#if groups.more.length > 0}
			<button class="more" onclick={() => (showMore = !showMore)} aria-expanded={showMore}>
				{showMore ? '▾' : '▸'} More providers ({groups.more.length})
			</button>
			{#if showMore}
				<div class="list">
					{#each groups.more as p (p.id)}{@render row(p)}{/each}
				</div>
			{/if}
		{/if}
	{/if}

	<div class="cap"><span>Directly from this browser</span></div>
	<div class="list">
		{#each DIRECT as d (d.id)}
			{@const saved = assistantConfig.tokenFor(d.id) !== ''}
			{@const selected = assistantConfig.providerId === d.id}
			<div class="item" class:selected class:open={expanded === d.id}>
				<button class="head" onclick={() => clickDirect(d.id)} aria-expanded={expanded === d.id}>
					<span class="radio" class:on={selected} aria-hidden="true"></span>
					<span class="names">
						<span class="name">{providerById(d.id).label}</span>
						<span class="desc">{d.hint}</span>
					</span>
					<Pill tone={saved ? 'green' : 'muted'} tiny>{saved ? 'key saved' : 'add key'}</Pill>
				</button>
				{#if expanded === d.id}
					<div class="body">
						<div class="hostrow">
							<Input
								bind:value={keyInputs[d.id]}
								mono
								size="sm"
								type="password"
								autocomplete="off"
								placeholder={saved ? 'saved · enter a new one to replace it' : d.placeholder}
							/>
							<Button size="md" disabled={!keyInputs[d.id].trim()} onclick={() => saveKey(d.id)}
								>Save</Button
							>
							{#if saved}
								<Button variant="danger-soft" size="md" onclick={() => forgetKey(d.id)}
									>Forget</Button
								>
							{/if}
						</div>
						<p class="note">
							Kept in this browser only and sent straight to the provider. {providerById(d.id)
								.credentialHint}
						</p>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<div class="cap"><span>Model · {assistantConfig.label}</span></div>
	{#if models.length > 0}
		<select
			class="model"
			value={assistantConfig.model}
			onchange={(e) => assistantConfig.setModel(e.currentTarget.value)}
		>
			{#if assistantConfig.model && !models.includes(assistantConfig.model)}
				<option value={assistantConfig.model}>{assistantConfig.model}</option>
			{/if}
			{#if !assistantConfig.model}<option value="">goose’s default</option>{/if}
			{#each models as m (m)}<option value={m}>{m}</option>{/each}
		</select>
	{:else}
		<Input
			value={assistantConfig.model}
			mono
			size="sm"
			placeholder={selectedEntry?.default_model || 'model name'}
			onchange={(e) => assistantConfig.setModel(e.currentTarget.value)}
		/>
	{/if}

	<div class="done"><Button variant="dark" block onclick={close}>Done</Button></div>
</Modal>

<style>
	.lede {
		margin: 8px 0 4px;
		font-size: 12.5px;
		line-height: 1.55;
		color: var(--muted);
	}
	.cap {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin: 20px 0 8px;
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.09em;
	}
	.gw {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		text-transform: none;
		letter-spacing: 0;
		font-size: 11.5px;
	}
	.sub {
		margin: 14px 0 6px;
		font-size: 12px;
		font-weight: 600;
	}
	.hostrow {
		display: flex;
		gap: 8px;
	}
	.list {
		border: 1px solid var(--line);
		border-radius: 12px;
		overflow: hidden;
	}
	.item + .item {
		border-top: 1px solid var(--line);
	}
	.item.selected {
		background: var(--soft);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 11px 14px;
		background: none;
		border: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.head:hover {
		background: var(--soft);
	}
	.radio {
		flex-shrink: 0;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 1.5px solid var(--border);
		box-sizing: border-box;
	}
	.radio.on {
		border: 4px solid var(--ink);
	}
	.names {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.name {
		font-size: 13px;
		font-weight: 600;
	}
	.desc {
		font-size: 11.5px;
		color: var(--muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.body {
		padding: 2px 14px 14px 40px;
	}
	.note {
		margin: 8px 0 0;
		font-size: 12px;
		line-height: 1.55;
		color: var(--muted);
	}
	.note a {
		color: var(--ink);
		font-weight: 600;
		text-decoration: none;
	}
	code {
		font-family: var(--font-mono);
		font-size: 11.5px;
		color: var(--ink);
	}
	.more {
		margin: 12px 0 8px;
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		color: var(--muted);
		cursor: pointer;
	}
	.down {
		margin-top: 12px;
		background: var(--redbg);
		color: var(--red);
		border-radius: 10px;
		padding: 12px 14px;
		font-size: 12.5px;
		line-height: 1.55;
	}
	.down code {
		color: inherit;
	}
	.btns {
		margin-top: 8px;
	}
	.loading {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 14px;
		font-size: 12.5px;
		color: var(--muted);
	}
	.model {
		width: 100%;
		padding: 8px 10px;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg);
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 12px;
	}
	.done {
		margin-top: 20px;
	}
</style>
