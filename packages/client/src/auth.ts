/**
 * Macaroon authentication for ldk-server.
 *
 * The reusable v2 macaroon stays in the browser. Each request sends a copy in the
 * `macaroon` header, attenuated with one caveat:
 *
 *   request = <unix_secs> <Method> <sha256(grpc_frame)>
 *
 * `Method` is the RPC name (`GetNodeInfo`). The hash covers the exact bytes on the
 * wire, including the 5-byte gRPC frame header. This matches ldk-server-macaroons.
 */

const MAX_MACAROON_BYTES = 4096;
const MAX_CAVEATS = 32;
const MAX_REQUEST_METHOD_BYTES = 128;
const REQUEST_CAVEAT_PREFIX = 'request = ';
const MAX_REQUEST_CAVEAT_BYTES = REQUEST_CAVEAT_PREFIX.length + 20 + 1 + MAX_REQUEST_METHOD_BYTES + 1 + 64;

const textEncoder = new TextEncoder();

interface ParsedMacaroon {
	location?: Uint8Array;
	identifier: Uint8Array;
	caveats: Uint8Array[];
	signature: Uint8Array;
}

function subtle(): SubtleCrypto {
	const c = globalThis.crypto;
	if (!c || !c.subtle) {
		throw new Error('WebCrypto is not available: ldk-server-manager requires a secure context (https or localhost)');
	}
	return c.subtle;
}

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
	const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let s = '';
	for (const b of view) s += b.toString(16).padStart(2, '0');
	return s;
}

