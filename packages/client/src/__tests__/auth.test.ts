import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { buildAuthHeader, computeAuthHmac, timestampToBytes } from '../auth.js';

describe('auth', () => {
	it('encodes timestamps as big-endian u64', () => {
		expect([...timestampToBytes(1)]).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
		expect([...timestampToBytes(0x0102030405)]).toEqual([0, 0, 0, 1, 2, 3, 4, 5]);
	});

	it('matches the reference HMAC-SHA256(api_key, ts_be || body)', async () => {
		const apiKey = 'super-secret';
		const ts = 1_700_000_000;
		const body = new Uint8Array([0, 0, 0, 0, 3, 1, 2, 3]);
		const expected = createHmac('sha256', apiKey)
			.update(Buffer.from(timestampToBytes(ts)))
			.update(Buffer.from(body))
			.digest('hex');
		expect(await computeAuthHmac(apiKey, ts, body)).toBe(expected);
	});

	it('formats the x-auth header', async () => {
		const header = await buildAuthHeader('k', new Uint8Array([1]), () => 1_700_000_000_999);
		expect(header).toMatch(/^HMAC 1700000000:[0-9a-f]{64}$/);
	});
});
