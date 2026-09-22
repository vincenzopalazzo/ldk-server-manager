import { browser } from '$app/environment';

/** Connection settings for one ldk-server instance (via a gRPC-Web bridge). */
export interface ConnectionSettings {
	/** Base URL of the gRPC-Web endpoint, e.g. https://node.example:8080 */
	url: string;
	/** ldk-server API key used to HMAC-sign every request. */
	apiKey: string;
}

const STORAGE_KEY = 'ldk-server-manager:connection';

function load(): ConnectionSettings | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<ConnectionSettings>;
		if (typeof parsed.url !== 'string' || typeof parsed.apiKey !== 'string') return null;
		return { url: parsed.url, apiKey: parsed.apiKey };
	} catch {
		return null;
	}
}

function persist(settings: ConnectionSettings | null) {
	if (!browser) return;
	try {
		if (settings) localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		/* storage unavailable (private mode, quota) - keep in-memory only */
	}
}

/** Validate user-supplied connection settings. Returns an error message or null. */
export function validateConnection(settings: ConnectionSettings): string | null {
	if (!settings.url.trim()) return 'Server URL is required';
	if (!URL.canParse(settings.url)) return 'Server URL is not a valid URL';
	if (!/^https?:\/\//i.test(settings.url.trim())) return 'Server URL must start with http:// or https://';
	if (!settings.apiKey.trim()) return 'API key is required';
	return null;
}

class ConnectionStore {
	settings = $state<ConnectionSettings | null>(load());

	get isConfigured(): boolean {
		return this.settings !== null;
	}

	save(settings: ConnectionSettings) {
		const clean = { url: settings.url.trim().replace(/\/+$/, ''), apiKey: settings.apiKey.trim() };
		this.settings = clean;
		persist(clean);
	}

	clear() {
		this.settings = null;
		persist(null);
	}
}

export const connection = new ConnectionStore();
