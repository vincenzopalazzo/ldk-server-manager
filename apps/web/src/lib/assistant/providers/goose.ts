import {
	ProviderAuthError,
	type Provider,
	type ToolCall,
	type Turn,
	type TurnResult
} from './types';

/**
 * The assistant running through the goose SDK (GDK), via the local sidecar in
 * `contrib/goose-assistant`.
 *
 * goose-sdk is a Rust crate with bindings generated for Python and Kotlin; it has no
 * JavaScript or WASM target, so it cannot be imported into a browser-only app. The sidecar
 * runs it out of process and speaks JSON over loopback.
 *
 * What this buys over calling xAI straight from the page: goose owns the credential. It
 * refreshes an expiring X subscription token and rewrites its cache, and the sidecar re-reads
 * that file per request — so nothing has to be pasted into the browser at all, and a long
 * session does not die when the token rolls over.
 */
const DEFAULT_URL = 'http://127.0.0.1:8791';

/** Whatever goose is configured for; the sidecar defaults to grok-4.7. */
const MODELS = [
	'grok-4.7',
	'grok-4.6',
	'grok-4.5',
	'grok-code-fast-1',
	'grok-3',
	'grok-3-mini'
] as const;

interface WireMessage {
	role: 'user' | 'assistant' | 'tool';
	content: (
		| { type: 'text'; text: string }
		| { type: 'tool_request'; id: string; name: string; input: Record<string, unknown> }
		| { type: 'tool_result'; id: string; success: boolean; output: string }
	)[];
}

export function buildPayload(turn: Turn, model: string) {
	const messages: WireMessage[] = turn.history.map((m) => ({
		role: m.role === 'ai' ? 'assistant' : 'user',
		content: [{ type: 'text', text: m.text }]
	}));

	if (turn.resolved.length > 0) {
		messages.push({
			role: 'assistant',
			content: turn.resolved.map(({ call }) => ({
				type: 'tool_request' as const,
				id: call.id,
				name: call.name,
				input: call.input
			}))
		});
		messages.push({
			role: 'tool',
			content: turn.resolved.map(({ call, result }) => ({
				type: 'tool_result' as const,
				id: call.id,
				success: !result.output.startsWith('Error:'),
				output: result.output
			}))
		});
	}

	return {
		model,
		system: turn.system,
		messages,
		tools: turn.tools.map((t) => ({
			name: t.name,
			description: t.description,
			parameters: t.parameters
		}))
	};
}

export const gooseProvider: Provider = {
	id: 'goose',
	label: 'goose (local)',
	defaultModel: 'grok-4.7',
	models: MODELS,
	credentialHint:
		'No token needed here — goose holds the credential. Start the sidecar: ' +
		'`cd contrib/goose-assistant && pip install -r requirements.txt && python server.py`. ' +
		'It uses $XAI_API_KEY, or the token from `goose configure` → xai_oauth, and refreshes it for you. ' +
		'Set a different URL below only if you moved the sidecar off port 8791.',

	async send(turn, { token, model }): Promise<TurnResult> {
		// The "token" field is repurposed as an optional sidecar URL: this provider has no
		// secret of its own, because the credential never leaves the goose process.
		const base = (token || DEFAULT_URL).replace(/\/+$/, '');

		let res: Response;
		try {
			res = await fetch(`${base}/chat`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(buildPayload(turn, model))
			});
		} catch {
			throw new ProviderAuthError(
				`Could not reach the goose sidecar at ${base}. Start it with ` +
					'`cd contrib/goose-assistant && python server.py`.'
			);
		}

		const data = (await res.json().catch(() => ({}))) as {
			text?: string;
			calls?: { id: string; name: string; input: Record<string, unknown> }[];
			error?: string;
		};

		if (res.status === 401)
			throw new ProviderAuthError(data.error ?? 'goose has no usable credential.');
		if (!res.ok) throw new Error(data.error ?? `goose sidecar returned ${res.status}`);

		const calls: ToolCall[] = (data.calls ?? []).map((c) => ({
			id: c.id,
			name: c.name,
			input: c.input ?? {}
		}));
		return { text: (data.text ?? '').trim(), calls };
	}
};
