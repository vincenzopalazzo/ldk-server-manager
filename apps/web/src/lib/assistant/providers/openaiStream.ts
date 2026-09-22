import { ProviderAuthError, type ToolCall, type TurnResult } from './types';

/**
 * Reading an OpenAI-style streamed chat completion (`"stream": true`).
 *
 * The body is server-sent events whose `data:` payloads are `chat.completion.chunk` objects,
 * ending with `data: [DONE]`. Text arrives as `delta.content` pieces; tool calls arrive as
 * `delta.tool_calls` fragments keyed by `index`, whose `arguments` strings concatenate.
 */

/** Yield the `data:` payload of each event in a server-sent event stream. */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	try {
		for (;;) {
			const { value, done } = await reader.read();
			buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
			// Events end at a blank line; the tail stays buffered until it is complete.
			const events = buffer.split(/\r?\n\r?\n/);
			buffer = done ? '' : (events.pop() ?? '');
			for (const event of events) {
				const data = event
					.split(/\r?\n/)
					.filter((line) => line.startsWith('data:'))
					.map((line) => line.slice(5).replace(/^ /, ''));
				// Lines starting with ':' are keep-alive comments and carry no data.
				if (data.length > 0) yield data.join('\n');
			}
			if (done) return;
		}
	} finally {
		reader.releaseLock();
	}
}

interface Chunk {
	choices?: {
		delta?: {
			content?: string | null;
			tool_calls?: {
				index: number;
				id?: string;
				function?: { name?: string; arguments?: string };
			}[];
		};
		finish_reason?: string | null;
	}[];
	error?: { message?: string; type?: string };
}

/** Builds one reply out of stream chunks. */
export class ChunkAssembler {
	private text = '';
	private calls = new Map<number, { id: string; name: string; args: string }>();
	finished = false;

	/** Apply one chunk; returns the text it added, if any. Throws on an in-band error. */
	push(chunk: Chunk): string {
		if (chunk.error) {
			const message = chunk.error.message ?? 'The assistant endpoint reported an error.';
			throw chunk.error.type === 'authentication_error'
				? new ProviderAuthError(message)
				: new Error(message);
		}
		let added = '';
		for (const choice of chunk.choices ?? []) {
			const delta = choice.delta;
			if (delta?.content) added += delta.content;
			for (const part of delta?.tool_calls ?? []) {
				const call = this.calls.get(part.index) ?? { id: '', name: '', args: '' };
				if (part.id) call.id = part.id;
				if (part.function?.name) call.name += part.function.name;
				if (part.function?.arguments) call.args += part.function.arguments;
				this.calls.set(part.index, call);
			}
			if (choice.finish_reason) this.finished = true;
		}
		this.text += added;
		return added;
	}

	result(parseArguments: (raw: string) => Record<string, unknown>): TurnResult {
		const calls: ToolCall[] = [...this.calls.entries()]
			.sort(([a], [b]) => a - b)
			.map(([index, c]) => ({
				id: c.id || `call_${index}`,
				name: c.name,
				input: parseArguments(c.args)
			}));
		return { text: this.text.trim(), calls };
	}
}

/**
 * Consume a streamed reply, handing each piece of text to `onText` as it lands.
 *
 * A stream that stops without a finish reason or `[DONE]` is treated as a failure: acting on
 * half a reply, or half a tool call's arguments, would be worse than reporting it.
 */
export async function readStream(
	body: ReadableStream<Uint8Array>,
	parseArguments: (raw: string) => Record<string, unknown>,
	onText?: (delta: string) => void
): Promise<TurnResult> {
	const assembler = new ChunkAssembler();
	let done = false;
	for await (const data of sseData(body)) {
		if (data === '[DONE]') {
			done = true;
			break;
		}
		let chunk: Chunk;
		try {
			chunk = JSON.parse(data) as Chunk;
		} catch {
			continue;
		}
		const added = assembler.push(chunk);
		if (added) onText?.(added);
	}
	if (!done && !assembler.finished) {
		throw new Error('The reply was cut off before it finished.');
	}
	return assembler.result(parseArguments);
}
