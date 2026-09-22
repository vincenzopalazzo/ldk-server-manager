import { sendChat, xaiProvider } from './xai';
import type { Provider } from './types';

/**
 * The assistant through the goose SDK, via the Rust gateway
 * (https://github.com/vincenzopalazzo/goose-gateway).
 *
 * goose is a Rust crate with no browser target, so the gateway runs it out of process and
 * exposes the OpenAI wire format. That is the same format the xAI provider already speaks,
 * so this preset is simply that provider pointed at the gateway. The page carries no
 * goose-specific code, and nothing is pasted in: goose's own `xai_oauth` provider holds the
 * X subscription token and refreshes it.
 *
 * Replies stream: the gateway relays goose's own message stream as server-sent events.
 */
export const GOOSE_GATEWAY_HOST = 'http://127.0.0.1:8791/v1';

export const gooseProvider: Provider = {
	...xaiProvider,
	id: 'goose',
	label: 'goose (local)',
	defaultHost: GOOSE_GATEWAY_HOST,
	tokenOptional: true,
	credentialHint:
		'No token in this browser: goose on the gateway holds the sign-in or key and refreshes it. ' +
		'Start the gateway with `docker compose up -d` from this repository.',
	send: (turn, opts) =>
		// The gateway ignores the bearer; send a placeholder so the request shape stays valid.
		sendChat(
			turn,
			{ ...opts, token: opts.token || 'goose', host: opts.host || GOOSE_GATEWAY_HOST },
			{ stream: true }
		)
};
