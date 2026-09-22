import { xaiProvider } from './xai';
import type { Provider } from './types';

/**
 * The assistant through the goose SDK, via the Rust gateway in `contrib/goose-gateway`.
 *
 * goose is a Rust crate with no browser target, so the gateway runs it out of process and
 * exposes the OpenAI wire format. That is the same format the xAI provider already speaks,
 * so this preset is simply that provider pointed at the gateway. The page carries no
 * goose-specific code, and nothing is pasted in: goose's own `xai_oauth` provider holds the
 * X subscription token and refreshes it.
 */
export const GOOSE_GATEWAY_HOST = 'http://127.0.0.1:8791/v1';

export const gooseProvider: Provider = {
	...xaiProvider,
	id: 'goose',
	label: 'goose (local)',
	defaultHost: GOOSE_GATEWAY_HOST,
	tokenOptional: true,
	credentialHint:
		'No token needed — goose holds the X subscription credential and refreshes it. ' +
		'Start the gateway with `docker compose up -d` (or `cargo run --release` in contrib/goose-gateway) ' +
		'after a one-time `goose configure` → xai_oauth on the host. Change the host only if you moved it.',
	send: (turn, opts) =>
		// The gateway ignores the bearer; send a placeholder so the request shape stays valid.
		xaiProvider.send(turn, {
			...opts,
			token: opts.token || 'goose',
			host: opts.host || GOOSE_GATEWAY_HOST
		})
};
