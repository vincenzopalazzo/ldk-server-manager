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
| `docker-compose.yml`        | Sidecars for `pnpm dev`, when the node runs elsewhere.                                    |
| `docker-compose.run.yml`    | Builds this dashboard and the bridge. The supported way to run this source.              |
| `docker-compose.pages.yml`  | Publishes only the bridge on loopback, for the Pages site over Tailscale.                |
| `deploy/`                   | The whole stack self-hosted with Docker Compose: node, dashboard, gateway. See [deploy/README.md](deploy/README.md). |
| `docker/`                   | The small container images the stack uses. See [docker/README.md](docker/README.md).      |

Separation of concerns:

- **client** knows the ldk-server wire protocol and nothing about UI.
- **ui** knows how things look and nothing about ldk-server.
- **web** wires the two together: connection settings, reactive resources, routes.

## Getting started

Run the dashboard from this checkout against a macaroon-speaking ldk-server.
The page binds to this machine only. Copy the node's certificate first. Do not
commit it, and do not put `admin.macaroon` in the compose file.

```bash
cp /path/to/ldk-server/tls.crt contrib/grpc-web-bridge/ldk-server-tls.crt
LDK_SERVER_HOST=127.0.0.1 LDK_SERVER_PORT=3536 docker compose -f docker-compose.run.yml up -d --build
```

Open http://127.0.0.1:8080 and choose `<storage_dir>/<network>/macaroons/admin.macaroon`.
The file is already hex text. The assistant is goose on http://127.0.0.1:8791,
which the page uses by default. Sign in from its panel. Sign-ins stay in
`data/goose`. The published `0.1.0` images still speak the old API key, and the
published `ldk-server-mcp` still reads that key, so this compose does not give
goose the node's tools. Do not point this page at a `0.1.0` node.

