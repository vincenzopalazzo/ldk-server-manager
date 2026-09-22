import { declineAll, execute, run, type ChatMessage, type Resolved } from './agent';
import { assistantConfig } from './config.svelte';
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
		try {
			const step = await run({
				provider: assistantConfig.provider,
				token: assistantConfig.token,
				model: assistantConfig.model,
				host: assistantConfig.host,
				history: this.messages,
				resolved
			});
			if (step.kind === 'done') {
				this.say(step.text);
				this.refreshAffected();
			} else {
				this.pending = {
					calls: step.calls,
					lines: step.calls.map((c) => describeCall(c.name, c.input)),
					resolved: step.resolved
				};
			}
		} catch (e) {
			this.say(
				e instanceof ProviderAuthError
					? e.message
					: `Something went wrong talking to ${assistantConfig.provider.label}: ${describeError(e)}`
			);
		} finally {
			if (manageBusy) this.busy = false;
		}
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
