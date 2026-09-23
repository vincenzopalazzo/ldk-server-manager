import { requireClient } from '$lib/api/client.svelte';
import { createBolt11Invoice, openChannel, parsePeerUri, sendPayment } from '$lib/actions/node';
import { describeError } from '$lib/state/resource.svelte';

/**
 * Provider-neutral tool definitions.
 *
 * `parameters` is plain JSON Schema so the same spec can be adapted to Anthropic's
 * `input_schema` and to the OpenAI-compatible `function.parameters` that xAI expects.
 */
export interface ToolSpec {
	name: string;
	description: string;
	parameters: ObjectSchema;
	/**
	 * Moves funds or changes the node's on-chain position. The agent never runs these
	 * on its own: it surfaces the call to the operator and waits for approval.
	 */
	confirm?: boolean;
	/** One line shown in the approval prompt, built from the model's arguments. */
	summarize?: (input: Record<string, unknown>) => string;
}

/** A JSON Schema for a tool's arguments: an object, as every provider requires. */
export interface ObjectSchema {
	type: 'object';
	properties?: Record<string, unknown>;
	required?: string[];
	[keyword: string]: unknown;
}

/**
 * The tools one conversation uses, and how to run them: the ones built into this page, or the
 * node's own through the goose gateway (see `nodeTools.ts`).
 */
export interface ToolSet {
	/** For the UI: which set this is. */
	source: 'built-in' | 'node';
	specs: ToolSpec[];
	/** True when a call must be approved by the operator before it runs. */
	needsConfirmation(name: string): boolean;
	/** One line for the approval prompt. */
	describe(name: string, input: Record<string, unknown>): string;
	/** Run a call. Failures come back as text for the model, never as a throw. */
	run(name: string, input: Record<string, unknown>): Promise<string>;
	/** What to tell the operator once an approved call ran. */
	report(name: string, input: Record<string, unknown>, output: string): string;
}

const sats = (v: unknown) => Number(v ?? 0).toLocaleString('en-US');

export const TOOLS: ToolSpec[] = [
	{
		name: 'create_invoice',
		description: 'Create a BOLT11 invoice on this node so someone can pay it.',
		parameters: {
			type: 'object',
			properties: {
				amount_sats: { type: 'number', description: 'Amount in satoshis' },
				description: { type: 'string', description: 'Invoice description' }
			},
			required: ['amount_sats'],
			additionalProperties: false
		}
	},
	{
		name: 'send_payment',
		description:
			'Pay a destination: BOLT11 invoice, BOLT12 offer, BIP21 URI or on-chain address. ' +
			'amount_sats is only needed when the destination carries no fixed amount.',
		parameters: {
			type: 'object',
			properties: {
				destination: { type: 'string', description: 'Invoice, offer, URI or address' },
				amount_sats: {
					type: 'number',
					description: 'Amount in satoshis, when the destination has none'
				}
			},
			required: ['destination'],
			additionalProperties: false
		},
		confirm: true,
		summarize: (i) =>
			`Send ${i.amount_sats ? `${sats(i.amount_sats)} sats` : 'the invoiced amount'} to ${String(i.destination).slice(0, 40)}…`
	},
	{
		name: 'open_channel',
		description: 'Open a new channel to a peer given as node_id@host:port.',
		parameters: {
			type: 'object',
			properties: {
				peer: { type: 'string', description: 'node_id@host:port' },
				capacity_sats: { type: 'number', description: 'Channel capacity in satoshis' },
				announce: { type: 'boolean', description: 'Announce the channel publicly' }
			},
			required: ['peer', 'capacity_sats'],
			additionalProperties: false
		},
		confirm: true,
		summarize: (i) =>
			`Open a ${sats(i.capacity_sats)} sat channel to ${String(i.peer).slice(0, 40)}…`
	}
];

export const toolByName = (name: string) => TOOLS.find((t) => t.name === name);

/** True when this call must be approved by the operator before it runs. */
export function needsConfirmation(name: string): boolean {
	return toolByName(name)?.confirm === true;
}

export function describeCall(name: string, input: Record<string, unknown>): string {
	const spec = toolByName(name);
	return spec?.summarize?.(input) ?? name;
}

/** Execute a tool against the node. Errors are returned to the model, not thrown. */
export async function runTool(name: string, input: Record<string, unknown>): Promise<string> {
	try {
		requireClient();
		switch (name) {
			case 'create_invoice': {
				const r = await createBolt11Invoice({
					amountSats: String(input.amount_sats ?? ''),
					description: String(input.description ?? ''),
					expirySecs: 3600
				});
				return `Invoice created for ${sats(input.amount_sats)} sats: ${r.invoice}`;
			}
			case 'send_payment': {
				const r = await sendPayment({
					destination: String(input.destination),
					amountSats: input.amount_sats == null ? undefined : String(input.amount_sats)
				});
				return `Payment submitted (${r.kind}: ${r.id}). It may still be in flight; the Payments list has the final status.`;
			}
			case 'open_channel': {
				const { nodePubkey, address } = parsePeerUri(String(input.peer));
				const id = await openChannel({
					nodePubkey,
					address,
					amountSats: String(input.capacity_sats),
					announce: input.announce !== false
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

/** The tools above, run from this page through the node's gRPC-Web API. */
export const builtinTools: ToolSet = {
	source: 'built-in',
	specs: TOOLS,
	needsConfirmation,
	describe: describeCall,
	run: runTool,
	// These already answer in a sentence meant for the operator.
	report: (_name, _input, output) => output
};
