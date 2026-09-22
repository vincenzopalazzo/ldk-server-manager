import { browser } from '$app/environment';

const KEY = 'ldk-server-manager:anthropic-key';

/** Optional Anthropic API key for the assistant drawer. Stored only in this browser. */
class AssistantKey {
	value = $state<string>(browser ? (localStorage.getItem(KEY) ?? '') : '');

	set(v: string) {
		this.value = v.trim();
		if (!browser) return;
		try {
			if (this.value) localStorage.setItem(KEY, this.value);
			else localStorage.removeItem(KEY);
		} catch {
			/* ignore */
		}
	}
}

export const assistantKey = new AssistantKey();
