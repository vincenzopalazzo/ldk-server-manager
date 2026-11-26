import { describe, expect, it } from 'vitest';
import { macaroonFromText, macaroonTextError } from './macaroon-file';

const hex =
	'0201000207746573742d69640002177065726d697373696f6e73203d206e6f64653a7265616400000620fcd6db26ff34eca91e70ec1822ebb0e5ebb0ba3968cdb6544b900d9142a57659';

describe('macaroon file text', () => {
	it('accepts the hex text and ignores a trailing newline', () => {
		expect(macaroonFromText(`${hex}\n`)).toBe(hex);
		expect(macaroonTextError(hex)).toBeNull();
	});

	it('rejects an old API key and a file that is not hex', () => {
		expect(macaroonTextError('ab'.repeat(32))).toMatch(/hex text/);
		expect(() => macaroonFromText('not a macaroon')).toThrow(/hex text/);
		expect(macaroonTextError('02abc')).toMatch(/hex text/);
	});
});
