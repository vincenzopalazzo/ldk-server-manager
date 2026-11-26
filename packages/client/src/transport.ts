import type { DescMethodUnary, DescMethodServerStreaming, MessageInitShape, MessageShape } from '@bufbuild/protobuf';
import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { buildMacaroonHeader } from './auth.js';
import { GrpcCode, LdkServerError } from './errors.js';
import { encodeFrame, FrameReader, FLAG_TRAILERS, parseTrailers, decodeGrpcMessage } from './framing.js';

export interface TransportOptions {
	/** Base URL of the ldk-server gRPC-Web endpoint, e.g. `https://localhost:3536`. */
	baseUrl: string;
	/** Hex-encoded reusable v2 macaroon. A request-bound copy is sent on each call. */
	macaroon: string;
	/** Custom fetch implementation (defaults to globalThis.fetch). */
	fetch?: typeof fetch;
	/** Clock override, mainly for tests. Returns milliseconds since epoch. */
	now?: () => number;
	/** Per-call timeout in milliseconds for unary calls. Default 30s. */
	timeoutMs?: number;
}

const CONTENT_TYPE = 'application/grpc-web+proto';

/**
 * Minimal gRPC-Web transport with ldk-server macaroon authentication.
 *
 * ldk-server speaks native gRPC (HTTP/2 + trailers), which browsers cannot consume
 * directly. This transport emits the gRPC-Web wire format, whose request body bytes
 * are identical to native gRPC, so the request-bound macaroon computed here stays valid
 * after a gRPC-Web bridge (e.g. Envoy) translates the request.
 */
export class GrpcWebTransport {
	private readonly baseUrl: string;
	private readonly macaroon: string;
	private readonly fetchImpl: typeof fetch;
	private readonly now: () => number;
	private readonly timeoutMs: number;

	constructor(opts: TransportOptions) {
		this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
		this.macaroon = opts.macaroon;
		this.fetchImpl = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
		this.now = opts.now ?? (() => Date.now());
		this.timeoutMs = opts.timeoutMs ?? 30_000;
	}

	private async buildRequest<I extends DescMethodUnary | DescMethodServerStreaming>(
		method: I,
		input: MessageInitShape<I['input']>,
		signal?: AbortSignal
	): Promise<{ url: string; init: RequestInit }> {
		const message = create(method.input, input);
		const body = encodeFrame(toBinary(method.input, message));
		const macaroon = await buildMacaroonHeader(this.macaroon, method.name, body, this.now);
		const url = `${this.baseUrl}/${method.parent.typeName}/${method.name}`;
		return {
			url,
			init: {
				method: 'POST',
				headers: {
					'content-type': CONTENT_TYPE,
					accept: CONTENT_TYPE,
					'x-grpc-web': '1',
					macaroon
				},
				body,
				signal
			}
		};
	}

	private async send(method: string, url: string, init: RequestInit): Promise<Response> {
		let res: Response;
		try {
			res = await this.fetchImpl(url, init);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (e instanceof DOMException && e.name === 'AbortError') {
				throw new LdkServerError(method, GrpcCode.DEADLINE_EXCEEDED, 'request aborted');
			}
			throw new LdkServerError(method, GrpcCode.UNAVAILABLE, `network error: ${msg}`);
		}
		// Trailers-only responses (and non-gRPC errors from proxies) surface status in headers.
		const headerStatus = res.headers.get('grpc-status');
		if (headerStatus !== null && headerStatus !== '0') {
			throw new LdkServerError(method, Number(headerStatus), decodeGrpcMessage(res.headers.get('grpc-message')));
		}
		if (!res.ok) {
			throw new LdkServerError(method, httpToGrpc(res.status), `HTTP ${res.status} ${res.statusText}`.trim());
		}
		return res;
	}

	/** Perform a unary RPC. */
	async unary<M extends DescMethodUnary>(
		method: M,
		input: MessageInitShape<M['input']>
	): Promise<MessageShape<M['output']>> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		try {
			const { url, init } = await this.buildRequest(method, input, controller.signal);
			const res = await this.send(method.name, url, init);
			const bytes = new Uint8Array(await res.arrayBuffer());
			const reader = new FrameReader();
			let output: MessageShape<M['output']> | undefined;
			for (const frame of reader.push(bytes)) {
				if (frame.flags & FLAG_TRAILERS) {
					throwIfTrailerError(method.name, parseTrailers(frame.payload));
				} else if (output === undefined) {
					output = fromBinary(method.output, frame.payload) as MessageShape<M['output']>;
				}
			}
			if (output === undefined) {
				throw new LdkServerError(method.name, GrpcCode.INTERNAL, 'empty response from server');
			}
			return output;
		} finally {
			clearTimeout(timer);
		}
	}

	/** Perform a server-streaming RPC, yielding each message as it arrives. */
	async *serverStream<M extends DescMethodServerStreaming>(
		method: M,
		input: MessageInitShape<M['input']>,
		signal?: AbortSignal
	): AsyncGenerator<MessageShape<M['output']>> {
		const { url, init } = await this.buildRequest(method, input, signal);
		const res = await this.send(method.name, url, init);
		if (!res.body) throw new LdkServerError(method.name, GrpcCode.INTERNAL, 'response has no body');
		const reader = res.body.getReader();
		const frames = new FrameReader();
		try {
			for (;;) {
				const { value, done } = await reader.read();
				if (done) break;
				for (const frame of frames.push(value)) {
					if (frame.flags & FLAG_TRAILERS) {
						throwIfTrailerError(method.name, parseTrailers(frame.payload));
						return;
					}
					yield fromBinary(method.output, frame.payload) as MessageShape<M['output']>;
				}
			}
		} finally {
			reader.releaseLock();
		}
	}
}

function throwIfTrailerError(method: string, trailers: Map<string, string>): void {
	const status = Number(trailers.get('grpc-status') ?? '0');
	if (status !== 0) {
		throw new LdkServerError(method, status, decodeGrpcMessage(trailers.get('grpc-message')));
	}
}

function httpToGrpc(status: number): GrpcCode {
	switch (status) {
		case 400:
			return GrpcCode.INTERNAL;
		case 401:
			return GrpcCode.UNAUTHENTICATED;
		case 403:
			return GrpcCode.PERMISSION_DENIED;
		case 404:
			return GrpcCode.UNIMPLEMENTED;
		case 429:
			return GrpcCode.UNAVAILABLE;
		case 502:
		case 503:
		case 504:
			return GrpcCode.UNAVAILABLE;
		default:
			return GrpcCode.UNKNOWN;
	}
}
