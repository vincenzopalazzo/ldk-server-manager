import type { ToolSpec } from '../tools';

export type ProviderId = 'anthropic' | 'xai' | 'goose';

/** A turn in the conversation as the app stores it, independent of any provider's wire format. */
export interface ChatMessage {
	role: 'user' | 'ai';
	text: string;
}

/** A tool call the model wants to make. */
export interface ToolCall {
	id: string;
	name: string;
	input: Record<string, unknown>;
}

/** The result of a tool call, fed back to the model on the next turn. */
export interface ToolResult {
	id: string;
	name: string;
	output: string;
}

/**
 * One request to a model. `history` is the conversation so far; `resolved` carries tool
 * calls already executed in this exchange (including ones the operator approved), so the
 * provider can replay them in whatever shape its API expects.
 */
export interface Turn {
	system: string;
	history: ChatMessage[];
	tools: ToolSpec[];
	resolved: { call: ToolCall; result: ToolResult }[];
}

/** What a model returned: either prose for the user, or tool calls to run. */
export interface TurnResult {
	text: string;
	calls: ToolCall[];
	/** Set when the provider declined the request outright. */
	refused?: boolean;
}

export interface Provider {
	id: ProviderId;
	label: string;
	/** Default model when the user has not chosen one. */
	defaultModel: string;
	/** Models offered in the picker. */
	models: readonly string[];
	/** Where to get a credential, shown under the token field. */
	credentialHint: string;
	/** Base URL the provider talks to. Presets override it; the operator can too. */
	defaultHost?: string;
	/** True when the endpoint holds the credential itself and nothing must be pasted. */
	tokenOptional?: boolean;
	send(turn: Turn, opts: { token: string; model: string; host?: string }): Promise<TurnResult>;
}

/** Raised when the credential is missing, wrong or expired. */
export class ProviderAuthError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ProviderAuthError';
	}
}
