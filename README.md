# LDK Server Manager

A fully client-side web UI for operating an [ldk-server](https://github.com/lightningdevkit/ldk-server)
Lightning node: balances, channels, peers, payments, invoices, and the live event feed.

Built with Svelte 5, SvelteKit (static adapter, SPA mode) and TypeScript. Nothing runs on a
backend: the browser talks to your node directly and the reusable macaroon never leaves your machine
(it is stored in `localStorage`; each request sends a copy bound to that call).

## Repository layout

| Path                        | Purpose                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/web`                  | The SvelteKit application (routes, page-level state, data layer).                        |
| `packages/ui`               | `@ldk-server-manager/ui`: the Svelte component library and design tokens used by the app. |
| `packages/client`           | `@ldk-server-manager/client`: typed ldk-server client (generated protobuf + gRPC-Web + macaroons). |
| `contrib/grpc-web-bridge`   | Envoy configuration that bridges browsers (gRPC-Web) to ldk-server (native gRPC).        |
| `docker-compose.yml`        | Runs both sidecars beside the app, for a node that runs elsewhere.                       |
| `deploy/`                   | The whole stack self-hosted with Docker Compose: node, dashboard, gateway. See [deploy/README.md](deploy/README.md). |
| `docker/`                   | The small container images the stack uses. See [docker/README.md](docker/README.md).      |

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
identical in gRPC and gRPC-Web, so the request-bound macaroon computed in the browser remains valid
through the bridge.

1. Start ldk-server. It generates two things you need: the admin macaroon at
   `<storage_dir>/<network>/macaroons/admin.macaroon` (already hex text — copy it as-is, do not
   run it through `xxd`) and the certificate at `<storage_dir>/tls.crt`. The old HMAC `api_key`
   is not accepted.
2. Start the sidecars (the bridge, and the assistant gateway):

   ```bash
   cp /path/to/ldk-server/storage/tls.crt contrib/grpc-web-bridge/ldk-server-tls.crt
   LDK_SERVER_HOST=host.docker.internal LDK_SERVER_PORT=3536 docker compose up -d
   ```

3. Open the web app, enter the bridge URL (`http://localhost:8080`) and the macaroon.

Any other gRPC-Web capable proxy (e.g. `grpcwebproxy`, or a reverse proxy with the same
filter) works as long as it forwards the `macaroon` header unchanged and exposes the
`grpc-status` / `grpc-message` headers to the browser.

The bridge is a workaround, not a design goal. Three things in ldk-server make it necessary:
the gRPC status is delivered in HTTP/2 trailers, which browsers cannot read; the server
rejects the `application/grpc-web+proto` content type; and it sends no CORS headers. If
ldk-server accepted gRPC-Web directly, this app would talk to a node with no proxy in
between and no code change here, because the request bytes the browser binds into the macaroon are identical
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

The drawer can answer questions about the node and run operations on it. Pick who answers in
the **Assistant provider** panel (the drawer's "Provider" chip, or "Change provider" on the
Settings page). The choice and model are kept per browser.

| Option                     | Runs through                          | Credential                                   |
| -------------------------- | ------------------------------------- | -------------------------------------------- |
| any goose provider         | goose in the Rust gateway sidecar     | held by goose on your machine; set up in the panel |
| Grok (xAI), direct         | `https://api.x.ai/v1` from the page   | an xAI API key, kept in this browser         |
| Claude (Anthropic), direct | Anthropic Messages API from the page  | an Anthropic API key, kept in this browser   |

### Through goose (default)

The panel lists every chat provider goose supports, grouped as subscriptions (xAI SuperGrok,
ChatGPT, GitHub Copilot), API keys (Anthropic, OpenAI, Gemini, OpenRouter, Mistral…) and local
models (Ollama), with more behind a toggle. Each shows whether it is ready, and sets up in
place:

- **Subscriptions**: press Sign in. Copilot shows a code to enter on github.com. xAI and
  ChatGPT open the provider's sign-in page. With the gateway in Docker, the page you land on
  afterwards (`http://127.0.0.1:…/callback?…`) will not load; paste its address back into the
  panel and the gateway finishes the sign-in.
- **API keys and local servers**: fill in the fields and save. Keys go to the gateway and are
  stored by goose on that machine; they never come back to the page.

These talk to [goose-gateway](https://github.com/vincenzopalazzo/goose-gateway), a
small Rust service in its own repository that puts an
OpenAI-compatible endpoint in front of the [goose SDK](https://github.com/aaif-goose/goose).
Because it speaks the same wire format the Grok provider already uses, this preset is simply
that provider aimed at the gateway: the page carries no goose-specific code.

The point of it is the credential. A subscription token is an OAuth token that expires, and a
page cannot obtain or renew it (`auth.x.ai`, for one, sends no CORS headers). The gateway
uses goose's own providers, so sign-in and renewal are goose's, not a copy, and nothing is
pasted into the browser.

```bash
docker compose up -d         # from the repository root; gateway on http://127.0.0.1:8791
```

Anything set up with `goose configure` on the host (into `~/.config/goose`, which the compose
file mounts) shows up as ready too.

Replies stream. The gateway only answers browser origins it allows: localhost on any port,
plus `https://ldk-server-manager.pages.dev`, which `docker-compose.yml` adds. If you serve the
app somewhere else, set `GOOSE_GATEWAY_ALLOWED_ORIGINS` to that origin.

The gateway is a Rust binary rather than a wrapper around the Python or Kotlin bindings, for
a concrete reason: the X sign-in and refresh live in the `goose` crate, which the SDK bindings
do not include. Depending on the crate directly is what makes the refresh real. See the
[goose-gateway README](https://github.com/vincenzopalazzo/goose-gateway#readme) for its API,
building and configuration.

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

- Treat the admin macaroon like a wallet password: anyone holding it can move funds.
- Serve the app and the bridge over HTTPS when they are not on `localhost`; WebCrypto
  (used to bind each request) is only available in secure contexts.
- The bridge must allow the `macaroon` request header. A bridge that only allowed `x-auth`
  will drop the credential before it reaches the node.
- The app never stores anything besides the connection settings.

## License

MIT
