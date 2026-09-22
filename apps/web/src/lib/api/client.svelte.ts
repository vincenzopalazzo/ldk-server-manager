import { LdkServerClient } from '@ldk-server-manager/client';
import { connection } from '$lib/config/connection.svelte';

let cached: { key: string; client: LdkServerClient } | null = null;

/**
 * Returns the client for the current connection settings, or null when the app
 * is not configured yet. The client is recreated whenever settings change.
 */
export function getClient(): LdkServerClient | null {
	const s = connection.settings;
	if (!s) return null;
	const key = `${s.url}|${s.apiKey}`;
	if (!cached || cached.key !== key) {
		cached = { key, client: new LdkServerClient({ baseUrl: s.url, apiKey: s.apiKey }) };
	}
	return cached.client;
}

/** Like getClient() but throws when not configured. For use inside actions. */
export function requireClient(): LdkServerClient {
	const c = getClient();
	if (!c) throw new Error('Not connected to an ldk-server instance');
	return c;
}
