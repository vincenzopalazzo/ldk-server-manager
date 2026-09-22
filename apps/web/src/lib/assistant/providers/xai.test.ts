import { describe, expect, it } from 'vitest';
import { buildMessages, parseArguments } from './xai';
import type { Turn } from './types';
import { TOOLS } from '../tools';

const base: Turn = { system: 'sys', history: [], tools: TOOLS, resolved: [] };

describe('xai wire format', () => {
	it('puts the system prompt first and maps ai -> assistant', () => {
		const m = buildMessages({
			...base,
			history: [
				{ role: 'user', text: 'hi' },
				{ role: 'ai', text: 'hello' }
			]
		});
		expect(m.map((x) => x.role)).toEqual(['system', 'user', 'assistant']);
		expect(m[0].content).toBe('sys');
	});

	it('replays resolved calls as one assistant turn plus a tool message each', () => {
		const call = { id: 'call_1', name: 'create_invoice', input: { amount_sats: 50000 } };
		const m = buildMessages({
			...base,
			history: [{ role: 'user', text: 'invoice me' }],
			resolved: [{ call, result: { id: call.id, name: call.name, output: 'lnbc…' } }]
		});
		expect(m.map((x) => x.role)).toEqual(['system', 'user', 'assistant', 'tool']);
		const assistant = m[2];
		expect(assistant.content).toBeNull();
		expect(assistant.tool_calls?.[0].id).toBe('call_1');
		// Arguments must be a JSON string, not an object — this is what xAI expects.
		expect(assistant.tool_calls?.[0].function.arguments).toBe('{"amount_sats":50000}');
		expect(m[3].tool_call_id).toBe('call_1');
		expect(m[3].content).toBe('lnbc…');
	});

	it('never throws on malformed tool arguments', () => {
		expect(parseArguments('{"a":1}')).toEqual({ a: 1 });
		expect(parseArguments('')).toEqual({});
		expect(parseArguments('{oops')).toEqual({});
		expect(parseArguments('"a string"')).toEqual({});
		expect(parseArguments('null')).toEqual({});
	});
});
