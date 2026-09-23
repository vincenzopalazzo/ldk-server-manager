import type { ObjectSchema, ToolSet, ToolSpec } from './tools';

/**
 * The node's own tools, from ldk-server-mcp through the goose gateway.
 *
 * With `GOOSE_GATEWAY_MCP_COMMAND` set, the gateway lists an MCP server's tools at
 * `{host}/tools` and runs one at `POST {host}/tools/{name}`. It does no approval of its own:
 * deciding what runs stays here, in the same agent loop and approval prompt as the built-in
 * tools. That makes the list below the safety boundary, so it names what may run unasked and
 * everything else waits, including tools added to the server after this was written.
 */

/** A tool as the gateway lists it. */
export interface GatewayTool {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
	/** MCP's readOnlyHint, when the server gives one. */
	read_only?: boolean;
	destructive?: boolean;
}

/**
 * ldk-server-mcp tools that run without asking: they read, or they create a request for
 * someone else to pay (an address, an invoice, an offer) and move nothing. Paying, opening,
 * closing, splicing, signing, connecting peers, JIT-channel invoices (which can cost an LSP
 * fee) and anything unknown need approval.
 */
const RUNS_UNASKED = new Set([
	'get_node_info',
	'get_balances',
	'list_channels',
	'list_payments',
	'get_payment_details',
	'list_peers',
	'list_forwarded_payments',
	'get_forwarded_payment_details',
	'get_forwarded_payment_tracking_mode',
	'get_channel_forwarding_stats',
	'list_channel_forwarding_stats',
	'list_channel_pair_forwarding_stats',
	'decode_invoice',
	'decode_offer',
	'verify_signature',
	'graph_list_channels',
	'graph_get_channel',
	'graph_list_nodes',
	'graph_get_node',
	'onchain_receive',
	'bolt11_receive',
	'bolt12_receive'
]);

/** `…/goose/v1` or `http://127.0.0.1:8791/v1/` -> `…/v1/tools`. */
export function toolsUrl(host: string): string {
	return `${host.trim().replace(/\/+$/, '').replace(/\/v1$/, '')}/v1/tools`;
}

/**
 * The gateway's tools, or null when it serves none (not configured, an older gateway, or
 * unreachable), in which case the assistant keeps its built-in tools.
 */
export async function loadNodeTools(
	host: string,
	doFetch: typeof fetch = (input, init) => globalThis.fetch(input, init),
	/** A turn waits on this, so a gateway that never answers must not hang the assistant. */
	timeoutMs = 5000
): Promise<GatewayTool[] | null> {
	try {
		const res = await doFetch(toolsUrl(host), {
			cache: 'no-store',
			signal: AbortSignal.timeout(timeoutMs)
		});
		if (!res.ok) return null;
		const body = (await res.json()) as { tools?: unknown };
		if (!Array.isArray(body.tools)) return null;
		const tools = body.tools.filter(
			(t): t is GatewayTool =>
				!!t && typeof t === 'object' && typeof (t as GatewayTool).name === 'string'
		);
		return tools.length > 0 ? tools : null;
	} catch {
		return null;
	}
}

export function runsUnasked(tool: Pick<GatewayTool, 'name' | 'read_only'>): boolean {
	return RUNS_UNASKED.has(tool.name) || tool.read_only === true;
}

/** Every provider wants an object schema with `properties`. */
function objectSchema(parameters: Record<string, unknown>): ObjectSchema {
	return {
		...parameters,
		type: 'object',
		properties: (parameters.properties ?? {}) as Record<string, unknown>
	};
}

