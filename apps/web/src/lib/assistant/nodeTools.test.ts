import { describe, expect, it, vi } from 'vitest';
import {
	describeNodeCall,
	loadNodeTools,
	nodeToolSet,
	toolsUrl,
	type GatewayTool
} from './nodeTools';

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});

const tool = (name: string, extra: Partial<GatewayTool> = {}): GatewayTool => ({
	name,
	description: name,
	parameters: { type: 'object', properties: {}, required: [] },
	...extra
});

describe('node tools through the gateway', () => {
	it('finds the tools next to the OpenAI routes, under a proxy prefix too', () => {
		expect(toolsUrl('http://127.0.0.1:8791/v1')).toBe('http://127.0.0.1:8791/v1/tools');
		expect(toolsUrl('/goose/v1/')).toBe('/goose/v1/tools');
	});

	it('loads the listed tools, and gives up quietly when the gateway serves none', async () => {
		const ok = vi.fn().mockResolvedValue(json({ tools: [tool('get_balances'), { bad: 1 }] }));
		expect((await loadNodeTools('/goose/v1', ok))?.map((t) => t.name)).toEqual(['get_balances']);
		expect(ok).toHaveBeenCalledWith('/goose/v1/tools', {
			cache: 'no-store',
			signal: expect.any(AbortSignal)
		});

		const none = vi.fn().mockResolvedValue(json({ error: { message: 'no tools' } }, 404));
		expect(await loadNodeTools('/goose/v1', none)).toBeNull();
		const down = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
		expect(await loadNodeTools('/goose/v1', down)).toBeNull();
		const empty = vi.fn().mockResolvedValue(json({ tools: [] }));
		expect(await loadNodeTools('/goose/v1', empty)).toBeNull();
	});

	it('gives up on a gateway that never answers', async () => {
		const hang = vi.fn(
			(_input: RequestInfo | URL, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) =>
					init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
				)
		);
		expect(await loadNodeTools('/goose/v1', hang as unknown as typeof fetch, 20)).toBeNull();
	});

	it('runs reads and payment requests unasked, and asks for everything else', () => {
		const set = nodeToolSet('/goose/v1', [
			tool('get_balances'),
			tool('bolt11_receive'),
			tool('bolt11_send'),
			tool('open_channel'),
			tool('force_close_channel'),
			tool('sign_message'),
			tool('bolt11_receive_via_jit_channel'),
			tool('some_new_tool'),
			tool('annotated_read', { read_only: true })
		]);
		const asks = (n: string) => set.needsConfirmation(n);
		expect(asks('get_balances')).toBe(false);
		expect(asks('bolt11_receive')).toBe(false);
		expect(asks('annotated_read')).toBe(false);
		for (const n of [
			'bolt11_send',
			'open_channel',
			'force_close_channel',
			'sign_message',
			'bolt11_receive_via_jit_channel',
			'some_new_tool',
			'never_listed'
		]) {
			expect(asks(n), n).toBe(true);
		}
		expect(set.specs.find((s) => s.name === 'bolt11_send')?.confirm).toBe(true);
	});

	it('gives every schema an object type with properties', () => {
		const set = nodeToolSet('/goose/v1', [tool('get_node_info', { parameters: {} })]);
		expect(set.specs[0].parameters).toEqual({ type: 'object', properties: {} });
	});

	it('shows amounts in sats in the approval line', () => {
		expect(
			describeNodeCall('bolt11_send', {
				invoice: 'lnbc1' + 'x'.repeat(60),
				amount_msat: 21_000_000
			})
		).toBe(`bolt11_send: invoice lnbc1${'x'.repeat(35)}…, amount 21,000 sats`);
		expect(describeNodeCall('open_channel', { channel_amount_sats: 100000, announce: true })).toBe(
			'open_channel: channel_amount 100,000 sats, announce true'
		);
		expect(describeNodeCall('get_balances', {})).toBe('get_balances');
	});

	it('posts the arguments and hands failures back as text', async () => {
		const doFetch = vi
			.fn()
			.mockResolvedValueOnce(json({ output: '{"address":"bc1q"}', is_error: false }))
			.mockResolvedValueOnce(json({ output: 'The given invoice is invalid.', is_error: true }))
			.mockResolvedValueOnce(
				json({ error: { message: 'bolt11_send may or may not have run' } }, 502)
			)
			.mockRejectedValueOnce(new TypeError('Failed to fetch'));
		const set = nodeToolSet('/goose/v1', [tool('onchain_receive'), tool('bolt11_send')], doFetch);

		expect(await set.run('onchain_receive', {})).toBe('{"address":"bc1q"}');
		expect(doFetch).toHaveBeenCalledWith('/goose/v1/tools/onchain_receive', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}'
		});
		expect(await set.run('bolt11_send', { invoice: 'x' })).toBe(
			'Error: The given invoice is invalid.'
		);
		expect(await set.run('bolt11_send', { invoice: 'x' })).toBe(
			'Error: bolt11_send may or may not have run'
		);
		expect(await set.run('bolt11_send', { invoice: 'x' })).toContain('could not be reached');
	});

	it('reports an approved call in a line, not as raw output', () => {
		const set = nodeToolSet('/goose/v1', [tool('bolt11_send')]);
		expect(set.report('bolt11_send', { invoice: 'lnbc1' }, '{"payment_id":"ab"}')).toBe(
			'Done: bolt11_send: invoice lnbc1.'
		);
		expect(set.report('bolt11_send', { invoice: 'lnbc1' }, 'Error: no route')).toBe(
			'bolt11_send: invoice lnbc1 failed. no route'
		);
	});
});
