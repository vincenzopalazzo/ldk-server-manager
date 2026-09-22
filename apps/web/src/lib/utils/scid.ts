/** Short channel id helpers: u64 <-> "block x tx x output". */
export function formatScid(scid: bigint | undefined | null): string {
	if (scid === undefined || scid === null) return 'pending';
	const block = scid >> 40n;
	const tx = (scid >> 16n) & 0xffffffn;
	const vout = scid & 0xffffn;
	return `${block}x${tx}x${vout}`;
}

export function parseScid(input: string): bigint | null {
	const m = /^(\d+)x(\d+)x(\d+)$/.exec(input.trim());
	if (!m) return null;
	return (BigInt(m[1]) << 40n) | (BigInt(m[2]) << 16n) | BigInt(m[3]);
}

export function isScid(input: string): boolean {
	return /^\d+x\d+x\d+$/.test(input.trim());
}
