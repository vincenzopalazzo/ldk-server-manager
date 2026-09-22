import { describe, expect, it } from 'vitest';
import {
	formatBtc,
	formatMsat,
	formatSats,
	msatToSats,
	parseSats,
	percent,
	ppmToPercent,
	relativeTime,
	truncateId
} from './format';

describe('format', () => {
	it('converts msat to sats', () => {
		expect(msatToSats(1999n)).toBe(1n);
		expect(msatToSats(undefined)).toBe(0n);
	});
	it('formats sats and msat', () => {
		expect(formatSats(1234567n)).toBe('1,234,567 sats');
		expect(formatMsat(1234567000n)).toBe('1,234,567 sats');
	});
	it('formats btc', () => {
		expect(formatBtc(123456789n)).toBe('1.23456789 BTC');
		expect(formatBtc(1n)).toBe('0.00000001 BTC');
	});
	it('truncates ids', () => {
		expect(truncateId('0123456789abcdef0123')).toBe('01234567…ef0123');
		expect(truncateId('short')).toBe('short');
	});
	it('relative time', () => {
		const now = 1_700_000_000_000;
		expect(relativeTime(1_700_000_000 - 120, now)).toBe('2 min ago');
		expect(relativeTime(0, now)).toBe('—');
	});
	it('percent and ppm', () => {
		expect(percent(50n, 200n)).toBe(25);
		expect(percent(1n, 0n)).toBe(0);
		expect(ppmToPercent(1000)).toBe('0.10%');
	});
	it('parses sats', () => {
		expect(parseSats('1,000')).toBe(1000n);
		expect(parseSats('12.5')).toBeNull();
	});
});
