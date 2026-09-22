import { browser } from '$app/environment';
import { anthropicProvider } from './providers/anthropic';
import { xaiProvider } from './providers/xai';
import type { Provider, ProviderId } from './providers/types';

export const PROVIDERS: Provider[] = [xaiProvider, anthropicProvider];

export const providerById = (id: ProviderId): Provider =>
	PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];

const KEY = 'ldk-server-manager:assistant';

interface Stored {
	provider: ProviderId;
	model: string;
	/** Credential per provider, so switching back does not lose the other one. */
	tokens: Partial<Record<ProviderId, string>>;
}

function load(): Stored {
	const fallback: Stored = { provider: 'xai', model: xaiProvider.defaultModel, tokens: {} };
	if (!browser) return fallback;
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return fallback;
		const p = JSON.parse(raw) as Partial<Stored>;
		const provider = p.provider === 'anthropic' || p.provider === 'xai' ? p.provider : 'xai';
		return {
			provider,
			model: typeof p.model === 'string' ? p.model : providerById(provider).defaultModel,
			tokens: typeof p.tokens === 'object' && p.tokens !== null ? p.tokens : {}
		};
	} catch {
		return fallback;
	}
}

/**
 * Assistant provider, model and credentials. Everything lives in this browser only;
 * tokens are never sent anywhere except to the provider the operator picked.
 */
class AssistantConfig {
	providerId = $state<ProviderId>('xai');
	model = $state<string>(xaiProvider.defaultModel);
	private tokens = $state<Partial<Record<ProviderId, string>>>({});

	constructor() {
		const s = load();
		this.providerId = s.provider;
		this.model = s.model;
		this.tokens = s.tokens;
	}

	get provider(): Provider {
		return providerById(this.providerId);
	}

	/** Credential for the active provider, or '' when none is set. */
	get token(): string {
		return this.tokens[this.providerId] ?? '';
	}

	get isReady(): boolean {
		return this.token.length > 0;
	}

	setProvider(id: ProviderId) {
		this.providerId = id;
		// Keep the chosen model valid for the new provider.
		if (!this.provider.models.includes(this.model)) this.model = this.provider.defaultModel;
		this.persist();
	}

	setModel(model: string) {
		this.model = model;
		this.persist();
	}

	setToken(value: string) {
		this.tokens = { ...this.tokens, [this.providerId]: value.trim() };
		this.persist();
	}

	clearToken() {
		const next = { ...this.tokens };
		delete next[this.providerId];
		this.tokens = next;
		this.persist();
	}

	private persist() {
		if (!browser) return;
		try {
			const out: Stored = { provider: this.providerId, model: this.model, tokens: this.tokens };
			localStorage.setItem(KEY, JSON.stringify(out));
		} catch {
			/* storage unavailable; keep in memory for this session */
		}
	}
}

export const assistantConfig = new AssistantConfig();
