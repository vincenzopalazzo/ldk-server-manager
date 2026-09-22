import { describe, expect, it } from 'vitest';
import { ChunkAssembler, readStream, sseData } from './openaiStream';
import { ProviderAuthError } from './types';
import { parseArguments } from './xai';

/** A body delivered in exactly these pieces, to exercise splits in awkward places. */
function body(...pieces: string[]): ReadableStream<Uint8Array> {
	const enc = new TextEncoder();
	return new ReadableStream({
		start(c) {
			for (const p of pieces) c.enqueue(enc.encode(p));
			c.close();
		}
	});
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
	const out: string[] = [];
	for await (const d of sseData(stream)) out.push(d);
	return out;
}

const chunk = (delta: object, finish: string | null = null) =>
	`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;

describe('sseData', () => {
	it('reassembles events split across reads, including inside a UTF-8 character', async () => {
		const bytes = new TextEncoder().encode('data: héllo\n\ndata: two\n\n');
		const split = new ReadableStream<Uint8Array>({
			start(c) {
				// Cut between the two bytes of "é".
				c.enqueue(bytes.slice(0, 8));
				c.enqueue(bytes.slice(8));
				c.close();
			}
		});
		expect(await collect(split)).toEqual(['héllo', 'two']);
	});

	it('skips keep-alive comments and accepts CRLF and no-space data lines', async () => {
		expect(await collect(body(':\n\n', 'data:{"a":1}\r\n\r\n', 'data: x\n\n'))).toEqual([
			'{"a":1}',
			'x'
		]);
	});
});

describe('ChunkAssembler', () => {
	it('joins tool call fragments by index', () => {
		const a = new ChunkAssembler();
		a.push({
			choices: [
				{
					delta: {
						tool_calls: [
							{ index: 0, id: 'c1', function: { name: 'create_invoice', arguments: '{"amount' } }
						]
					}
				}
			]
		});
		a.push({
			choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '_sats":50000}' } }] } }]
		});
		a.push({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
		const r = a.result(parseArguments);
		expect(r.calls).toEqual([{ id: 'c1', name: 'create_invoice', input: { amount_sats: 50000 } }]);
		expect(a.finished).toBe(true);
	});

	it('turns an in-band error into the matching exception', () => {
		const a = new ChunkAssembler();
		expect(() => a.push({ error: { message: 'sign in', type: 'authentication_error' } })).toThrow(
			ProviderAuthError
		);
		expect(() => a.push({ error: { message: 'upstream down', type: 'upstream_error' } })).toThrow(
			'upstream down'
		);
	});
});

describe('readStream', () => {
	it('hands text over piece by piece and returns the whole reply', async () => {
		const pieces: string[] = [];
		const r = await readStream(
			body(
				chunk({ role: 'assistant', content: 'Node ' }),
				chunk({ content: 'is fine. ' }),
				chunk({}, 'stop'),
				'data: [DONE]\n\n'
			),
			parseArguments,
			(d) => pieces.push(d)
		);
		expect(pieces).toEqual(['Node ', 'is fine. ']);
		expect(r).toEqual({ text: 'Node is fine.', calls: [] });
	});

	it('refuses a reply that was cut off', async () => {
		await expect(readStream(body(chunk({ content: 'half' })), parseArguments)).rejects.toThrow(
			/cut off/
		);
	});
});
