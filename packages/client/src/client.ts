import type { DescMethodUnary, MessageInitShape, MessageShape } from '@bufbuild/protobuf';
import { LightningNode } from './gen/api_pb.js';
import type { EventEnvelope } from './gen/events_pb.js';
import { GrpcWebTransport, type TransportOptions } from './transport.js';

type Methods = typeof LightningNode.method;
type UnaryMethodNames = {
	[K in keyof Methods]: Methods[K]['methodKind'] extends 'unary' ? K : never;
}[keyof Methods];

type UnaryFn<K extends UnaryMethodNames> = (
	input?: MessageInitShape<Methods[K]['input']>
) => Promise<MessageShape<Methods[K]['output']>>;

/** Strongly-typed API surface: one async method per unary RPC, camelCased. */
export type LdkServerApi = { [K in UnaryMethodNames]: UnaryFn<K> };

export interface LdkServerClientOptions extends TransportOptions {}

/**
 * High-level ldk-server client. All unary RPCs are exposed as methods
 * (e.g. `client.getNodeInfo()`, `client.listChannels()`), plus
 * `subscribeEvents()` for the server-streaming event feed.
 */
export class LdkServerClient {
	readonly transport: GrpcWebTransport;
	readonly api: LdkServerApi;

	constructor(opts: LdkServerClientOptions) {
		this.transport = new GrpcWebTransport(opts);
		this.api = buildApi(this.transport);
	}

	/** Subscribe to the real-time event stream. Iterate until aborted. */
	subscribeEvents(signal?: AbortSignal): AsyncGenerator<EventEnvelope> {
		return this.transport.serverStream(LightningNode.method.subscribeEvents, {}, signal);
	}
}

function buildApi(transport: GrpcWebTransport): LdkServerApi {
	const api: Partial<Record<string, unknown>> = {};
	for (const method of LightningNode.methods) {
		if (method.methodKind !== 'unary') continue;
		const unary = method as DescMethodUnary;
		api[method.localName] = (input: Record<string, unknown> = {}) => transport.unary(unary, input);
	}
	return api as LdkServerApi;
}
