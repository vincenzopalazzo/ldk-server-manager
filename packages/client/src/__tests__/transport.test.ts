import { describe, expect, it } from 'vitest';
import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { LdkServerClient, LdkServerError, GrpcCode } from '../index.js';
import { GetNodeInfoRequestSchema, GetNodeInfoResponseSchema } from '../gen/api_pb.js';
import { encodeFrame, FLAG_TRAILERS } from '../framing.js';

function grpcWebResponse(parts: Uint8Array[], headers: Record<string, string> = {}): Response {
	const total = parts.reduce((n, p) => n + p.length, 0);
	const body = new Uint8Array(total);
	let off = 0;
	for (const p of parts) {
		body.set(p, off);
		off += p.length;
	}
	return new Response(body, { status: 200, headers: { 'content-type': 'application/grpc-web+proto', ...headers } });
}

describe('LdkServerClient', () => {
	it('signs requests and decodes unary responses', async () => {
		let seen: { url: string; init: RequestInit } | undefined;
		const client = new LdkServerClient({
			baseUrl: 'https://node.example/',
			apiKey: 'key',
			now: () => 1_700_000_000_000,
			fetch: async (url, init) => {
				seen = { url: String(url), init: init! };
				const msg = create(GetNodeInfoResponseSchema, { nodeId: '02abc' });
				const trailer = new TextEncoder().encode('grpc-status: 0\r\n');
				return grpcWebResponse([encodeFrame(toBinary(GetNodeInfoResponseSchema, msg)), encodeFrame(trailer, FLAG_TRAILERS)]);
			}
		});
		const info = await client.api.getNodeInfo();
		expect(info.nodeId).toBe('02abc');
		expect(seen!.url).toBe('https://node.example/api.LightningNode/GetNodeInfo');
		const headers = seen!.init.headers as Record<string, string>;
		expect(headers['content-type']).toBe('application/grpc-web+proto');
		expect(headers['x-auth']).toMatch(/^HMAC 1700000000:[0-9a-f]{64}$/);
		const body = seen!.init.body as Uint8Array;
		expect([...body.slice(0, 5)]).toEqual([0, 0, 0, 0, 0]);
		expect(fromBinary(GetNodeInfoRequestSchema, body.slice(5))).toBeTruthy();
	});

	it('surfaces trailer errors as LdkServerError', async () => {
		const client = new LdkServerClient({
			baseUrl: 'https://node.example',
			apiKey: 'key',
			fetch: async () => {
				const trailer = new TextEncoder().encode('grpc-status: 16\r\ngrpc-message: Invalid%20HMAC\r\n');
				return grpcWebResponse([encodeFrame(trailer, FLAG_TRAILERS)]);
			}
		});
		const err = await client.api.getBalances().catch((e) => e);
		expect(err).toBeInstanceOf(LdkServerError);
		expect(err.code).toBe(GrpcCode.UNAUTHENTICATED);
		expect(err.message).toBe('Invalid HMAC');
		expect(err.isAuthError).toBe(true);
	});

	it('surfaces header-only grpc-status errors', async () => {
		const client = new LdkServerClient({
			baseUrl: 'https://node.example',
			apiKey: 'key',
			fetch: async () => grpcWebResponse([], { 'grpc-status': '14', 'grpc-message': 'upstream%20down' })
		});
		const err = await client.api.listChannels().catch((e) => e);
		expect(err.code).toBe(GrpcCode.UNAVAILABLE);
		expect(err.message).toBe('upstream down');
	});

	it('maps fetch failures to UNAVAILABLE', async () => {
		const client = new LdkServerClient({
			baseUrl: 'https://node.example',
			apiKey: 'key',
			fetch: async () => {
				throw new TypeError('Failed to fetch');
			}
		});
		const err = await client.api.listPeers().catch((e) => e);
		expect(err.code).toBe(GrpcCode.UNAVAILABLE);
		expect(err.isNetworkError).toBe(true);
	});
});
