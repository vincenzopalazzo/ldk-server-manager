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

1. Start ldk-server and note its API key (`[api] key` in the config) and the auto-generated
   certificate at `<storage_dir>/tls.crt`.
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

## Security notes

- Treat the API key like a wallet password: anyone holding it can move funds.
- Serve the app and the bridge over HTTPS when they are not on `localhost`; WebCrypto
  (used for HMAC) is only available in secure contexts.
- The app never stores anything besides the connection settings.

## License

MIT
