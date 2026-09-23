#!/bin/sh
# Restore a backup made by ./backup.sh.
#
#   ./restore.sh backups/ldk-node-<time>.tar.gz
#
# Run it with the stack stopped (docker compose down). The current data is moved aside, not
# deleted. Restoring channel state older than what the node already has can broadcast revoked
# transactions and lose funds, so that is refused unless you pass --replace-newer-state, which
# is only right when this machine's data is known to be bad or stale. Never run the same node on
# two machines: stop the old one for good before restoring here.
set -eu
cd "$(dirname "$0")"

HELPER_IMAGE=alpine:3.22
archive=""
force=""
for arg in "$@"; do
    case "$arg" in
        --replace-newer-state) force=1 ;;
        -h | --help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        -*) echo "unknown option: $arg (try --help)" >&2; exit 2 ;;
        *) archive=$arg ;;
    esac
done
[ -n "$archive" ] && [ -f "$archive" ] || { echo "usage: ./restore.sh <backup.tar.gz> (try --help)" >&2; exit 2; }

if docker compose ps --status running --services 2>/dev/null | grep -qx ldk-server; then
    echo "ldk-server is running. Stop the stack first: docker compose down" >&2
    exit 1
fi

archive_dir=$(cd "$(dirname "$archive")" && pwd)
archive_name=$(basename "$archive")
ts=$(date -u +%Y%m%dT%H%M%SZ)

docker run --rm -v "$(pwd):/stage/stack" -v "$archive_dir:/in:ro" -e FORCE="$force" "$HELPER_IMAGE" sh -c "
    set -e
    cd /stage/stack
    tar -xzf /in/$archive_name -O BACKUP-INFO > /tmp/info 2>/dev/null || { echo 'Not a backup from ./backup.sh (no BACKUP-INFO).' >&2; exit 1; }
    backup_db=\$(sed -n 's/^channel_db=//p' /tmp/info)
    backup_mtime=\$(sed -n 's/^channel_db_mtime=//p' /tmp/info)
    if [ -n \"\$backup_db\" ] && [ -f \"data/\$backup_db\" ] && [ -n \"\$backup_mtime\" ]; then
        current_mtime=\$(stat -c %Y \"data/\$backup_db\")
        if [ \"\$current_mtime\" -gt \"\$backup_mtime\" ] && [ -z \"\$FORCE\" ]; then
            echo 'Refusing: this machine has newer channel state than the backup.' >&2
            echo 'Restoring older channel state can lose funds. If the current data is known to be' >&2
            echo 'bad, re-run with --replace-newer-state.' >&2
            exit 3
        fi
    fi
    tar -tzf /in/$archive_name > /tmp/contents
    for p in data/ldk data/goose ldk-server.toml .env; do
        if grep -q \"^stack/\$p\(/\|\$\)\" /tmp/contents && [ -e \"\$p\" ]; then
            if mv \"\$p\" \"\$p.replaced-$ts\"; then
                echo \"Moved current \$p to \$p.replaced-$ts\"
            elif [ -e \"\$p\" ]; then
                echo \"Could not move \$p aside; nothing was restored.\" >&2
                exit 1
            fi
        fi
    done
    tar -xzpf /in/$archive_name -C /stage
    echo \"Restored \$(sed -n 's/^created_at=//p' /tmp/info) backup.\""

echo "Start the stack again: docker compose up -d"
