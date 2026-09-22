const SATS_PER_BTC = 100_000_000n;

function toBig(v: bigint | number | string | undefined | null): bigint {
	if (v === undefined || v === null) return 0n;
	return typeof v === 'bigint' ? v : BigInt(Math.trunc(Number(v)));
}

/** Millisatoshis to whole satoshis (floor). */
export function msatToSats(msat: bigint | number | undefined | null): bigint {
	return toBig(msat) / 1000n;
}

/** Format an integer with thousands separators, e.g. 1234567 -> "1,234,567". */
export function formatInt(v: bigint | number | undefined | null): string {
	return toBig(v).toLocaleString('en-US');
}

/** Format satoshis with separators and unit, e.g. "1,234,567 sats". */
export function formatSats(sats: bigint | number | undefined | null, unit = 'sats'): string {
	return `${formatInt(sats)} ${unit}`.trim();
}

/** Format millisatoshis as satoshis. */
export function formatMsat(msat: bigint | number | undefined | null, unit = 'sats'): string {
	return formatSats(msatToSats(msat), unit);
}

/** Format satoshis as BTC with 8 decimals, e.g. "0.01234567 BTC". */
export function formatBtc(sats: bigint | number | undefined | null, decimals = 8): string {
	const s = toBig(sats);
	const whole = s / SATS_PER_BTC;
	const frac = (s % SATS_PER_BTC).toString().padStart(8, '0').slice(0, decimals);
	return decimals > 0 ? `${whole}.${frac} BTC` : `${whole} BTC`;
}

/** Shorten a hex id: "02abc...def0". */
export function truncateId(id: string | undefined | null, head = 8, tail = 6): string {
	if (!id) return '';
	if (id.length <= head + tail + 1) return id;
	return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

/** Unix seconds to locale date-time string. */
export function formatTimestamp(secs: bigint | number | undefined | null): string {
	const n = Number(toBig(secs));
	if (!n) return '—';
	return new Date(n * 1000).toLocaleString('en-US', {
		year: 'numeric',
		month: 'short',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit'
	});
}

/** Unix seconds to relative phrase like "3 min ago". */
export function relativeTime(secs: bigint | number | undefined | null, now = Date.now()): string {
	const n = Number(toBig(secs));
	if (!n) return '—';
	const diff = Math.max(0, Math.round(now / 1000 - n));
	if (diff < 5) return 'just now';
	if (diff < 60) return `${diff}s ago`;
	if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
	if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
	return `${Math.floor(diff / 86400)} d ago`;
}

/** Percentage 0-100 of `part` over `total`, safe for zero totals. */
export function percent(part: bigint | number, total: bigint | number): number {
	const t = Number(toBig(total));
	if (t === 0) return 0;
	return Math.min(100, Math.max(0, (Number(toBig(part)) / t) * 100));
}

/** Parts-per-million to percentage string, e.g. 1000 ppm -> "0.10%". */
export function ppmToPercent(ppm: number | undefined | null): string {
	return `${((ppm ?? 0) / 10_000).toFixed(2)}%`;
}

/** Parse a user-typed satoshi amount; returns null when invalid. */
export function parseSats(input: string): bigint | null {
	const cleaned = input.replace(/[,_\s]/g, '');
	if (!/^\d+$/.test(cleaned)) return null;
	return BigInt(cleaned);
}
