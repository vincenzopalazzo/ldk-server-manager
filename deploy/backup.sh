#!/bin/sh
# Back up the stack's node: the seed, the channel state, goose's sign-ins and the config.
#
#   ./backup.sh              full backup; stops ldk-server for a consistent copy (a minute or so)
#   ./backup.sh --seed-only  just the mnemonic, no downtime
#
# Archives go to $BACKUP_DIR (default ./backups), readable only by you. Keep them off this
# machine. Restore with ./restore.sh. The file work runs in a throwaway container because the
# node's files belong to its container user.
set -eu
cd "$(dirname "$0")"

HELPER_IMAGE=alpine:3.22
BACKUP_DIR=${BACKUP_DIR:-./backups}
ts=$(date -u +%Y%m%dT%H%M%SZ)

case "${1:-}" in
    "" | --seed-only) ;;
    -h | --help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1 (try --help)" >&2; exit 2 ;;
esac

[ -d data/ldk ] || { echo "No node data in $(pwd)/data/ldk: nothing to back up." >&2; exit 1; }
umask 077
mkdir -p "$BACKUP_DIR"
out_dir=$(cd "$BACKUP_DIR" && pwd)
owner="$(id -u):$(id -g)"

if [ "${1:-}" = "--seed-only" ]; then
    docker run --rm -v "$(pwd)/data/ldk:/ldk:ro" -v "$out_dir:/out" "$HELPER_IMAGE" sh -c "
        cp /ldk/keys_mnemonic /out/keys_mnemonic-$ts && chmod 600 /out/keys_mnemonic-$ts && chown $owner /out/keys_mnemonic-$ts"
    echo "Seed saved to $out_dir/keys_mnemonic-$ts"
    echo "It recovers on-chain funds only. Channel funds need a full backup (./backup.sh)."
    exit 0
fi

was_running=$(docker compose ps --status running --services 2>/dev/null | grep -x ldk-server || true)
if [ -n "$was_running" ]; then
    echo "Stopping ldk-server so its channel state is consistent (it may take up to 3 minutes)..."
    docker compose stop ldk-server >/dev/null
    trap 'echo "Starting ldk-server again..."; docker compose start ldk-server >/dev/null' EXIT
fi

# Archive layout: BACKUP-INFO (what and when) next to stack/, the files from this directory.
archive="ldk-node-$ts.tar.gz"
if ! docker run --rm -v "$(pwd):/stage/stack:ro" -v "$out_dir:/out" "$HELPER_IMAGE" sh -c "
    set -e
    cd /stage/stack
    db=\$(ls data/ldk/*/ldk_node_data.sqlite 2>/dev/null | head -n 1 || true)
    {
        echo created_at=$ts
        echo channel_db=\${db#data/}
        if [ -n \"\$db\" ]; then echo channel_db_mtime=\$(stat -c %Y \"\$db\"); fi
    } > /stage/BACKUP-INFO
    set -- stack/data/ldk
    [ -d data/goose ] && set -- \"\$@\" stack/data/goose
    for f in ldk-server.toml .env; do [ -f \"\$f\" ] && set -- \"\$@\" \"stack/\$f\"; done
    tar -czf /out/$archive.partial -C /stage BACKUP-INFO \"\$@\"
    chmod 600 /out/$archive.partial && chown $owner /out/$archive.partial
    mv /out/$archive.partial /out/$archive"; then
    rm -f "$out_dir/$archive.partial"
    echo "Backup failed; nothing was written." >&2
    exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
    sum=$(sha256sum "$out_dir/$archive" | cut -d' ' -f1)
else
    sum=$(shasum -a 256 "$out_dir/$archive" | cut -d' ' -f1)
fi
echo "Backup written: $out_dir/$archive ($(du -h "$out_dir/$archive" | cut -f1))"
echo "sha256: $sum"
echo "It holds the node's seed and API key: keep it private and off this machine."