const clip = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n)}…` : s);
const sats = (n: number) => `${n.toLocaleString('en-US')} sats`;

/** "bolt11_send: invoice lnbc1…, amount 1,000 sats" — the arguments as the model sent them. */
export function describeNodeCall(name: string, input: Record<string, unknown>): string {
	const args = Object.entries(input)
		.filter(([, v]) => v !== undefined && v !== null && v !== '')
		.map(([k, v]) => {
			if (typeof v === 'number' && k.endsWith('_msat')) {
				return `${k.slice(0, -'_msat'.length)} ${sats(v / 1000)}`;
			}
			if (typeof v === 'number' && k.endsWith('_sats')) {
				return `${k.slice(0, -'_sats'.length)} ${sats(v)}`;
			}
			return `${k} ${clip(typeof v === 'string' ? v : JSON.stringify(v))}`;
		});
	return args.length ? `${name}: ${args.join(', ')}` : name;
}

/**
 * How a call whose result was lost reads, to the model and to the operator. It is not a
 * failure: a payment or channel open may have gone through, and reporting it as failed invites
 * a duplicate.
 */
const UNKNOWN = 'Unknown outcome: ';
const CHECK_FIRST =
	'It may have run. Check the node (payments, channels, balances) before trying again; do not retry on your own.';

export function nodeToolSet(
	host: string,
	tools: GatewayTool[],
	doFetch: typeof fetch = (input, init) => globalThis.fetch(input, init)
): ToolSet {
	const byName = new Map(tools.map((t) => [t.name, t]));
	const specs: ToolSpec[] = tools.map((t) => ({
		name: t.name,
		description: t.description,
		parameters: objectSchema(t.parameters ?? {}),
		confirm: !runsUnasked(t)
	}));
	const base = toolsUrl(host);

	return {
		source: 'node',
		specs,
		needsConfirmation: (name) => {
			const tool = byName.get(name);
			// A name the gateway never listed is not run unasked either.
			return !tool || !runsUnasked(tool);
		},
		describe: describeNodeCall,
		async run(name, input) {
			let res: Response;
			try {
				res = await doFetch(`${base}/${encodeURIComponent(name)}`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(input ?? {})
				});
			} catch (e) {
				// The request may have reached the node before the connection broke.
				const why = e instanceof Error ? e.message : String(e);
				return `${UNKNOWN}the connection to the gateway broke (${why}). ${CHECK_FIRST}`;
			}
			const body = (await res.json().catch(() => null)) as {
				output?: unknown;
				is_error?: unknown;
				error?: { message?: unknown };
			} | null;
			const why = String(body?.error?.message ?? `HTTP ${res.status}`);
			// A 5xx (the MCP server failing mid-call, or the 2-minute timeout) can follow a call
			// that ran; a 4xx means the gateway refused it before calling anything.
			if (res.status >= 500) return `${UNKNOWN}${why}. ${CHECK_FIRST}`;
			if (!res.ok) return `Error: ${why}`;
			const output = typeof body?.output === 'string' ? body.output : '';
			return body?.is_error === true ? `Error: ${output}` : output || '(no output)';
		},
		report: (name, input, output) => {
			const call = describeNodeCall(name, input);
			if (output.startsWith(UNKNOWN))
				return `${call}: outcome unknown. ${output.slice(UNKNOWN.length)}`;
			if (output.startsWith('Error: ')) return `${call} failed. ${output.slice('Error: '.length)}`;
			return `Done: ${call}.`;
		}
	};
}

/**
 * The node's tools, but only when the gateway's MCP server drives the same node this dashboard
 * is connected to: the model's snapshot comes from the dashboard's node, so tools acting on
 * another one would read and spend somewhere the operator is not looking. Null (use the
 * built-in tools, which go through the dashboard's own connection) when the gateway serves no
 * tools, the dashboard's node is not known yet, or the two differ.
 */
export async function nodeToolsFor(
	host: string,
	dashboardNodeId: string | undefined,
	doFetch: typeof fetch = (input, init) => globalThis.fetch(input, init)
): Promise<ToolSet | null> {
	if (!dashboardNodeId) return null;
	const tools = await loadNodeTools(host, doFetch);
	if (!tools?.some((t) => t.name === 'get_node_info')) return null;
	const set = nodeToolSet(host, tools, doFetch);
	const info = await set.run('get_node_info', {});
	try {
		const nodeId = (JSON.parse(info) as { node_id?: unknown }).node_id;
		return nodeId === dashboardNodeId ? set : null;
	} catch {
		return null;
	}
}
