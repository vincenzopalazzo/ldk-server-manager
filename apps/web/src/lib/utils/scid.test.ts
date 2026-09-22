import { describe, expect, it } from 'vitest';
import { formatScid, parseScid } from './scid';

describe('scid', () => {
	it('round-trips', () => {
		const s = parseScid('861023x1204x0')!;
		expect(formatScid(s)).toBe('861023x1204x0');
		expect(parseScid('nope')).toBeNull();
		expect(formatScid(undefined)).toBe('pending');
	});
});