function fromHex(token: string): Uint8Array {
	const clean = token.trim().toLowerCase();
	if (
		clean.length === 0 ||
		clean.length % 2 !== 0 ||
		clean.length > MAX_MACAROON_BYTES * 2 ||
		!/^[0-9a-f]+$/.test(clean)
	) {
		throw new Error('Macaroon must be hexadecimal');
	}
	const out = new Uint8Array(clean.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	return out;
}

function readVarint(data: Uint8Array, offset: number): { value: number; offset: number } {
	let value = 0;
	for (let shift = 0; shift < 35; shift += 7) {
		if (offset >= data.length) throw new Error('Truncated macaroon field');
		const byte = data[offset++];
		if (shift === 28 && byte > 7) throw new Error('Macaroon varint overflow');
		value |= (byte & 127) << shift;
		if ((byte & 128) === 0) {
			if (shift !== 0 && byte === 0) throw new Error('Noncanonical macaroon varint');
			return { value, offset };
		}
	}
	throw new Error('Macaroon varint overflow');
}

function readPacket(data: Uint8Array, offset: number): { kind: number; value: Uint8Array; offset: number } {
	const kind = readVarint(data, offset);
	if (kind.value === 0) return { kind: 0, value: new Uint8Array(), offset: kind.offset };
	const length = readVarint(data, kind.offset);
	const end = length.offset + length.value;
	if (end > data.length) throw new Error('Truncated macaroon payload');
	return { kind: kind.value, value: data.slice(length.offset, end), offset: end };
}

function parseMacaroon(bytes: Uint8Array): ParsedMacaroon {
	if (bytes.length === 0 || bytes.length > MAX_MACAROON_BYTES || bytes[0] !== 2) {
		throw new Error('Invalid macaroon size or version');
	}
	let offset = 1;
	let packet = readPacket(bytes, offset);
	offset = packet.offset;
	let location: Uint8Array | undefined;
	if (packet.kind === 1) {
		location = packet.value;
		packet = readPacket(bytes, offset);
		offset = packet.offset;
	}
	if (packet.kind !== 2 || packet.value.length === 0) throw new Error('Invalid macaroon identifier');
	const identifier = packet.value;
	const headerEnd = readPacket(bytes, offset);
	offset = headerEnd.offset;
	if (headerEnd.kind !== 0) throw new Error('Invalid macaroon header');

	const caveats: Uint8Array[] = [];
	for (;;) {
		const next = readPacket(bytes, offset);
		offset = next.offset;
		if (next.kind === 0) break;
		if (next.kind !== 2 || next.value.length === 0 || caveats.length >= MAX_CAVEATS) {
			throw new Error('Unsupported or invalid macaroon caveat');
		}
		caveats.push(next.value);
		const marker = readPacket(bytes, offset);
		offset = marker.offset;
		if (marker.kind !== 0) throw new Error('Unsupported macaroon caveat fields');
	}

	const signature = readPacket(bytes, offset);
	if (signature.kind !== 6 || signature.offset !== bytes.length || signature.value.length !== 32) {
		throw new Error('Invalid macaroon signature field');
	}
	return { location, identifier, caveats, signature: signature.value };
}

function writeVarint(out: number[], value: number) {
	let length = value;
	while (length >= 128) {
		out.push((length & 127) | 128);
		length >>= 7;
	}
	out.push(length);
}

function writePacket(out: number[], kind: number, value: Uint8Array) {
	out.push(kind);
	writeVarint(out, value.length);
	for (const byte of value) out.push(byte);
}

function serialize(macaroon: ParsedMacaroon): Uint8Array {
	const out: number[] = [2];
	if (macaroon.location) writePacket(out, 1, macaroon.location);
	writePacket(out, 2, macaroon.identifier);
	out.push(0);
	for (const caveat of macaroon.caveats) {
		writePacket(out, 2, caveat);
		out.push(0);
	}
	out.push(0);
	writePacket(out, 6, macaroon.signature);
	return Uint8Array.from(out);
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
	const cryptoKey = await subtle().importKey('raw', Uint8Array.from(key), { name: 'HMAC', hash: 'SHA-256' }, false, [
		'sign'
	]);
	return new Uint8Array(await subtle().sign('HMAC', cryptoKey, Uint8Array.from(data)));
}

function hasRequestProof(macaroon: ParsedMacaroon): boolean {
	const prefix = textEncoder.encode(REQUEST_CAVEAT_PREFIX);
	return macaroon.caveats.some((caveat) => {
		if (caveat.length < prefix.length) return false;
		return prefix.every((byte, index) => caveat[index] === byte);
	});
}

function validMethod(method: string): boolean {
	return method.length > 0 && method.length <= MAX_REQUEST_METHOD_BYTES && /^[A-Za-z0-9]+$/.test(method);
}

/**
 * Bind a reusable hex macaroon to one RPC. `timestampSecs` is Unix time.
 * The server accepts the result for about 60 seconds, and only for this method and body.
 */
export async function bindMacaroonToRequest(
	token: string,
	method: string,
	body: Uint8Array,
	timestampSecs: number
): Promise<string> {
	if (!validMethod(method)) throw new Error('Invalid request method');
	if (!Number.isSafeInteger(timestampSecs) || timestampSecs < 0) throw new Error('Invalid request timestamp');
	const parsed = parseMacaroon(fromHex(token));
	if (hasRequestProof(parsed)) {
		throw new Error('A request-bound macaroon cannot be used as a reusable credential');
	}
	if (
		parsed.caveats.length >= MAX_CAVEATS ||
		serialize(parsed).length + MAX_REQUEST_CAVEAT_BYTES + 4 > MAX_MACAROON_BYTES
	) {
		throw new Error('Macaroon has no room for a request binding caveat');
	}
	const bodyHash = new Uint8Array(await subtle().digest('SHA-256', Uint8Array.from(body)));
	const caveat = textEncoder.encode(`${REQUEST_CAVEAT_PREFIX}${timestampSecs} ${method} ${toHex(bodyHash)}`);
	const bound: ParsedMacaroon = {
		location: parsed.location,
		identifier: parsed.identifier,
		caveats: [...parsed.caveats, caveat],
		signature: await hmacSha256(parsed.signature, caveat)
	};
	return toHex(serialize(bound));
}

/** Hex token for the `macaroon` header. */
export async function buildMacaroonHeader(
	token: string,
	method: string,
	body: Uint8Array,
	now: () => number = () => Date.now()
): Promise<string> {
	return bindMacaroonToRequest(token, method, body, Math.floor(now() / 1000));
}
