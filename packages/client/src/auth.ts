/**
 * HMAC authentication for ldk-server.
 *
 * Every request carries an `x-auth` header of the form
 * `HMAC <unix_timestamp>:<hmac_hex>` where the signature is
 * HMAC-SHA256(api_key, timestamp_be_u64 || grpc_request_body).
 *
 * The body must be the exact bytes sent on the wire, including the 5-byte gRPC frame header.
 */

const encoder = new TextEncoder();

function subtle(): SubtleCrypto {
	const c = globalThis.crypto;
	if (!c || !c.subtle) {
		throw new Error('WebCrypto is not available: ldk-server-manager requires a secure context (https or localhost)');
	}
	return c.subtle;
}

/** Encode a timestamp as an 8-byte big-endian unsigned integer. */
export function timestampToBytes(timestampSecs: number): Uint8Array {
	const out = new Uint8Array(8);
	new DataView(out.buffer).setBigUint64(0, BigInt(timestampSecs), false);
	return out;
}

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
	const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let s = '';
	for (const b of view) s += b.toString(16).padStart(2, '0');
	return s;
}

/** Compute the hex-encoded HMAC-SHA256 signature expected by ldk-server. */
export async function computeAuthHmac(apiKey: string, timestampSecs: number, body: Uint8Array): Promise<string> {
	const key = await subtle().importKey('raw', encoder.encode(apiKey), { name: 'HMAC', hash: 'SHA-256' }, false, [
		'sign'
	]);
	const ts = timestampToBytes(timestampSecs);
	const data = new Uint8Array(ts.length + body.length);
	data.set(ts, 0);
	data.set(body, ts.length);
	const sig = await subtle().sign('HMAC', key, data);
	return toHex(sig);
}

/** Build the full `x-auth` header value for a request body. */
export async function buildAuthHeader(
	apiKey: string,
	body: Uint8Array,
	now: () => number = () => Date.now()
): Promise<string> {
	const timestamp = Math.floor(now() / 1000);
	const hmac = await computeAuthHmac(apiKey, timestamp, body);
	return `HMAC ${timestamp}:${hmac}`;
}
