/**
 * gRPC / gRPC-Web length-prefixed message framing.
 *
 * Frame layout: 1 byte flags, 4 bytes big-endian payload length, payload.
 * Flags: 0x00 = data frame, 0x80 = trailers frame (gRPC-Web only).
 */

export const FLAG_DATA = 0x00;
export const FLAG_TRAILERS = 0x80;

export interface Frame {
	flags: number;
	payload: Uint8Array;
}

export function encodeFrame(payload: Uint8Array, flags = FLAG_DATA): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(5 + payload.length);
	out[0] = flags;
	new DataView(out.buffer).setUint32(1, payload.length, false);
	out.set(payload, 5);
	return out;
}

/**
 * Incremental frame parser. Feed it chunks, pull out complete frames.
 */
export class FrameReader {
	private buffer = new Uint8Array(0);

	push(chunk: Uint8Array): Frame[] {
		const merged = new Uint8Array(this.buffer.length + chunk.length);
		merged.set(this.buffer, 0);
		merged.set(chunk, this.buffer.length);
		this.buffer = merged;

		const frames: Frame[] = [];
		while (this.buffer.length >= 5) {
			const flags = this.buffer[0];
			const len = new DataView(this.buffer.buffer, this.buffer.byteOffset).getUint32(1, false);
			if (this.buffer.length < 5 + len) break;
			frames.push({ flags, payload: this.buffer.slice(5, 5 + len) });
			this.buffer = this.buffer.slice(5 + len);
		}
		return frames;
	}

	get pending(): number {
		return this.buffer.length;
	}
}

/** Parse a gRPC-Web trailers frame payload (`key: value\r\n` lines) into a map. */
export function parseTrailers(payload: Uint8Array): Map<string, string> {
	const text = new TextDecoder().decode(payload);
	const out = new Map<string, string>();
	for (const line of text.split(/\r?\n/)) {
		const idx = line.indexOf(':');
		if (idx <= 0) continue;
		out.set(line.slice(0, idx).trim().toLowerCase(), line.slice(idx + 1).trim());
	}
	return out;
}

/** Percent-decode a `grpc-message` value. */
export function decodeGrpcMessage(value: string | null | undefined): string {
	if (!value) return '';
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}
