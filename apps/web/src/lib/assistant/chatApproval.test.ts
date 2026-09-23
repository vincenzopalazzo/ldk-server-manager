import { beforeEach, describe, expect, it, vi } from 'vitest';

// The node the dashboard's connection reaches; tests switch it mid-approval.
let dashboardNode = '02aa';
// When set, getNodeInfo answers from here first: the live connection moving on while the
// cached snapshot still describes the old node.
const nodeInfoAnswers: string[] = [];
vi.mock('$lib/api/client.svelte', () => ({
	requireClient: () => ({
		api: new Proxy(
			{},
			{
				get: (_t, name) =>
					name === 'getNodeInfo'
						? async () => ({ nodeId: nodeInfoAnswers.shift() ?? dashboardNode })
						: async () => ({})
			}
		)
	})
}));

const execute = vi.fn(async (calls: { id: string; name: string }[]) =>
	calls.map((call) => ({ call, result: { id: call.id, name: call.name, output: 'Payment sent.' } }))
);
let step: unknown;
vi.mock('./agent', async (importOriginal) => ({
	...(await importOriginal<typeof import('./agent')>()),
	run: vi.fn(async () => step),
	execute: (...args: unknown[]) => execute(...(args as [never]))
}));

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
	getItem: (k: string) => store.get(k) ?? null,
	setItem: (k: string, v: string) => void store.set(k, v),
	removeItem: (k: string) => void store.delete(k)
};

const payment = {
	id: 'c1',
	name: 'send_payment',
	input: { destination: 'lnbc1', amount_sats: 1000 }
};

async function proposePayment() {
	const { chat } = await import('./chat.svelte');
	const { assistantConfig } = await import('./config.svelte');
	assistantConfig.setProvider('xai');
	assistantConfig.setToken('test');
	chat.clear();
	step = { kind: 'confirm', calls: [payment], resolved: [] };
	await chat.send('pay it');
	// After approval the loop answers normally.
	step = { kind: 'done', text: 'Done.' };
	return chat;
}

describe('approving a proposed call', () => {
	beforeEach(() => {
		dashboardNode = '02aa';
		execute.mockClear();
	});

	it('runs it on the node it was proposed for', async () => {
		const chat = await proposePayment();
		expect(chat.pending?.nodeId).toBe('02aa');
		await chat.approve();
		expect(execute).toHaveBeenCalledTimes(1);
	});

	it('does not run it after the dashboard moved to another node', async () => {
		const chat = await proposePayment();
		dashboardNode = '03bb'; // the operator switched nodes with the prompt still open
		await chat.approve();
		expect(execute).not.toHaveBeenCalled();
		expect(chat.messages.at(-1)?.text).toMatch(/^Not run: /);
		expect(chat.pending).toBeNull();
	});

	it('does not run a turn on a snapshot of another node', async () => {
		const chat = await proposePayment(); // the snapshot now describes 02aa
		chat.clear();
		// The connection switched to 03bb, but the snapshot cannot catch up (still 02aa).
		nodeInfoAnswers.push('03bb', '02aa');
		step = { kind: 'confirm', calls: [payment], resolved: [] };
		await chat.send('pay it');
		expect(chat.pending).toBeNull();
		expect(chat.messages.at(-1)?.text).toMatch(/still loading the node/);
	});
});
