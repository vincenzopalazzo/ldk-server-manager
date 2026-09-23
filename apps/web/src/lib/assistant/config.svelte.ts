import { browser } from '$app/environment';
import { anthropicProvider } from './providers/anthropic';
import { xaiProvider } from './providers/xai';
import { gooseProvider } from './providers/goose';
import type { Provider, ProviderId } from './providers/types';

export const PROVIDERS: Provider[] = [gooseProvider, xaiProvider, anthropicProvider];

export const providerById = (id: ProviderId): Provider =>
	PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];

const KEY = 'ldk-server-manager:assistant';

/** goose's own provider behind the gateway when none was chosen: the X subscription. */
export const DEFAULT_GOOSE_PROVIDER = { id: 'xai_oauth', name: 'xAI (SuperGrok Subscription)' };

interface Stored {
	provider: ProviderId;
	/** Model for each selection: `anthropic`, `xai`, or `goose:<goose provider id>`. */
	models: Record<string, string>;
	/** Which goose provider the gateway uses, and its display name for labels. */
	gooseProvider: { id: string; name: string };
	/** Credential per provider, so switching back does not lose the other one. */
	tokens: Partial<Record<ProviderId, string>>;
	/** Host override per provider (e.g. the goose gateway moved to another port). */
	hosts: Partial<Record<ProviderId, string>>;
}

function load(): Stored {
	const fallback: Stored = {
		provider: 'goose',
		models: {},
		gooseProvider: DEFAULT_GOOSE_PROVIDER,
		tokens: {},
		hosts: {}
	};
	if (!browser) return fallback;
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return fallback;
		const p = JSON.parse(raw) as Partial<Stored> & { model?: unknown };
		const known: ProviderId[] = ['goose', 'xai', 'anthropic'];
		const provider = known.includes(p.provider as ProviderId)
			? (p.provider as ProviderId)
			: 'goose';
		const gp = p.gooseProvider;
		const goose =
			gp && typeof gp.id === 'string' && typeof gp.name === 'string' ? gp : DEFAULT_GOOSE_PROVIDER;
		const models: Record<string, string> =
			typeof p.models === 'object' && p.models !== null ? { ...p.models } : {};
		// Before per-provider models there was one `model`; keep it for what was selected.
		if (typeof p.model === 'string' && Object.keys(models).length === 0) {
			models[provider === 'goose' ? `goose:${goose.id}` : provider] = p.model;
		}
		return {
			provider,
			models,
			gooseProvider: goose,
			tokens: typeof p.tokens === 'object' && p.tokens !== null ? p.tokens : {},
			hosts: typeof p.hosts === 'object' && p.hosts !== null ? p.hosts : {}
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
	providerId = $state<ProviderId>('goose');
	/** The goose provider behind the gateway (only used when `providerId` is `goose`). */
	gooseProvider = $state<{ id: string; name: string }>(DEFAULT_GOOSE_PROVIDER);
	private models = $state<Record<string, string>>({});
	private tokens = $state<Partial<Record<ProviderId, string>>>({});
	private hosts = $state<Partial<Record<ProviderId, string>>>({});

	constructor() {
		const s = load();
		this.providerId = s.provider;
		this.gooseProvider = s.gooseProvider;
		this.models = s.models;
		this.tokens = s.tokens;
		this.hosts = s.hosts;
	}

	get provider(): Provider {
		return providerById(this.providerId);
	}

	private get selectionKey(): string {
		return this.providerId === 'goose' ? `goose:${this.gooseProvider.id}` : this.providerId;
	}

	/**
	 * Model for the current selection. Empty for a goose provider picked before its model
	 * list was known, in which case the gateway uses goose's default for it.
	 */
	get model(): string {
		const chosen = this.models[this.selectionKey];
		if (chosen) return chosen;
		if (this.providerId === 'goose') {
			return this.gooseProvider.id === DEFAULT_GOOSE_PROVIDER.id ? gooseProvider.defaultModel : '';
		}
		return this.provider.defaultModel;
	}

	/** What is answering, for labels: "ChatGPT Codex via goose", "Claude (Anthropic)". */
	get label(): string {
		return this.providerId === 'goose'
			? `${this.gooseProvider.name} via goose`
			: this.provider.label;
	}

	/** For a gateway in front of several providers, which one answers. */
	get upstream(): string | undefined {
		return this.providerId === 'goose' ? this.gooseProvider.id : undefined;
	}

	/** Credential stored for a browser-direct provider, whether or not it is selected. */
	tokenFor(id: ProviderId): string {
		return this.tokens[id] ?? '';
	}

	/** Save or clear the credential for a browser-direct provider. */
	setTokenFor(id: ProviderId, value: string) {
		const next = { ...this.tokens };
		if (value.trim()) next[id] = value.trim();
		else delete next[id];
		this.tokens = next;
		this.persist();
	}

	/** Credential for the active provider, or '' when none is set. */
	get token(): string {
		return this.tokens[this.providerId] ?? '';
	}

	/** Effective host for the active provider: the override, else the provider's default. */
	get host(): string {
		return this.hostFor(this.providerId);
	}

	/** A provider whose endpoint holds the credential is ready with nothing pasted. */
	get isReady(): boolean {
		return this.provider.tokenOptional === true || this.token.length > 0;
	}

	/**
	 * The gateway the self-hosted bundle serving this page points at, if any. Used as the goose
	 * default in place of localhost; an address the operator set still wins.
	 */
	bundleGateway = $state<string | null>(null);

	private defaultHostFor(id: ProviderId): string {
		if (id === 'goose' && this.bundleGateway) return this.bundleGateway;
		return providerById(id).defaultHost || '';
	}

	/** Effective host for any provider, selected or not (the gateway, from the panel). */
	hostFor(id: ProviderId): string {
		return this.hosts[id] || this.defaultHostFor(id);
	}

	/** Override a provider's host; blank reverts to its default. */
	setHostFor(id: ProviderId, value: string) {
		const v = value.trim();
		const next = { ...this.hosts };
		if (v && v !== this.defaultHostFor(id)) next[id] = v;
		else delete next[id];
		this.hosts = next;
		this.persist();
	}

	setHost(value: string) {
		this.setHostFor(this.providerId, value);
	}

	setProvider(id: ProviderId) {
		this.providerId = id;
		this.persist();
	}

	/**
	 * Use a goose provider through the gateway. `defaultModel` seeds the model the first time
	 * it is picked; after that the operator's own choice for it is kept.
	 */
	useGooseProvider(p: { id: string; name: string }, defaultModel: string) {
		this.providerId = 'goose';
		this.gooseProvider = { id: p.id, name: p.name };
		const key = `goose:${p.id}`;
		if (!this.models[key] && defaultModel) this.models = { ...this.models, [key]: defaultModel };
		this.persist();
	}

	setModel(model: string) {
		this.models = { ...this.models, [this.selectionKey]: model.trim() };
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
			const out: Stored = {
				provider: this.providerId,
				models: this.models,
				gooseProvider: this.gooseProvider,
				tokens: this.tokens,
				hosts: this.hosts
			};
			localStorage.setItem(KEY, JSON.stringify(out));
		} catch {
			/* storage unavailable; keep in memory for this session */
		}
	}
}

export const assistantConfig = new AssistantConfig();
