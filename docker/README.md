# Container images

Small images for running the whole stack. Each one holds a single program, runs as a
non-root user, and keeps nothing it doesn't need.

| Image                    | Built from                         | Base                                | Size (arm64) |
| ------------------------ | ---------------------------------- | ----------------------------------- | -----------: |
| `ldk-server`             | `docker/ldk-server`, `--target ldk-server`     | `scratch` + static musl binary      |      40.6 MB |
| `ldk-server-mcp`         | `docker/ldk-server`, `--target ldk-server-mcp` | `scratch` + static musl binary      |       5.2 MB |
| `ldk-server-manager-web` | `docker/web/Dockerfile`            | `nginx-unprivileged:1.29-alpine-slim` |      22.4 MB |
| `goose-gateway`          | [goose-gateway](https://github.com/vincenzopalazzo/goose-gateway) repo | `scratch` + static musl binary |        73 MB |
| gRPC-Web bridge          | official `envoyproxy/envoy:distroless-v1.37-latest` + `docker/grpc-web-bridge/envoy.yaml` | distroless | 154 MB |

`scratch` images have no shell. Run tools such as `ldk-server-cli` from another container.

## Build

```bash
docker build --target ldk-server     -t ldk-server     docker/ldk-server
docker build --target ldk-server-mcp -t ldk-server-mcp docker/ldk-server
docker build -f docker/web/Dockerfile -t ldk-server-manager-web .
```

ldk-server is built from upstream source at the commit in `LDK_SERVER_REV` (a build arg);
upstream publishes no image. Rust images build natively for the machine's architecture:
build amd64 on amd64 and arm64 on arm64, since compiling under QEMU emulation is very slow.
The web image's static build runs once on the build machine's platform, whatever the target.

## ldk-server

- **Data:** mount a volume at `/data`. It holds the mnemonic (`keys_mnemonic`), the TLS
  certificate and key, `<network>/api_key` and the channel database. Back up the mnemonic.
  Never restore an old channel database or run the same node twice. See ldk-server's
  [operations guide](https://github.com/lightningdevkit/ldk-server/blob/main/docs/operations.md#backups).
- **Settings:** `LDK_SERVER_*` environment variables (`ldk-server --help` lists them). The image
  sets the storage directory, gRPC on `0.0.0.0:3536`, peers on `0.0.0.0:9735`, and logs to
  stdout only.
- **A config file is still needed** for two settings with no environment variable: the chain
  backend when it is Esplora or Electrum, and `[tls] hosts`. Other containers reach the node by
  its service name, which must be in its certificate:

  ```toml
  [node]
  network = "signet"

  [tls]
  hosts = ["ldk-server"]    # the service name Envoy and ldk-server-mcp dial

  [esplora]
  server_url = "https://blockstream.info/signet/api"
  ```

  Pass it as the first argument: `command: ["/config/config.toml"]`. The certificate is created
  on first start; after changing `hosts`, delete `tls.crt` and `tls.key` and restart.
- **Announcing:** without `LDK_SERVER_NODE_ANNOUNCEMENT_ADDRESSES` the node announces its
  listening address, `0.0.0.0:9735`. Set a reachable address for a public routing node.
- **Stopping:** SIGTERM persists channel state before exit; allow time (`stop_grace_period: 3m`).

## ldk-server-mcp

Speaks MCP over stdio, so run it with stdin attached (`docker run -i`). It needs the node's
address, API key (hex) and certificate:

```bash
docker run --rm -i --network <stack network> -v <node data>:/ldk:ro \
  -e LDK_BASE_URL=ldk-server:3536 \
  -e LDK_API_KEY=<hex api key> \
  -e LDK_TLS_CERT_PATH=/ldk/tls.crt \
  ldk-server-mcp
```

It refuses to start without the certificate file.

## Web

nginx serving the dashboard, and the stack's single entry point on port 8080:

| Path                  | Goes to                                  |
| --------------------- | ---------------------------------------- |
| `/api.LightningNode/*` | `GRPC_WEB_UPSTREAM` (default `grpc-web-bridge:8080`) |
| `/goose/*`            | `GOOSE_GATEWAY_UPSTREAM` (default `goose-gateway:8791`), prefix removed |
| `/bundle.json`        | connection details, only with `BUNDLE_API_KEY=true` |
| everything else       | the dashboard (single-page app)           |

Upstreams are resolved per request, so a restarted container is found again without
restarting nginx.

| Variable          | Effect |
| ----------------- | ------ |
| `AUTH_USER`, `AUTH_HASH` | Basic auth for everything. `AUTH_HASH` is a crypt(3) hash, e.g. bcrypt from `htpasswd -nbB user password`. |
| `BUNDLE_API_KEY=true` | Serve `/bundle.json` with the node's API key, read from `/ldk/*/api_key` (mount the node's data read-only at `/ldk`, or set `LDK_API_KEY_FILE`). It hands out node control: only behind basic auth or a platform login. The file is `0400`, so run the container as the node's user (`user: "1000:0"`). |

## gRPC-Web bridge

Envoy's distroless image with `docker/grpc-web-bridge/envoy.yaml` mounted at
`/etc/envoy/envoy.yaml` and the node's data at `/ldk` (read-only). It dials `ldk-server:3536`
and trusts `/ldk/tls.crt`. On a brand-new node the certificate doesn't exist yet, so Envoy exits;
give it `restart: on-failure` and it comes up once the node has created the certificate.

## Tested

On arm64 against a signet node: the dashboard's own client made HMAC-signed gRPC-Web calls
through web → Envoy → ldk-server (node info, balances, wrong key rejected), and
`ldk-server-mcp` answered `get_node_info` and `get_balances` over stdio. goose-gateway served
its provider API and streamed server-sent events through web's `/goose/` without buffering.
Basic auth and `/bundle.json` were checked separately.

On amd64 (emulated), `ldk-server-mcp` built and answered `get_node_info` (5.97 MB). The other
Rust images use the same Alpine toolchain but were only built on arm64 so far.

Images are built by `.github/workflows/images.yml` (manual; tick "push" to publish to ghcr.io).
