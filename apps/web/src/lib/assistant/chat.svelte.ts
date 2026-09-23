import { declineAll, execute, run, type ChatMessage, type Resolved } from './agent';
import { assistantConfig } from './config.svelte';
import { gatewayHealth } from './gateway.svelte';
import { drivesNode, nodeToolsFor } from './nodeTools';
import { builtinTools, type ToolSet } from './tools';
import { ProviderAuthError, type ToolCall } from './providers/types';
import { describeError } from '$lib/state/resource.svelte';
import { requireClient } from '$lib/api/client.svelte';
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
	/** The set the calls came from, so approving runs them the same way. */
	tools: ToolSet;
	/** The node the dashboard was connected to when they were proposed. */
	nodeId: string | undefined;
}

const NODE_TOOLS_TTL_MS = 60_000;
let nodeTools: {
	host: string;
	nodeId: string | undefined;
	set: ToolSet | null;
	at: number;
} | null = null;

/**
 * The node the dashboard's connection reaches right now, asked of it directly. The cached
 * `nodeInfo` can still describe the previous node for a moment after the connection changes.
 */
async function currentNodeId(): Promise<string | undefined> {
	try {
		return (await requireClient().api.getNodeInfo()).nodeId || undefined;
	} catch {
		return undefined;
	}
}

/**
 * The tools for the next turn. Through the goose gateway, the node's own (ldk-server-mcp) when
 * the gateway serves them for the node this dashboard is connected to; otherwise, and for the
 * browser-direct providers, the built-in ones. Looked up at most once a minute per gateway
 * address and dashboard node.
 */
async function toolsForTurn(nodeId: string | undefined): Promise<ToolSet> {
	if (assistantConfig.provider.id !== 'goose') return builtinTools;
	const host = assistantConfig.host;
	if (
		!nodeTools ||
		nodeTools.host !== host ||
		nodeTools.nodeId !== nodeId ||
		Date.now() - nodeTools.at > NODE_TOOLS_TTL_MS
	) {
		nodeTools = { host, nodeId, set: await nodeToolsFor(host, nodeId), at: Date.now() };
	}
	return nodeTools.set ?? builtinTools;
}

/**
 * Whether approved calls may still run: the dashboard is on the node they were proposed for,
 * and for the node's own tools the gateway still drives that node too. The prompt stays up
 * across navigation, so either may have changed since.
 */
async function stillOnSameNode(p: PendingApproval): Promise<boolean> {
	if (!p.nodeId || (await currentNodeId()) !== p.nodeId) return false;
	return p.tools.source !== 'node' || drivesNode(p.tools, p.nodeId);
}

class Chat {
	messages = $state<ChatMessage[]>([GREETING]);
	busy = $state(false);
	pending = $state<PendingApproval | null>(null);
	/** True once reply text has started streaming in this pass; hides "thinking…". */
	streaming = $state(false);
	/** The tools the last turn had: the built-in ones, or the node's through the gateway. */
	tools = $state<{ source: ToolSet['source']; count: number } | null>(null);
	/** The message being streamed into, if any. */
	private live: ChatMessage | null = null;

	async send(text: string) {
		const t = text.trim();
		if (!t || this.busy || this.pending) return;
		this.messages = [...this.messages, { role: 'user', text: t }];

		if (!assistantConfig.isReady) {
			this.say(
				`Add a ${assistantConfig.provider.label} key in the provider settings to enable the assistant. It stays in this browser.`
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
			if (!(await stillOnSameNode(p))) {
				this.say(
					'Not run: the dashboard or the assistant gateway is no longer connected to the node this was proposed for. Ask again on the node you want it to run on.'
				);
				return;
			}
			const ran = await execute(p.calls, p.tools);
			for (const r of ran) this.say(p.tools.report(r.call.name, r.call.input, r.result.output));
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
			const nodeId = await currentNodeId();
			const tools = await toolsForTurn(nodeId);
			this.tools = { source: tools.source, count: tools.specs.length };
			const step = await run({
				tools,
				provider: assistantConfig.provider,
				token: assistantConfig.token,
				model: assistantConfig.model,
				host: assistantConfig.host,
				upstream: assistantConfig.upstream,
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
					lines: step.calls.map((c) => tools.describe(c.name, c.input)),
					resolved: step.resolved,
					tools,
					nodeId
				};
			}
		} catch (e) {
			// A failed turn is the freshest signal there is; update the status right away
			// rather than waiting for the next poll.
			if (assistantConfig.provider.tokenOptional) void gatewayHealth.refresh();
			this.say(
				e instanceof ProviderAuthError
					? e.message
					: `Something went wrong talking to ${assistantConfig.label}: ${describeError(e)}`
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
