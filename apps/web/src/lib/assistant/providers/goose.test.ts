import { describe, expect, it } from 'vitest';
import { buildPayload } from './goose';
import type { Turn } from './types';
import { TOOLS } from '../tools';

const base: Turn = { system: 'sys', history: [], tools: TOOLS, resolved: [] };

describe('goose sidecar payload', () => {
	it('sends the system prompt separately and maps ai -> assistant', () => {
		const p = buildPayload(
			{
				...base,
				history: [
					{ role: 'user', text: 'hi' },
					{ role: 'ai', text: 'hello' }
				]
			},
			'grok-4.7'
		);
		expect(p.system).toBe('sys');
		expect(p.model).toBe('grok-4.7');
		expect(p.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
		expect(p.messages[0].content).toEqual([{ type: 'text', text: 'hi' }]);
	});

	it('emits tool_request and tool_result blocks the sidecar understands', () => {
		const call = { id: 'c1', name: 'create_invoice', input: { amount_sats: 50000 } };
		const p = buildPayload(
			{
				...base,
				history: [{ role: 'user', text: 'invoice' }],
				resolved: [{ call, result: { id: 'c1', name: call.name, output: 'lnbc…' } }]
			},
			'grok-4.7'
		);
		expect(p.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool']);
		expect(p.messages[1].content[0]).toEqual({
			type: 'tool_request',
			id: 'c1',
			name: 'create_invoice',
			input: { amount_sats: 50000 }
		});
		expect(p.messages[2].content[0]).toMatchObject({
			type: 'tool_result',
			id: 'c1',
			success: true
		});
	});

	it('marks a failed tool result as unsuccessful', () => {
		const call = { id: 'c2', name: 'send_payment', input: {} };
		const p = buildPayload(
			{
				...base,
				resolved: [{ call, result: { id: 'c2', name: call.name, output: 'Error: no route' } }]
			},
			'grok-4.7'
		);
		expect(p.messages.at(-1)!.content[0]).toMatchObject({ success: false });
	});

	it('passes tool schemas straight through', () => {
		const p = buildPayload(base, 'grok-4.7');
		expect(p.tools.map((t) => t.name)).toEqual(TOOLS.map((t) => t.name));
		expect(p.tools[0].parameters).toBe(TOOLS[0].parameters);
	});
});
