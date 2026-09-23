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

- `data/ldk/keys_mnemonic`: the node's seed. Recovers on-chain funds.
- `data/ldk/<network>/ldk_node_data.sqlite`: channel state. Recovers channel funds.
- `data/ldk/<network>/api_key`, `tls.crt`, `tls.key`: regenerated if lost; clients re-pair.
- `data/goose`: the assistant's sign-ins and keys.

Stop with `docker compose down`; the node gets up to 3 minutes to persist its state.

## Backups

```bash
./backup.sh              # full: seed, channel state, goose, config; stops the node for a minute
./backup.sh --seed-only  # just the seed, no downtime
./restore.sh backups/ldk-node-<time>.tar.gz
```

Archives go to `backups/` (or `$BACKUP_DIR`), readable only by you. They hold the seed and the
API key: copy them off this machine and keep them private.

What to back up, and when:

- **The seed, once.** It never changes. `./backup.sh --seed-only` exports it; store it offline.
  On its own it recovers on-chain funds, not channel balances.
- **Channel state, after it changes.** The channel database changes with every payment, so a
  backup is only as good as it is recent. Take a full backup after opening or closing channels,
  and before upgrades or moving machines. SQLite is only consistent while the node is stopped,
  which is why the full backup stops it briefly.

The rules that keep a restore from losing money:

- **Never restore channel state older than what the node already has.** Old state can broadcast
  revoked commitment transactions, which lets peers take the channel balance. File times can't
  tell which state is newer, so `restore.sh` refuses to restore over a machine that already
  has channel state; override (`--replace-newer-state`) only when this machine's data is known
  to be lost or corrupt.
- **Never run the same node twice.** Moving machines: stop the old node for good, take a full
  backup there, restore it here.
- **Restore moves the current data aside** (`data/ldk.replaced-<time>`), it never deletes it.

ldk-server has no static channel backup or remote state storage yet, so the channel database
backup is the only way to recover channel balances; keeping it current is on you. For
replicated storage, ldk-server can keep channel state in PostgreSQL (`[storage.postgres]`);
then `backup.sh` refuses a full backup (there is no channel database to copy) and the database
is yours to dump with `pg_dump` while the node is stopped. A `GOOSE_CONFIG_DIR` outside `data/`
isn't backed up either; the script says so.
