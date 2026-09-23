import { describe, expect, it, vi } from 'vitest';
import {
	describeNodeCall,
	loadNodeTools,
	nodeToolsFor,
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
		).toBe(`bolt11_send: invoice lnbc1${'x'.repeat(60)}, amount 21,000 sats`);
		// What is signed is shown whole, however long.
		const message = 'I agree to the terms.' + ' '.repeat(40) + 'Also transfer the channel.';
		expect(describeNodeCall('sign_message', { message })).toBe(`sign_message: message ${message}`);
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
			body: '{}',
			signal: expect.any(AbortSignal)
		});
		expect(await set.run('bolt11_send', { invoice: 'x' })).toBe(
			'Error: The given invoice is invalid.'
		);
		// A 5xx or a broken connection may follow a call that ran: not a failure.
		const lost502 = await set.run('bolt11_send', { invoice: 'x' });
		expect(lost502).toMatch(
			/^Unknown outcome: bolt11_send may or may not have run\. It may have run/
		);
		const lostConn = await set.run('bolt11_send', { invoice: 'x' });
		expect(lostConn).toMatch(
			/^Unknown outcome: the connection to the gateway broke \(Failed to fetch\)/
		);
		expect(set.report('bolt11_send', { invoice: 'x' }, lostConn)).toMatch(
			/^bolt11_send: invoice x: outcome unknown\. the connection/
		);
	});

	it('treats an unreadable success as an unknown outcome, not as done', async () => {
		const doFetch = vi
			.fn()
			.mockResolvedValueOnce(
				new Response('{"output": "cut o', { headers: { 'content-type': 'application/json' } })
			)
			.mockResolvedValueOnce(json({ unexpected: true }));
		const set = nodeToolSet('/goose/v1', [tool('bolt11_send')], doFetch);
		const cut = await set.run('bolt11_send', {});
		expect(cut).toMatch(/^Unknown outcome: the gateway's answer could not be read/);
		expect(set.report('bolt11_send', {}, cut)).toMatch(/outcome unknown/);
		expect(await set.run('bolt11_send', {})).toMatch(/^Unknown outcome: /);
	});

	it('treats a refused request as a failure', async () => {
		const doFetch = vi.fn().mockResolvedValue(json({ error: { message: 'no tools' } }, 404));
		const set = nodeToolSet('/goose/v1', [tool('bolt11_send')], doFetch);
		expect(await set.run('bolt11_send', {})).toBe('Error: no tools');
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

	describe('binding to the dashboard node', () => {
		const listing = json({ tools: [tool('get_node_info'), tool('bolt11_send')] });
		const gateway = (nodeId: string) =>
			vi.fn(async (input: RequestInfo | URL) =>
				String(input).endsWith('/tools')
					? listing.clone()
					: json({ output: JSON.stringify({ node_id: nodeId }), is_error: false })
			);

		it('uses the node tools when the gateway drives the dashboard node', async () => {
			const set = await nodeToolsFor('/goose/v1', '02aa', gateway('02aa') as typeof fetch);
			expect(set?.source).toBe('node');
		});

		it('keeps the built-in tools when the gateway drives another node', async () => {
			expect(await nodeToolsFor('/goose/v1', '02aa', gateway('03bb') as typeof fetch)).toBeNull();
		});

		it('keeps the built-in tools until the dashboard node is known', async () => {
			const doFetch = gateway('02aa');
			expect(await nodeToolsFor('/goose/v1', undefined, doFetch as typeof fetch)).toBeNull();
			expect(doFetch).not.toHaveBeenCalled();
		});
	});
});
