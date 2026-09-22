<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Button, Input, Spinner } from '@ldk-server-manager/ui';
	import {
		checkRedirectAddress,
		externalLink,
		type GatewayProvider
	} from '$lib/assistant/gatewayProviders';
	import { signInFlow } from '$lib/assistant/providerSetup.svelte';
	import { showToast } from '$lib/state/toast.svelte';

	interface Props {
		provider: GatewayProvider;
		onsignedin: (p: GatewayProvider) => void;
		onsignout: () => void;
	}
	let { provider, onsignedin, onsignout }: Props = $props();

	let address = $state('');
	let now = $state(Date.now());
	const ticker = setInterval(() => (now = Date.now()), 1000);
	onDestroy(() => clearInterval(ticker));

	const mine = $derived(signInFlow.provider === provider.id);
	const stage = $derived(mine ? signInFlow.stage : { kind: 'idle' as const });
	const addressProblem = $derived(address.trim() ? checkRedirectAddress(address) : null);

	function hostOf(url: string): string {
		try {
			return new URL(url).host;
		} catch {
			return url;
		}
	}

	function remaining(at: number): string {
		const s = Math.max(0, Math.round((at - now) / 1000));
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	}

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			showToast('Code copied');
		} catch {
			/* clipboard blocked; the code is on screen */
		}
	}

	function start() {
		address = '';
		void signInFlow.start(provider, onsignedin);
	}
</script>

{#if stage.kind === 'idle' || stage.kind === 'done'}
	{#if provider.configured}
		<p class="note">
			Signed in. goose keeps the sign-in on the gateway’s machine and renews it by itself.
		</p>
		<div class="btns">
			<Button variant="outline" size="md" onclick={start}>Sign in again</Button>
			<Button variant="danger-soft" size="md" onclick={onsignout}>Sign out</Button>
		</div>
	{:else}
		<p class="note">
			Sign in with your {provider.name} account. goose keeps the sign-in on the gateway’s machine and
			renews it; nothing is stored in this browser.
		</p>
		<div class="btns"><Button size="md" onclick={start}>Sign in</Button></div>
	{/if}
{:else if stage.kind === 'starting'}
	<div class="wait"><Spinner size={18} /><span>Starting the sign-in…</span></div>
	<div class="btns">
		<Button variant="outline" size="md" onclick={() => signInFlow.cancel()}>Cancel</Button>
	</div>
{:else if stage.kind === 'code'}
	{#if stage.fallback}
		<p class="note">The sign-in page did not finish, so {provider.name} offered a code instead.</p>
	{/if}
	<p class="note">Enter this code at <b>{hostOf(stage.uri)}</b> to approve goose:</p>
	<div class="code">
		<span class="codetext">{stage.code}</span>
		<Button variant="outline" size="sm" onclick={() => copy(stage.code)}>Copy</Button>
	</div>
	<div class="btns">
		{#if externalLink(stage.uri)}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external https page from the gateway, checked by externalLink -->
			<a class="linkbtn" href={externalLink(stage.uri)} target="_blank" rel="noopener noreferrer"
				>Open {hostOf(stage.uri)} ↗</a
			>
		{/if}
		<Button variant="outline" size="md" onclick={() => signInFlow.cancel()}>Cancel</Button>
	</div>
	<div class="wait small">
		<Spinner size={14} />
		<span>
			Waiting for approval{stage.expiresAt
				? ` · code expires in ${remaining(stage.expiresAt)}`
				: ''}
		</span>
	</div>
{:else if stage.kind === 'page'}
	<ol class="steps">
		<li>
			{#if externalLink(stage.url)}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external https page from the gateway, checked by externalLink -->
				<a class="linkbtn" href={externalLink(stage.url)} target="_blank" rel="noopener noreferrer"
					>Open the {hostOf(stage.url)} sign-in page ↗</a
				>
			{:else}
				<span class="problem">The gateway sent a sign-in address this page will not open.</span>
			{/if}
		</li>
		<li>
			After you sign in, the browser goes to an address starting with
			<code>http://127.0.0.1</code> or <code>http://localhost</code>. If that page does not load,
			copy its whole address and paste it here:
			<div class="paste">
				<Input
					bind:value={address}
					mono
					size="sm"
					placeholder="http://127.0.0.1:…/callback?code=…"
					disabled={stage.submitting || stage.submitted}
				/>
				<Button
					variant="dark"
					size="md"
					disabled={!address.trim() ||
						addressProblem !== null ||
						stage.submitting ||
						stage.submitted}
					onclick={() => signInFlow.submitRedirect(address)}>Continue</Button
				>
			</div>
			{#if addressProblem}<div class="problem">{addressProblem}</div>{/if}
			{#if stage.problem}<div class="problem">{stage.problem}</div>{/if}
		</li>
	</ol>
	{#if stage.submitted || stage.submitting}
		<div class="wait small"><Spinner size={14} /><span>Finishing the sign-in…</span></div>
	{:else}
		<div class="wait small">
			<Spinner size={14} /><span>Waiting for you to sign in (up to 5 minutes)</span>
		</div>
	{/if}
	<div class="btns">
		<Button variant="outline" size="md" onclick={() => signInFlow.cancel()}>Cancel</Button>
	</div>
{:else if stage.kind === 'elsewhere'}
	<div class="wait">
		<Spinner size={18} />
		<span>
			A sign-in page opened in a browser on the gateway’s machine. Finish there; this updates by
			itself.
		</span>
	</div>
	<div class="btns">
		<Button variant="outline" size="md" onclick={() => signInFlow.cancel()}>Cancel</Button>
	</div>
{:else if stage.kind === 'failed'}
	<div class="problem box">{stage.message}</div>
	<div class="btns">
		<Button size="md" onclick={start}>Try again</Button>
		<Button variant="outline" size="md" onclick={() => signInFlow.cancel()}>Close</Button>
	</div>
{/if}

<style>
	.note {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.55;
		color: var(--muted);
	}
	.note b {
		color: var(--ink);
		font-weight: 600;
	}
	.btns {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 10px;
	}
	.wait {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 12.5px;
		color: var(--muted);
		line-height: 1.5;
	}
	.wait.small {
		margin-top: 10px;
		font-size: 12px;
	}
	.code {
		margin-top: 10px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--bg);
		border: 1px dashed var(--border);
		border-radius: 10px;
		padding: 12px 14px;
	}
	.codetext {
		font-family: var(--font-mono);
		font-size: 22px;
		font-weight: 600;
		letter-spacing: 0.12em;
		color: var(--ink);
	}
	.linkbtn {
		display: inline-flex;
		align-items: center;
		font-size: 12.5px;
		font-weight: 600;
		padding: 8px 16px;
		border-radius: 8px;
		background: var(--acc);
		color: #161613;
		text-decoration: none;
	}
	.steps {
		margin: 0;
		padding-left: 18px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		font-size: 12.5px;
		line-height: 1.55;
		color: var(--muted);
	}
	.steps code {
		font-family: var(--font-mono);
		font-size: 11.5px;
		color: var(--ink);
	}
	.paste {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}
	.problem {
		margin-top: 6px;
		font-size: 12px;
		color: var(--red);
		line-height: 1.5;
	}
	.problem.box {
		margin-top: 0;
		background: var(--redbg);
		border-radius: 8px;
		padding: 10px 12px;
		word-break: break-word;
	}
</style>
