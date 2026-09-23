#!/bin/sh
# Restore a backup made by ./backup.sh.
#
#   ./restore.sh backups/ldk-node-<time>.tar.gz
#
# Run it with the stack stopped (docker compose down). The current data is moved aside, not
# deleted. Restoring channel state older than what the node already has can broadcast revoked
# transactions and lose funds, and file times cannot tell which state is newer, so restoring
# over a machine that already has channel state is refused unless you pass
# --replace-newer-state: only right when this machine's data is known to be bad or stale. Never
# run the same node on two machines: stop the old one for good before restoring here.
set -eu
cd "$(dirname "$0")"

HELPER_IMAGE=alpine:3.22
archive=""
force=""
for arg in "$@"; do
    case "$arg" in
        --replace-newer-state) force=1 ;;
        -h | --help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        -*) echo "unknown option: $arg (try --help)" >&2; exit 2 ;;
        *) archive=$arg ;;
    esac
done
[ -n "$archive" ] && [ -f "$archive" ] || { echo "usage: ./restore.sh <backup.tar.gz> (try --help)" >&2; exit 2; }

# Every service mounts something the restore moves aside, not only the node.
if ! running=$(docker compose ps --status running --services); then
    echo "Could not ask Compose which services are running; fix compose.yaml or .env first." >&2
    exit 1
fi
running=$(printf '%s' "$running" | tr '\n' ' ')
if [ -n "${running% }" ]; then
    echo "Still running: ${running% }. Stop the stack first: docker compose down" >&2
    exit 1
fi

archive_dir=$(cd "$(dirname "$archive")" && pwd)
archive_name=$(basename "$archive")
ts=$(date -u +%Y%m%dT%H%M%SZ)

docker run --rm -v "$(pwd):/stage/stack" -v "$archive_dir:/in:ro" -e FORCE="$force" -e ARCHIVE="/in/$archive_name" -e TS="$ts" "$HELPER_IMAGE" sh -c '
    set -e
    cd /stage/stack
    tar -xzf "$ARCHIVE" -O BACKUP-INFO > /tmp/info 2>/dev/null || { echo "Not a backup from ./backup.sh (no BACKUP-INFO)." >&2; exit 1; }
    current=$(ls data/ldk/*/ldk_node_data.sqlite 2>/dev/null | head -n 1 || true)
    # With PostgreSQL storage the current channel state lives in the database, not data/.
    if [ -z "$current" ] && grep -Eq "^[[:space:]]*\[storage\.postgres\]" ldk-server.toml 2>/dev/null; then
        current="the PostgreSQL database named in ldk-server.toml"
    fi
    if [ -n "$current" ] && [ -z "$FORCE" ]; then
        echo "Refusing: this machine already has channel state ($current)." >&2
        echo "Restoring an older state over it can lose funds, and file times cannot tell which" >&2
        echo "is newer. If the current data is known to be bad or stale, re-run with" >&2
        echo "--replace-newer-state." >&2
        exit 3
    fi
    tar -tzf "$ARCHIVE" > /tmp/contents
    for p in data/ldk data/goose ldk-server.toml .env; do
        if grep -q "^stack/$p\(/\|\$\)" /tmp/contents && [ -e "$p" ]; then
            if mv "$p" "$p.replaced-$TS"; then
                echo "Moved current $p to $p.replaced-$TS"
            elif [ -e "$p" ]; then
                echo "Could not move $p aside; nothing was restored." >&2
                exit 1
            fi
        fi
    done
    tar -xzpf "$ARCHIVE" -C /stage
    echo "Restored $(sed -n "s/^created_at=//p" /tmp/info) backup."'

echo "Start the stack again: docker compose up -d"