For UI work without the container:

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
2. Start the dashboard and bridge with `docker-compose.run.yml`, as above.
   `docker compose up -d` without `-f docker-compose.run.yml` starts only the
   sidecars used by `pnpm dev`, including the assistant gateway. To use the
   hosted page instead of this dashboard, follow
   [Pages site over Tailscale](#pages-site-over-tailscale).
3. Open http://127.0.0.1:8080 and choose the macaroon file. When using
   `pnpm dev`, the bridge URL is `http://127.0.0.1:8080` and the page is
   http://127.0.0.1:5173.

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

### Pages site over Tailscale

The site at https://ldk-server-manager.pages.dev is only the page. It cannot
speak to ldk-server. Browsers do not speak native gRPC, and a page on HTTPS
will not call `http://100.x.x.x` (mixed content) or a self-signed certificate
(`fetch` fails; there is no proceed button). Run the bridge from this repo on
a machine that can dial the node, put Tailscale HTTPS in front of it, then
paste that name and the macaroon into the page.

Do not point the page at port `3536`. Do not start `web` for this path. Do not
use `tailscale funnel`: that would put the bridge on the public internet.

1. Copy the node's certificate. It must name the host Envoy dials. A
   certificate issued for a public IP will not verify a Tailscale name, and
   the reverse.

   ```bash
   cp /path/to/ldk-server/tls.crt contrib/grpc-web-bridge/ldk-server-tls.crt
   ```

2. Publish the bridge on loopback only. `docker-compose.pages.yml` binds
   `127.0.0.1:8085`. Do not change that to `0.0.0.0`.

   ```bash
   LDK_SERVER_HOST=<node host> LDK_SERVER_PORT=3536 \
     docker compose -f docker-compose.run.yml -f docker-compose.pages.yml \
     up -d --no-deps grpc-web-bridge
   docker compose -f docker-compose.run.yml stop web
   ```

   `--no-deps` is what keeps the dashboard container from starting. `stop web`
   matters if an earlier `up` already started it.

   From that machine, a call with no macaroon must reach the node:

   ```bash
   curl -sD - -o /dev/null -X POST \
     http://127.0.0.1:8085/api.LightningNode/GetNodeInfo \
     -H 'content-type: application/grpc-web+proto' -H 'x-grpc-web: 1' \
     --data-binary ''
   ```

   Expect `grpc-status: 16` and `Missing macaroon credentials`. That is the
   node answering. Connection refused means the bridge is not published. No
   `grpc-status` header means Envoy did not reach the node (host, port, or
   certificate name).

3. Turn on Tailscale HTTPS for the tailnet if `tailscale serve` says it is not
   enabled. The command prints the admin-console link. Then replace whatever
   this node was already serving on 443:

   ```bash
   sudo tailscale serve --bg --yes 8085
   tailscale serve status
   ```

   `serve config denied` means this user is not the Tailscale operator. Run it
   with `sudo`, or once: `sudo tailscale set --operator=$USER`.

   Status should show `https://<hostname>.<tailnet>.ts.net/` proxying
   `http://127.0.0.1:8085`, tailnet only.

4. On each machine that will open the page, that name has to resolve. If
   `tailscale dns status` says Tailscale DNS is disabled:

   ```bash
   tailscale set --accept-dns=true
   ```

   The phone has to be connected to the tailnet. The bridge is not reachable
   from the public internet.

   Check the name from the client, not only from the bridge host:

   ```bash
   curl -sD - -o /dev/null -X POST \
     https://<hostname>.<tailnet>.ts.net/api.LightningNode/GetNodeInfo \
     -H 'content-type: application/grpc-web+proto' -H 'x-grpc-web: 1' \
     -H 'origin: https://ldk-server-manager.pages.dev' \
     --data-binary ''
   ```

   Expect `grpc-status: 16` and
   `access-control-allow-origin: https://ldk-server-manager.pages.dev`.
   The bridge already allows that origin and forwards the `macaroon` header.

5. Open https://ldk-server-manager.pages.dev.

   - **Server URL:** `https://<hostname>.<tailnet>.ts.net` — no port.
   - **Macaroon:** the hex text of `admin.macaroon`. Paste it into the
     Macaroon field. Do not put it in the address.

   ```bash
   cat <storage_dir>/<network>/macaroons/admin.macaroon
   ```

   The file is already hex. Do not run it through `xxd`, and do not hex-encode
   it again. Then press Connect.

   A network error after a correct paste is the name, Tailscale, or an `http://`
   URL. `Missing macaroon credentials` means the hex never arrived. Any other
   gRPC error is the node rejecting that macaroon.

### Assistant over the same tailnet

On Pages the assistant does not call `/goose/v1` on `pages.dev`. That path
exists only when nginx and the gateway share an origin. Point it at the
gateway on its own Tailscale HTTPS port. Do not use `http://127.0.0.1:8791`
from the Pages site: that is this browser's machine, not the bridge host.

`docker-compose.run.yml` already publishes the gateway on loopback
(`127.0.0.1:${GOOSE_PORT:-8791}`). Allow the Pages origin, then serve that
port. This replaces whatever this node was already serving on 8443, not the
bridge on 443.

```bash
# in .env, next to the node host
GOOSE_GATEWAY_ALLOWED_ORIGINS=https://ldk-server-manager.pages.dev
docker compose -f docker-compose.run.yml up -d --no-deps goose-gateway
sudo tailscale serve --bg --https=8443 --yes ${GOOSE_PORT:-8791}
```

In the page, open Assistant provider and set the gateway address to
`https://<hostname>.<tailnet>.ts.net:8443/v1`. Save. The health line should
stop saying the gateway is unreachable.

Sign in from that panel. The credential stays on the gateway machine, not in
the browser. A headless or remote gateway falls back to a device code: finish
the provider's page, and if the callback address is `http://127.0.0.1:…`,
paste that address back into the panel. Until that sign-in exists, the
gateway answers and lists models, but the page says it is not set up.

### Continuous integration

A merge to `main` deploys the site. `.github/workflows/ci.yml` runs `pnpm run ci` on pull
requests and on every push to `main`. When that push is to `main` and the gate passes, the same
job uploads `apps/web/build` to the Cloudflare Pages project `ldk-server-manager`.

That project is a direct upload. It is not connected to GitHub, so Cloudflare does not build on
push by itself. The push and pull request triggers were off while this repo was private and the
Actions budget was exhausted; a push then failed the job before any step. The repo is public, so
the triggers are on again.

The upload needs two repository settings, and it fails closed without them:

| Name                     | Kind     | Value                                      |
| ------------------------ | -------- | ------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`   | secret   | API token with Cloudflare Pages Edit       |
| `CLOUDFLARE_ACCOUNT_ID`  | variable | Account that owns `ldk-server-manager`     |

`pnpm run ci` runs type checking, linting, tests and the build, so a commit that breaks any of
them never reaches the site. Node is pinned by `.nvmrc`.

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
- Do not publish the Pages bridge on `0.0.0.0`, and do not put it on the public
  internet with `tailscale funnel`. Tailscale Serve keeps it on the tailnet.
- The app never stores anything besides the connection settings.

## License

MIT
