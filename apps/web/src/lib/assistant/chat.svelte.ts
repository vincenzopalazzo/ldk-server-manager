import { declineAll, execute, run, type ChatMessage, type Resolved } from './agent';
import { assistantConfig } from './config.svelte';
import { gatewayHealth } from './gateway.svelte';
import { describeCall } from './tools';
import { ProviderAuthError, type ToolCall } from './providers/types';
import { describeError } from '$lib/state/resource.svelte';
import { balances, channels } from '$lib/state/node.svelte';
import { payments } from '$lib/state/payments.svelte';

const GREETING: ChatMessage = {
	role: 'ai',
	text: 'Hi — I\'m your node assistant. I can analyze this LDK Server instance and run operations for you: create invoices, pay, open channels, check liquidity. Anything that moves funds I\'ll show you first. Try "how is my node doing?"'
};

/** A tool call waiting on the operator. */
export interface PendingApproval {
	calls: ToolCall[];
	lines: string[];
	resolved: Resolved[];
}

class Chat {
	messages = $state<ChatMessage[]>([GREETING]);
	busy = $state(false);
	pending = $state<PendingApproval | null>(null);
	/** True once reply text has started streaming in this pass; hides "thinking…". */
	streaming = $state(false);
	/** The message being streamed into, if any. */
	private live: ChatMessage | null = null;

	async send(text: string) {
		const t = text.trim();
		if (!t || this.busy || this.pending) return;
		this.messages = [...this.messages, { role: 'user', text: t }];

		if (!assistantConfig.isReady) {
			this.say(
				`Add a ${assistantConfig.provider.label} token below to enable the assistant. It stays in this browser.`
			);
			return;
		}
		await this.drive([]);
	}

	/** Operator approved the pending calls. */
	async approve() {
		const p = this.pending;
		if (!p || this.busy) return;
		this.pending = null;
		this.busy = true;
		try {
			const ran = await execute(p.calls);
			for (const r of ran) this.say(r.result.output);
			this.refreshAffected();
			await this.drive([...p.resolved, ...ran], false);
		} catch (e) {
			this.say(`Something went wrong running that: ${describeError(e)}`);
		} finally {
			this.busy = false;
		}
	}

	/** Operator declined; tell the model so it can carry on. */
	async reject() {
		const p = this.pending;
		if (!p || this.busy) return;
		this.pending = null;
		await this.drive([...p.resolved, ...declineAll(p.calls)]);
	}

	clear() {
		this.messages = [GREETING];
		this.pending = null;
	}

	private async drive(resolved: Resolved[], manageBusy = true) {
		if (manageBusy) this.busy = true;
		// Whether the final answer already sits in a streamed message, so it is not said twice.
		let answeredLive = false;
		try {
			const step = await run({
				provider: assistantConfig.provider,
				token: assistantConfig.token,
				model: assistantConfig.model,
				host: assistantConfig.host,
				history: this.messages,
				resolved,
				onText: (delta) => this.streamText(delta),
				onPassEnd: (result) => {
					// Text streamed before a tool call stays as its own message ("Let me check…").
					answeredLive = this.endStream(result.text) && result.calls.length === 0;
					// Tools run next: bring "thinking…" back while they do. A final answer keeps
					// it hidden until the turn ends, so it cannot flash after the text.
					if (result.calls.length > 0) this.streaming = false;
				}
			});
			if (step.kind === 'done') {
				if (!answeredLive) this.say(step.text);
				this.refreshAffected();
			} else {
				this.pending = {
					calls: step.calls,
					lines: step.calls.map((c) => describeCall(c.name, c.input)),
					resolved: step.resolved
				};
			}
		} catch (e) {
			// A failed turn is the freshest signal there is; update the status right away
			// rather than waiting for the next poll.
			if (assistantConfig.provider.tokenOptional) void gatewayHealth.refresh();
			this.say(
				e instanceof ProviderAuthError
					? e.message
					: `Something went wrong talking to ${assistantConfig.provider.label}: ${describeError(e)}`
			);
		} finally {
			// A failed stream keeps whatever text had arrived; the error follows it.
			this.endStream();
			this.streaming = false;
			if (manageBusy) this.busy = false;
		}
	}

	private streamText(delta: string) {
		if (!this.live) {
			this.messages = [...this.messages, { role: 'ai', text: '' }];
			this.live = this.messages[this.messages.length - 1];
			this.streaming = true;
		}
		this.live.text += delta;
	}

	/**
	 * Close the streamed message, settling it on `finalText` when given (the provider's
	 * trimmed reply). An empty one is removed. Returns whether a non-empty message remains.
	 */
	private endStream(finalText?: string): boolean {
		const live = this.live;
		this.live = null;
		if (!live) return false;
		const text = (finalText ?? live.text).trim();
		if (text) {
			live.text = text;
			return true;
		}
		this.messages = this.messages.filter((m) => m !== live);
		return false;
	}

	private say(text: string) {
		this.messages = [...this.messages, { role: 'ai', text }];
	}

	/** A tool may have changed node state; pull the views it touches. */
	private refreshAffected() {
		void balances.refresh();
		void channels.refresh();
		void payments.refresh();
	}
}

export const chat = new Chat();
