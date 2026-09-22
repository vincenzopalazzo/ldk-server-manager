import { runAssistant, type ChatMessage } from './agent';
import { assistantKey } from './key.svelte';
import { describeError } from '$lib/state/resource.svelte';

const GREETING: ChatMessage = {
	role: 'ai',
	text: 'Hi — I\'m your node assistant. I can analyze this LDK Server instance and run operations for you: create invoices, pay, open channels, check liquidity. Try "how is my node doing?"'
};

/** Assistant conversation state, kept across drawer open/close. */
class Chat {
	messages = $state<ChatMessage[]>([GREETING]);
	busy = $state(false);

	async send(text: string) {
		const t = text.trim();
		if (!t || this.busy) return;
		this.messages = [...this.messages, { role: 'user', text: t }];
		if (!assistantKey.value) {
			this.messages = [
				...this.messages,
				{
					role: 'ai',
					text: 'Add an Anthropic API key below to enable the assistant. It stays in this browser and is only used to talk to Claude.'
				}
			];
			return;
		}
		this.busy = true;
		try {
			const reply = await runAssistant(assistantKey.value, this.messages);
			this.messages = [...this.messages, { role: 'ai', text: reply || '(no reply)' }];
		} catch (e) {
			this.messages = [
				...this.messages,
				{ role: 'ai', text: 'Something went wrong talking to the AI: ' + describeError(e) }
			];
		} finally {
			this.busy = false;
		}
	}
}

export const chat = new Chat();
