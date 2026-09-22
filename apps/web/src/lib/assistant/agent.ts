import Anthropic from '@anthropic-ai/sdk';
import { requireClient } from '$lib/api/client.svelte';
import { createBolt11Invoice, openChannel, parsePeerUri, sendPayment } from '$lib/actions/node';
import { balances, channels, nodeInfo, peers } from '$lib/state/node.svelte';
import { payments } from '$lib/state/payments.svelte';
import { channelStatus, localSats, remoteSats } from '$lib/domain/channels';
import {
	paymentDescription,
	paymentKind,
	paymentStatusLabel,
	isOutbound
} from '$lib/domain/payments';
import { aliases } from '$lib/state/aliases.svelte';
import { describeError } from '$lib/state/resource.svelte';
import { msatToSats } from '$lib/utils/format';

export interface ChatMessage {
	role: 'user' | 'ai';
	text: string;
}

const MODEL = 'claude-opus-5';

const SYSTEM =
	'You are the operations assistant embedded in an LDK Server (Lightning Network node) dashboard, in the spirit of a Square/Block terminal assistant. ' +
	'You help the operator analyze the node and run operations. Be concise (2-6 short lines), plain language, amounts in sats with thousands separators. ' +
	'Use the tools to act when the user asks for an operation; confirm what you did.';

/** Snapshot of live node state handed to the model on every turn. */
export function nodeSnapshot() {
	const info = nodeInfo.data;
	const bal = balances.data;
	const chs = channels.data ?? [];
	const ln = bal?.totalLightningBalanceSats ?? 0n;
	const oc = bal?.totalOnchainBalanceSats ?? 0n;
	return {
		alias: info?.nodeAlias ?? null,
		node_id: info?.nodeId ?? null,
		block_height: info?.currentBestBlock?.height ?? null,
		balances_sats: { lightning: Number(ln), onchain: Number(oc), total: Number(ln + oc) },
		channels: chs.map((c) => ({
			peer: aliases.get(c.counterpartyNodeId),
			peer_node_id: c.counterpartyNodeId,
			user_channel_id: c.userChannelId,
			capacity_sats: Number(c.channelValueSats),
			local_sats: Number(localSats(c)),
			remote_sats: Number(remoteSats(c)),
			status: channelStatus(c)
		})),
		peers_connected: (peers.data ?? []).filter((p) => p.isConnected).length,
		recent_payments: payments.items.slice(0, 6).map((p) => ({
			dir: isOutbound(p) ? 'out' : 'in',
			kind: paymentKind(p),
			amount_sats: Number(msatToSats(p.amountMsat)),
			status: paymentStatusLabel(p),
			desc: paymentDescription(p)
		}))
	};
}

const tools: Anthropic.Tool[] = [
	{
		name: 'create_invoice',
		description: 'Create a BOLT11 invoice on this node',
		strict: true,
		input_schema: {
			type: 'object',
			properties: { amount_sats: { type: 'number' }, description: { type: 'string' } },
			required: ['amount_sats', 'description'],
			additionalProperties: false
		}
	},
	{
		name: 'send_payment',
		description:
			'Pay a destination: BOLT11 invoice, BOLT12 offer, BIP21 URI or on-chain address. amount_sats is only needed when the destination has no fixed amount.',
		strict: true,
		input_schema: {
			type: 'object',
			properties: { destination: { type: 'string' }, amount_sats: { type: ['number', 'null'] } },
			required: ['destination', 'amount_sats'],
			additionalProperties: false
		}
	},
	{
		name: 'open_channel',
		description: 'Open a new channel to a peer given as node_id@host:port',
		strict: true,
		input_schema: {
			type: 'object',
			properties: {
				peer: { type: 'string' },
				capacity_sats: { type: 'number' },
				announce: { type: 'boolean' }
			},
			required: ['peer', 'capacity_sats', 'announce'],
			additionalProperties: false
		}
	}
];

async function runTool(name: string, input: Record<string, unknown>): Promise<string> {
	try {
		requireClient();
		switch (name) {
			case 'create_invoice': {
				const r = await createBolt11Invoice({
					amountSats: String(input.amount_sats),
					description: String(input.description ?? ''),
					expirySecs: 3600
				});
				return `Invoice created for ${Number(input.amount_sats).toLocaleString('en-US')} sats: ${r.invoice}`;
			}
			case 'send_payment': {
				const r = await sendPayment({
					destination: String(input.destination),
					amountSats: input.amount_sats == null ? undefined : String(input.amount_sats)
				});
				return `Payment submitted (${r.kind}: ${r.id}). Check the payments list for its final status.`;
			}
			case 'open_channel': {
				const { nodePubkey, address } = parsePeerUri(String(input.peer));
				const id = await openChannel({
					nodePubkey,
					address,
					amountSats: String(input.capacity_sats),
					announce: Boolean(input.announce)
				});
				return `Channel opening initiated (user channel id ${id}). Awaiting funding confirmation.`;
			}
			default:
				return `Unknown tool ${name}`;
		}
	} catch (e) {
		return `Error: ${describeError(e)}`;
	}
}

/**
 * One assistant turn: sends the conversation with a live node snapshot, runs any
 * tool calls against the real node, and returns the final text reply.
 */
export async function runAssistant(apiKey: string, history: ChatMessage[]): Promise<string> {
	const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
	const messages: Anthropic.MessageParam[] = history.map((m) => ({
		role: m.role === 'ai' ? 'assistant' : 'user',
		content: m.text
	}));
	const system = `${SYSTEM} Current node snapshot: ${JSON.stringify(nodeSnapshot())}`;

	for (let i = 0; i < 6; i++) {
		const response = await client.messages.create({
			model: MODEL,
			max_tokens: 1024,
			system,
			output_config: { effort: 'medium' },
			tools,
			messages
		});
		if (response.stop_reason === 'refusal') return 'I can’t help with that request.';
		const toolUses = response.content.filter(
			(b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
		);
		if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
			return response.content
				.filter((b): b is Anthropic.TextBlock => b.type === 'text')
				.map((b) => b.text)
				.join('\n')
				.trim();
		}
		messages.push({ role: 'assistant', content: response.content });
		const results: Anthropic.ToolResultBlockParam[] = [];
		for (const t of toolUses) {
			results.push({
				type: 'tool_result',
				tool_use_id: t.id,
				content: await runTool(t.name, t.input as Record<string, unknown>)
			});
		}
		messages.push({ role: 'user', content: results });
	}
	return 'Stopped after too many tool calls.';
}
