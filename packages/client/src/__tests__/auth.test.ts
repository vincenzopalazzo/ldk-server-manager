import { describe, expect, it } from 'vitest';
import { bindMacaroonToRequest, buildMacaroonHeader } from '../auth.js';

// ldk-server-macaroons tests/data/macaroons-v2.txt, request-proof row.
const REUSABLE =
	'0201000207746573742d69640002177065726d697373696f6e73203d206e6f64653a7265616400000620fcd6db26ff34eca91e70ec1822ebb0e5ebb0ba3968cdb6544b900d9142a57659';
const BOUND_GET_NODE_INFO =
	'0201000207746573742d69640002177065726d697373696f6e73203d206e6f64653a7265616400026172657175657374203d2031383030303030303030204765744e6f6465496e666f2038383535353038616164653136656335373364323165366134383564666430613736323430383563316131346235656364643634383564653063363833396134000006206553a4b4f42f654b01b195823008752c41d0cff8247b77fbb77e4860debcc7e2';

describe('auth', () => {
	it('matches the ldk-server request-binding reference', async () => {
		const bound = await bindMacaroonToRequest(REUSABLE, 'GetNodeInfo', new Uint8Array(5), 1_800_000_000);
		expect(bound).toBe(BOUND_GET_NODE_INFO);
	});

	it('rejects a token that is already bound to a request', async () => {
		await expect(
			bindMacaroonToRequest(BOUND_GET_NODE_INFO, 'GetNodeInfo', new Uint8Array(5), 1_800_000_000)
		).rejects.toThrow(/reusable credential/);
	});

	it('rejects the old HMAC API key', async () => {
		await expect(
			bindMacaroonToRequest('ab'.repeat(32), 'GetNodeInfo', new Uint8Array(5), 1_800_000_000)
		).rejects.toThrow(/version|hexadecimal/i);
	});

	it('builds a header from the clock', async () => {
		const header = await buildMacaroonHeader(REUSABLE, 'GetNodeInfo', new Uint8Array(5), () => 1_800_000_000_999);
		expect(header).toBe(BOUND_GET_NODE_INFO);
	});
});
