/** Error for a macaroon that is not the hex text of admin.macaroon, or null. */
export function macaroonTextError(raw: string): string | null {
	const macaroon = raw.trim();
	if (!/^02[0-9a-f]+$/i.test(macaroon) || macaroon.length % 2 !== 0) {
		return 'Macaroon must be the hex text of admin.macaroon';
	}
	return null;
}

/**
 * Read the hex text of an `admin.macaroon` file. The file is already hex. Do not encode it again.
 * Throws the same message the connect form shows, so a bad file never reaches localStorage.
 */
export function macaroonFromText(raw: string): string {
	const err = macaroonTextError(raw);
	if (err) throw new Error(err);
	return raw.trim();
}
