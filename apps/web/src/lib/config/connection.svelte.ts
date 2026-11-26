import { browser } from '$app/environment';
import { macaroonTextError } from './macaroon-file';

/** Connection settings for one ldk-server instance (via a gRPC-Web bridge). */
export interface ConnectionSettings {
	/** Base URL of the gRPC-Web endpoint, e.g. https://node.example:8080 */
	url: string;
	/** Hex-encoded reusable v2 macaroon. A request-bound copy is sent on each call. */
	macaroon: string;
}

const STORAGE_KEY = 'ldk-server-manager:connection';

function load(): ConnectionSettings | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<ConnectionSettings>;
		// An old HMAC apiKey cannot authenticate to a macaroon server. Drop it so the
		// operator pastes admin.macaroon instead of sending a key the node will reject.
		if (typeof parsed.url !== 'string' || typeof parsed.macaroon !== 'string') return null;
		return { url: parsed.url, macaroon: parsed.macaroon };
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
	if (!/^https?:\/\//i.test(settings.url.trim()))
		return 'Server URL must start with http:// or https://';
	if (!settings.macaroon.trim()) return 'Macaroon is required';
	return macaroonTextError(settings.macaroon);
}

/** Where the current connection came from. */
export type ConnectionSource = 'saved' | 'bundle';

class ConnectionStore {
	settings = $state<ConnectionSettings | null>(load());
	source = $state<ConnectionSource | null>(this.settings ? 'saved' : null);
	/**
	 * False until the startup check for a self-hosted bundle has finished, so the connect
	 * screen does not flash before the bundle connects the app.
	 */
	ready = $state(this.settings !== null);

	get isConfigured(): boolean {
		return this.settings !== null;
	}

	/** Bumped by every save or disconnect, so a bundle probe can tell it has been overtaken. */
	private changes = 0;

	save(settings: ConnectionSettings) {
		const clean = {
			url: settings.url.trim().replace(/\/+$/, ''),
			macaroon: settings.macaroon.trim()
		};
		this.settings = clean;
		this.source = 'saved';
		this.changes++;
		persist(clean);
	}

	/**
	 * Start looking for the bundle serving this page. Returns the function that applies what
	 * it finds: it connects only if the page had no connection of its own when the probe
	 * started and the operator has not saved or disconnected since, so a slow probe can never
	 * undo a Disconnect. The bundle's connection stays in memory: it is read again on every
	 * load.
	 */
	beginBundleProbe(): (settings: ConnectionSettings) => void {
		const startedAt = this.changes;
		const hadOwn = this.source === 'saved';
		return (settings) => {
			if (hadOwn || this.changes !== startedAt) return;
			this.settings = settings;
			this.source = 'bundle';
		};
	}

	markReady() {
		this.ready = true;
	}

	clear() {
		this.settings = null;
		this.source = null;
		this.changes++;
		persist(null);
	}
}

export const connection = new ConnectionStore();
