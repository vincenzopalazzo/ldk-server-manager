import { readStream } from './openaiStream';
import {
	ProviderAuthError,
	type Provider,
	type SendOptions,
	type ToolCall,
	type Turn,
	type TurnResult
} from './types';

/**
 * xAI (Grok) provider.
 *
 * Mirrors goose's `xai` / `xai_oauth` providers: the same OpenAI-compatible host, the same
 * model list, and the same `Authorization: Bearer <token>` header. That means a token works
 * here whether it is an xAI API key or the access token goose obtained from an X
 * subscription sign-in, because goose points both at this host.
 *
 * `api.x.ai` answers browser requests with `access-control-allow-origin: *`, so this runs
 * client-side with no proxy. The OAuth endpoints at `auth.x.ai` do not send CORS headers,
 * which is why the sign-in itself has to happen outside the browser (see credentialHint).
 */
const DEFAULT_HOST = 'https://api.x.ai/v1';

export { DEFAULT_HOST as XAI_DEFAULT_HOST };

const MODELS = [
	'grok-4.7',
	'grok-4.6',
	'grok-4.5',
	'grok-4.3',
	'grok-code-fast-1',
	'grok-3',
	'grok-3-mini'
] as const;

interface OpenAiToolCall {
	id: string;
	type: 'function';
	function: { name: string; arguments: string };
}

export interface OpenAiMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string | null;
	tool_calls?: OpenAiToolCall[];
	tool_call_id?: string;
}

export function buildMessages(turn: Turn): OpenAiMessage[] {
	const messages: OpenAiMessage[] = [{ role: 'system', content: turn.system }];
	for (const m of turn.history) {
		messages.push({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text });
	}
	if (turn.resolved.length > 0) {
		// Replay the calls as one assistant turn, then each result as its own tool message.
		messages.push({
			role: 'assistant',
			content: null,
			tool_calls: turn.resolved.map(({ call }) => ({
				id: call.id,
				type: 'function' as const,
				function: { name: call.name, arguments: JSON.stringify(call.input) }
			}))
		});
		for (const { call, result } of turn.resolved) {
			messages.push({ role: 'tool', tool_call_id: call.id, content: result.output });
		}
	}
	return messages;
}

export const xaiProvider: Provider = {
	id: 'xai',
	label: 'Grok (xAI)',
	defaultModel: 'grok-4.7',
	models: MODELS,
	credentialHint:
		'An xAI API key, or the access token from an X subscription sign-in. ' +
		'If you use goose: `goose configure` → xai_oauth, then ' +
		'`jq -r .access_token ~/.config/goose/xai_oauth/tokens.json`. ' +
		'Subscription tokens expire, so paste a fresh one when Grok starts rejecting requests.',

	defaultHost: DEFAULT_HOST,

	send: (turn, opts) => sendChat(turn, opts, { stream: false })
};

/**
 * One chat completion against an OpenAI-compatible endpoint.
 *
 * With `stream`, the request asks for server-sent events and text reaches `onText` as it is
 * generated. An endpoint that answers with plain JSON anyway (an older gateway, say) is read
 * the non-streaming way, so asking is always safe.
 */
export async function sendChat(
	turn: Turn,
	{ token, model, host, onText, upstream }: SendOptions,
	{ stream }: { stream: boolean }
): Promise<TurnResult> {
	const base = (host || DEFAULT_HOST).replace(/\/+$/, '');
	let res: Response;
	try {
		res = await fetch(`${base}/chat/completions`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
			body: JSON.stringify({
				model,
				messages: buildMessages(turn),
				tools: turn.tools.map((t) => ({
					type: 'function',
					function: { name: t.name, description: t.description, parameters: t.parameters }
				})),
				tool_choice: 'auto',
				...(stream ? { stream: true } : {}),
				// Not OpenAI's: the goose gateway's choice of provider.
				...(upstream ? { provider: upstream } : {})
			})
		});
	} catch {
		throw new ProviderAuthError(`Could not reach ${base}. Is the endpoint running?`);
	}

	if (res.status === 401 || res.status === 403) {
		// A gateway reports why in the OpenAI error shape; xAI itself does not say much.
		const detail = (await res.json().catch(() => null)) as {
			error?: { message?: string };
		} | null;
		throw new ProviderAuthError(
			detail?.error?.message ??
				'xAI rejected the token. An X subscription token expires after a while — get a fresh one and save it again.'
		);
	}
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`xAI returned ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
	}

	if (stream && res.body && res.headers.get('content-type')?.includes('text/event-stream')) {
		return readStream(res.body, parseArguments, onText);
	}

	const data = (await res.json()) as {
		choices?: { message?: OpenAiMessage; finish_reason?: string }[];
	};
	const message = data.choices?.[0]?.message;
	if (!message) throw new Error('xAI returned no message');

	const calls: ToolCall[] = (message.tool_calls ?? []).map((c) => ({
		id: c.id,
		name: c.function.name,
		input: parseArguments(c.function.arguments)
	}));

	return { text: (message.content ?? '').trim(), calls };
}

/** Tool arguments arrive as a JSON string and can be malformed; never throw on them. */
export function parseArguments(raw: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(raw || '{}');
		return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}
