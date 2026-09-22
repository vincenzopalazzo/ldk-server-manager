/** gRPC status codes used by ldk-server. */
export enum GrpcCode {
	OK = 0,
	CANCELLED = 1,
	UNKNOWN = 2,
	INVALID_ARGUMENT = 3,
	DEADLINE_EXCEEDED = 4,
	NOT_FOUND = 5,
	ALREADY_EXISTS = 6,
	PERMISSION_DENIED = 7,
	RESOURCE_EXHAUSTED = 8,
	FAILED_PRECONDITION = 9,
	ABORTED = 10,
	OUT_OF_RANGE = 11,
	UNIMPLEMENTED = 12,
	INTERNAL = 13,
	UNAVAILABLE = 14,
	DATA_LOSS = 15,
	UNAUTHENTICATED = 16
}

export function grpcCodeName(code: number): string {
	return GrpcCode[code] ?? `CODE_${code}`;
}

/** Error raised for any failed RPC. `code` is the gRPC status code. */
export class LdkServerError extends Error {
	readonly code: number;
	readonly method: string;

	constructor(method: string, code: number, message: string) {
		super(message || grpcCodeName(code));
		this.name = 'LdkServerError';
		this.code = code;
		this.method = method;
	}

	get codeName(): string {
		return grpcCodeName(this.code);
	}

	get isAuthError(): boolean {
		return this.code === GrpcCode.UNAUTHENTICATED;
	}

	get isNetworkError(): boolean {
		return this.code === GrpcCode.UNAVAILABLE;
	}
}
