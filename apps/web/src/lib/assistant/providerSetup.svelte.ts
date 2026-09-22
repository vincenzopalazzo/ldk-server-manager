import { Resource } from '$lib/state/resource.svelte';
import { assistantConfig } from './config.svelte';
import {
	listProviders,
	signIn,
	submitSignInCallback,
	type GatewayProvider,
	type SignInEvent
} from './gatewayProviders';
import { gatewayHealth } from './gateway.svelte';

/** The gateway's provider catalog, fetched while the provider panel is open. */
export const gatewayCatalog = new Resource<GatewayProvider[]>(() =>
	listProviders(assistantConfig.hostFor('goose'))
);

export type SignInStage =
	| { kind: 'idle' }
	| { kind: 'starting' }
	/** goose is waiting for the operator to enter a code on the provider's site. */
	| {
			kind: 'code';
			code: string;
			uri: string;
			expiresAt: number | null;
			/** The redirect sign-in did not finish and the provider offered a code instead. */
			fallback: boolean;
	  }
	/** goose wants a sign-in page opened; the redirect may need pasting back. */
	| { kind: 'page'; url: string; submitting: boolean; submitted: boolean; problem: string | null }
	/** goose opened a browser on the gateway's own machine (a native gateway). */
	| { kind: 'elsewhere' }
	| { kind: 'done' }
	| { kind: 'failed'; message: string };

/** How long to wait for a code or page before assuming goose opened a local browser. */
const ELSEWHERE_AFTER_MS = 4000;

/**
 * One subscription sign-in at a time, driven through the gateway. Closing the panel or
 * pressing cancel aborts it, which also stops it on the gateway.
 */
class SignInFlow {
	provider = $state<string | null>(null);
	stage = $state<SignInStage>({ kind: 'idle' });
	private abort: AbortController | null = null;
	private elsewhereTimer: ReturnType<typeof setTimeout> | null = null;

	get running(): boolean {
		return ['starting', 'code', 'page', 'elsewhere'].includes(this.stage.kind);
	}

	async start(p: GatewayProvider, onDone: (p: GatewayProvider) => void) {
		this.cancel();
		const abort = new AbortController();
		this.abort = abort;
		this.provider = p.id;
		this.stage = { kind: 'starting' };
		this.elsewhereTimer = setTimeout(() => {
			if (this.abort === abort && this.stage.kind === 'starting') {
				this.stage = { kind: 'elsewhere' };
			}
		}, ELSEWHERE_AFTER_MS);

		try {
			const last = await signIn(
				assistantConfig.hostFor('goose'),
				p.id,
				(event) => {
					if (this.abort === abort) this.apply(event);
				},
				abort.signal
			);
			if (this.abort !== abort) return;
			if (last.type === 'done') onDone(last.provider);
		} catch (e) {
			if (this.abort !== abort || abort.signal.aborted) return;
			this.stage = { kind: 'failed', message: e instanceof Error ? e.message : String(e) };
		} finally {
			if (this.abort === abort) {
				this.abort = null;
				this.clearTimer();
			}
		}
	}

	private apply(event: SignInEvent) {
		switch (event.type) {
			case 'device_code':
				this.clearTimer();
				this.stage = {
					kind: 'code',
					code: event.user_code,
					uri: event.verification_uri,
					expiresAt: event.expires_in > 0 ? Date.now() + event.expires_in * 1000 : null,
					fallback: this.stage.kind === 'page'
				};
				break;
			case 'open_url':
				this.clearTimer();
				this.stage = {
					kind: 'page',
					url: event.url,
					submitting: false,
					submitted: false,
					problem: null
				};
				break;
			case 'done':
				this.stage = { kind: 'done' };
				void gatewayHealth.refresh();
				break;
			case 'error':
				this.stage = { kind: 'failed', message: event.message };
				break;
		}
	}

	/** Deliver the address the redirect landed on. The stream reports the outcome. */
	async submitRedirect(address: string) {
		const s = this.stage;
		if (s.kind !== 'page' || !this.provider) return;
		this.stage = { ...s, submitting: true, problem: null };
		try {
			await submitSignInCallback(assistantConfig.hostFor('goose'), this.provider, address);
			if (this.stage.kind === 'page') {
				this.stage = { ...this.stage, submitting: false, submitted: true };
			}
		} catch (e) {
			if (this.stage.kind === 'page') {
				this.stage = {
					...this.stage,
					submitting: false,
					problem: e instanceof Error ? e.message : String(e)
				};
			}
		}
	}

	cancel() {
		this.abort?.abort();
		this.abort = null;
		this.clearTimer();
		this.provider = null;
		this.stage = { kind: 'idle' };
	}

	private clearTimer() {
		if (this.elsewhereTimer) clearTimeout(this.elsewhereTimer);
		this.elsewhereTimer = null;
	}
}

export const signInFlow = new SignInFlow();
