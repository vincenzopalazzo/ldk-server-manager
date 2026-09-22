import { describe, expect, it } from 'vitest';
import { encodeFrame, FrameReader, FLAG_TRAILERS, parseTrailers } from '../framing.js';

describe('framing', () => {
	it('encodes a data frame with a 5-byte header', () => {
		const frame = encodeFrame(new Uint8Array([9, 8, 7]));
		expect([...frame]).toEqual([0, 0, 0, 0, 3, 9, 8, 7]);
	});

	it('parses frames split across chunks', () => {
		const a = encodeFrame(new Uint8Array([1, 2]));
		const b = encodeFrame(new Uint8Array([3]), FLAG_TRAILERS);
		const all = new Uint8Array([...a, ...b]);
		const reader = new FrameReader();
		const first = reader.push(all.slice(0, 6));
		expect(first).toHaveLength(0);
		const rest = reader.push(all.slice(6));
		expect(rest).toHaveLength(2);
		expect([...rest[0].payload]).toEqual([1, 2]);
		expect(rest[1].flags & FLAG_TRAILERS).toBeTruthy();
		expect(reader.pending).toBe(0);
	});

	it('parses trailers', () => {
		const t = parseTrailers(new TextEncoder().encode('grpc-status: 9\r\ngrpc-message: no%20route\r\n'));
		expect(t.get('grpc-status')).toBe('9');
		expect(t.get('grpc-message')).toBe('no%20route');
	});
});
