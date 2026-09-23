# Self-hosted stack

The whole thing on one machine with Docker Compose: an LDK Lightning node (ldk-server), the
dashboard, and the assistant's goose gateway.

```bash
cd deploy
cp ldk-server.example.toml ldk-server.toml   # network and chain backend
cp .env.example .env                          # optional: alias, ports, basic auth
docker compose up -d --build
```

Open http://127.0.0.1:8080. The dashboard connects to the node by itself; no API key to paste.

## What runs

| Service           | Image                          | Reachable at                                  |
| ----------------- | ------------------------------ | --------------------------------------------- |
| `web`             | dashboard + nginx              | `127.0.0.1:8080` (the only web entry point)   |
| `ldk-server`      | the Lightning node             | peers on `9735`; gRPC only inside the stack   |
| `grpc-web-bridge` | Envoy, gRPC-Web to gRPC        | inside the stack, through `web`               |
| `goose-gateway`   | the assistant's model gateway  | inside the stack, through `web` at `/goose/`  |

The images are small and built from source by `--build` (see [`docker/README.md`](../docker/README.md)).
The first build compiles ldk-server and goose and takes a while.

## Settings

- **`ldk-server.toml`**: network and chain backend. Use your own Bitcoin Core for mainnet
  (`host.docker.internal` reaches one running on this machine). Add
  `announcement_addresses` only for a public routing node.
- **`.env`**: alias, ports, basic auth, and where goose keeps its sign-ins.
- **Assistant**: open it and pick a provider in its panel. Sign-ins and keys are stored by
  goose in `data/goose` (or `GOOSE_CONFIG_DIR`).

## Opening it beyond this machine

The dashboard hands out control of the node, so it binds to `127.0.0.1` by default. To reach it
from your network, set basic auth and the bind address in `.env`:

```bash
AUTH_USER=admin
AUTH_HASH=$$2y$$05$$...        # htpasswd -nbB admin 'password' | cut -d: -f2, each $ doubled
WEB_BIND=0.0.0.0
```

Over the internet, put it behind HTTPS (your reverse proxy or a tunnel) and list the public
origin in `PUBLIC_ORIGIN` so the assistant accepts it.

## Data

Everything lives in `data/`:

- `data/ldk/keys_mnemonic`: the node's seed. Required to recover on-chain funds.
- `data/ldk/<network>/ldk_node_data.sqlite`: channel state. Required to recover channel funds;
  never restore an old copy and never run the same node twice.
- `data/ldk/<network>/api_key`, `tls.crt`, `tls.key`: regenerated if lost.
- `data/goose`: the assistant's sign-ins and keys.

Stop with `docker compose down`; the node gets up to 3 minutes to persist its state.
