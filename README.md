# LDK Server Manager

A fully client-side web UI for operating an [ldk-server](https://github.com/lightningdevkit/ldk-server)
Lightning node: balances, channels, peers, payments, invoices, and the live event feed.

Built with Svelte 5, SvelteKit (static adapter, SPA mode) and TypeScript. Nothing runs on a
backend: the browser talks to your node directly and the API key never leaves your machine
(it is stored in `localStorage` and used to HMAC-sign each request).

## Repository layout

| Path                        | Purpose                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/web`                  | The SvelteKit application (routes, page-level state, data layer).                        |
| `packages/ui`               | `@ldk-server-manager/ui`: the Svelte component library and design tokens used by the app. |
| `packages/client`           | `@ldk-server-manager/client`: typed ldk-server client (generated protobuf + gRPC-Web + HMAC). |
| `contrib/grpc-web-bridge`   | Envoy configuration that bridges browsers (gRPC-Web) to ldk-server (native gRPC).        |
| `contrib/goose-assistant`   | Optional sidecar running the assistant through the goose SDK (holds the model credential). |

Separation of concerns:

- **client** knows the ldk-server wire protocol and nothing about UI.
- **ui** knows how things look and nothing about ldk-server.
- **web** wires the two together: connection settings, reactive resources, routes.

## Getting started

```bash
pnpm install
pnpm dev            # http://localhost:5173
```

Other scripts: `pnpm check` (svelte-check + tsc), `pnpm test`, `pnpm lint`, `pnpm build`
(static output in `apps/web/build`), `pnpm generate` (regenerate protobuf types from
`packages/client/proto`).

## Connecting to a real node

ldk-server exposes native gRPC over HTTP/2 with TLS. Browsers cannot read HTTP/2 trailers,
so a gRPC-Web bridge has to sit between the page and the node. The request body bytes are
identical in gRPC and gRPC-Web, so the HMAC signature computed in the browser remains valid
through the bridge.

1. Start ldk-server. It generates two things you need: the API key at
   `<storage_dir>/<network>/api_key` (32 raw bytes — read it as hex with
   `xxd -p -c 64 ~/.ldk-server/bitcoin/api_key`) and the certificate at `<storage_dir>/tls.crt`.
2. Start the bridge:

   ```bash
   cd contrib/grpc-web-bridge
   cp /path/to/ldk-server/storage/tls.crt ./ldk-server-tls.crt
   LDK_SERVER_HOST=host.docker.internal LDK_SERVER_PORT=3536 docker compose up
   ```

3. Open the web app, enter the bridge URL (`http://localhost:8080`) and the API key.

Any other gRPC-Web capable proxy (e.g. `grpcwebproxy`, or a reverse proxy with the same
filter) works as long as it forwards the `x-auth` header unchanged and exposes the
`grpc-status` / `grpc-message` headers to the browser.

The bridge is a workaround, not a design goal. Three things in ldk-server make it necessary:
the gRPC status is delivered in HTTP/2 trailers, which browsers cannot read; the server
rejects the `application/grpc-web+proto` content type; and it sends no CORS headers. If
ldk-server accepted gRPC-Web directly, this app would talk to a node with no proxy in
between and no code change here, because the request bytes the browser signs are identical
either way. That is proposed upstream in
[lightningdevkit/ldk-server#296](https://github.com/lightningdevkit/ldk-server/issues/296).

## Design

The UI is implemented 1-to-1 from the Claude Design project "LDK Server UI"
(`LDK Server UI.dc.html`). `packages/ui/src/lib/styles/tokens.css` carries the design tokens
verbatim, and every component keeps the sizes, paddings and colors of its counterpart.

Where the design showed mock data that the ldk-server API cannot provide, the implementation
binds the closest real signal instead:

| Design                              | Implementation                                                          |
| ----------------------------------- | ----------------------------------------------------------------------- |
| "2 UTXOs · all confirmed"           | spendable balance and anchor reserve from `GetBalances`                 |
| "Fees earned · 30d" sparkline       | computed from `ListForwardedPayments`; falls back to all-time stats     |
| Peer aliases                        | resolved from the gossip graph (`GraphGetNode`), cached per node        |
| Alias search when opening a channel | lookup by node id (the API has no alias index)                          |
| "Buy from an LSP" (LSPS1 quote)     | LSPS2 just-in-time channel invoice (`Bolt11ReceiveViaJitChannel`)       |
| Settings "Version" / "Rotate key"   | best block, sync timestamps, and the bridge connection form             |
| Assistant (`window.claude`)         | Claude API called from the browser with a key stored only locally        |

## Assistant

The drawer can answer questions about the node and run operations on it. Three providers ship
today, chosen per browser along with the model:

| Provider       | Runs through                          | Credential                                        |
| -------------- | ------------------------------------- | ------------------------------------------------- |
| goose (local)  | goose SDK in a loopback sidecar       | held by goose; nothing pasted in the browser      |
| Grok (xAI)     | `https://api.x.ai/v1` from the page   | an xAI API key, or an X subscription access token |
| Claude         | Anthropic Messages API from the page  | an Anthropic API key                              |

### goose (default)

`goose (local)` runs the turn through the [goose SDK](https://github.com/aaif-goose/goose/tree/main/crates/goose-sdk)
(GDK) in the sidecar under `contrib/goose-assistant`.

`goose-sdk` is a Rust crate whose bindings are generated by UniFFI for Python and Kotlin; there
is no JavaScript or WASM target, so it cannot be imported into a browser-only page. The sidecar
runs it out of process and speaks JSON over loopback. Start it once:

```bash
cd contrib/goose-assistant
pip install -r requirements.txt
python server.py                 # http://127.0.0.1:8791
```

Nothing is pasted into the browser: goose owns the credential. It uses `$XAI_API_KEY`, or the
token written by `goose configure` -> `xai_oauth`, and **renews an expiring X subscription
token** — before a request when the expiry is close, and again if xAI rejects the token anyway
(the recorded expiry is not reliable on its own), retrying once. That is the main reason to
prefer it over the direct provider below, where an expired token means pasting a new one.

### Direct xAI

`Grok (xAI)` calls `https://api.x.ai/v1` straight from the page, with no sidecar. It mirrors
goose's `xai` / `xai_oauth` providers: same host, same model list, same
`Authorization: Bearer <token>` header. Paste either an API key or a subscription token:

```bash
jq -r .access_token ~/.config/goose/xai_oauth/tokens.json
```

Subscription tokens expire and the browser cannot refresh them, because `auth.x.ai` sends no
CORS headers, so the OAuth exchange cannot happen in a page. Re-paste when Grok starts
rejecting requests, use an API key, or run the goose sidecar and forget about it.

### Tool approval

The assistant can create invoices, send payments and open channels. Anything that moves funds
is never executed on the model's say-so: the call is shown to the operator with a plain-English
summary and runs only after Approve. A decline is fed back to the model as a tool result so it
can respond instead of silently retrying. `agent.test.ts` pins this behaviour, including the
case where a risky call arrives alongside a harmless one.

## Deploying

The production build is a folder of static files, so any static host works. This repo is set up
for Cloudflare Pages, live at **https://ldk-server-manager.pages.dev**.

Deploy the current working tree:

```bash
pnpm run deploy
```

### Continuous integration

Cloudflare Pages is the quality gate for this repo: it builds every push and each pull request
gets its own preview URL, on Cloudflare's runners rather than GitHub Actions minutes. Connect the
repository once in the Cloudflare dashboard under Workers & Pages -> ldk-server-manager ->
Settings -> Builds, with:

| Setting                | Value            |
| ---------------------- | ---------------- |
| Build command          | `pnpm run ci`    |
| Build output directory | `apps/web/build` |
| Root directory         | `/`              |

`pnpm run ci` runs type checking, linting, tests and the build, so a commit that breaks any of
them fails the deployment and never reaches the site. Node is pinned by `.nvmrc`; the build image
already ships a pnpm that reads this lockfile, and `PNPM_VERSION` can pin it exactly if you want.

`.github/workflows/ci.yml` holds the same gate for GitHub Actions and is manual-only, because
Actions cannot start while the account's Actions budget is exhausted. Its header comment says how
to switch it back on.

Two details make the static output behave correctly on Pages:

- There is no top-level `404.html`, so Pages serves `index.html` for unmatched paths and
  client-side routing works on a hard refresh of e.g. `/channels`.
- `apps/web/static/_headers` sets the framing, sniffing, referrer and permissions headers, and
  marks hashed bundles immutable. The page-level content security policy is generated by
  SvelteKit with a hash for its inline bootstrap script; `connect-src` deliberately allows any
  HTTPS origin plus localhost, because the node bridge is whatever URL you enter.

## Security notes

- Treat the API key like a wallet password: anyone holding it can move funds.
- Serve the app and the bridge over HTTPS when they are not on `localhost`; WebCrypto
  (used for HMAC) is only available in secure contexts.
- The app never stores anything besides the connection settings.

## License

MIT
