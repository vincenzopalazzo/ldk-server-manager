import { describe, expect, it, vi } from 'vitest';
import { declineAll, run } from './agent';
import type { Provider, ToolCall, TurnResult } from './providers/types';

/** A provider that returns a scripted sequence of turns. */
function fakeProvider(script: TurnResult[]): Provider & { calls: number } {
	let i = 0;
	const p = {
		id: 'xai' as const,
		label: 'fake',
		defaultModel: 'm',
		models: ['m'],
		credentialHint: '',
		calls: 0,
		async send(): Promise<TurnResult> {
			p.calls++;
			return script[Math.min(i++, script.length - 1)];
		}
	};
	return p;
}

const opts = (provider: Provider) => ({
	provider,
	token: 't',
	model: 'm',
	history: [{ role: 'user' as const, text: 'go' }]
});

const call = (name: string, input: Record<string, unknown> = {}): ToolCall => ({
	id: `c_${name}`,
	name,
	input
});

describe('agent loop', () => {
	it('returns prose straight through', async () => {
		const p = fakeProvider([{ text: 'all good', calls: [] }]);
		await expect(run(opts(p))).resolves.toEqual({ kind: 'done', text: 'all good' });
	});

	it('never executes a fund-moving tool on its own', async () => {
		const p = fakeProvider([
			{ text: '', calls: [call('send_payment', { destination: 'lno1x', amount_sats: 1000 })] }
		]);
		const step = await run(opts(p));
		expect(step.kind).toBe('confirm');
		if (step.kind !== 'confirm') throw new Error('unreachable');
		expect(step.calls[0].name).toBe('send_payment');
		// One pass only: it stopped instead of looping on with a result.
		expect(p.calls).toBe(1);
	});

	it('gates open_channel too, and stops before any harmless tool in the same turn runs', async () => {
		const p = fakeProvider([
			{
				text: '',
				calls: [
					call('create_invoice', { amount_sats: 1 }),
					call('open_channel', { peer: 'a@b:9735', capacity_sats: 2 })
				]
			}
		]);
		const step = await run(opts(p));
		expect(step.kind).toBe('confirm');
		if (step.kind !== 'confirm') throw new Error('unreachable');
		expect(step.calls.map((c) => c.name)).toEqual(['open_channel']);
	});

	it('gives up rather than looping forever', async () => {
		const p = fakeProvider([{ text: '', calls: [call('create_invoice', { amount_sats: 1 })] }]);
		const step = await run(opts(p));
		expect(step).toEqual({ kind: 'done', text: 'Stopped after too many tool calls.' });
		expect(p.calls).toBe(6);
	});

	it('turns a decline into a tool result the model can read', () => {
		const declined = declineAll([call('send_payment')]);
		expect(declined[0].result.output).toContain('declined');
		expect(declined[0].result.id).toBe('c_send_payment');
	});

	it('surfaces provider errors to the caller', async () => {
		const p = fakeProvider([]);
		p.send = vi.fn().mockRejectedValue(new Error('boom'));
		await expect(run(opts(p))).rejects.toThrow('boom');
	});
});
