import { systemPrompt } from './snapshot';
import { TOOLS, needsConfirmation, runTool } from './tools';
import type { ChatMessage, ToolCall, ToolResult, Turn } from './providers/types';
import type { Provider } from './providers/types';

export type { ChatMessage } from './providers/types';

export interface Resolved {
	call: ToolCall;
	result: ToolResult;
}

/** Outcome of one pass: either the model answered, or it wants to run something risky. */
export type AgentStep =
	{ kind: 'done'; text: string } | { kind: 'confirm'; calls: ToolCall[]; resolved: Resolved[] };

const MAX_PASSES = 6;

export interface RunOptions {
	provider: Provider;
	token: string;
	model: string;
	host?: string;
	history: ChatMessage[];
	/** Tool calls already executed or approved in this exchange. */
	resolved?: Resolved[];
}

/**
 * Drive the model until it produces prose or asks for something that needs approval.
 *
 * Tools marked `confirm` are never executed here. When the model asks for one, the pass
 * stops and returns it, so the operator decides. Harmless tools run inline and the loop
 * continues, which keeps "create an invoice for 50k" a single round trip.
 */
export async function run(opts: RunOptions): Promise<AgentStep> {
	const { provider, token, model, host, history } = opts;
	let resolved: Resolved[] = opts.resolved ?? [];

	for (let pass = 0; pass < MAX_PASSES; pass++) {
		const turn: Turn = { system: systemPrompt(), history, tools: TOOLS, resolved };
		const result = await provider.send(turn, { token, model, host });

		if (result.calls.length === 0) {
			return { kind: 'done', text: result.text || '(no reply)' };
		}

		const risky = result.calls.filter((c) => needsConfirmation(c.name));
		if (risky.length > 0) {
			return { kind: 'confirm', calls: risky, resolved };
		}

		const ran: Resolved[] = [];
		for (const call of result.calls) {
			ran.push({
				call,
				result: { id: call.id, name: call.name, output: await runTool(call.name, call.input) }
			});
		}
		resolved = [...resolved, ...ran];
	}

	return { kind: 'done', text: 'Stopped after too many tool calls.' };
}

/** Execute approved calls and hand back the results for the next pass. */
export async function execute(calls: ToolCall[]): Promise<Resolved[]> {
	const out: Resolved[] = [];
	for (const call of calls) {
		out.push({
			call,
			result: { id: call.id, name: call.name, output: await runTool(call.name, call.input) }
		});
	}
	return out;
}

/** Feed a refusal back to the model so it can respond rather than hang. */
export function declineAll(calls: ToolCall[]): Resolved[] {
	return calls.map((call) => ({
		call,
		result: {
			id: call.id,
			name: call.name,
			output:
				'The operator declined this action. Do not retry it; ask what they would like instead.'
		}
	}));
}
