#!/bin/sh
# Runs before nginx starts (the image's /docker-entrypoint.d hook). Writes the optional basic
# auth include and the optional /bundle.json. Everything goes to /tmp: the rest of the image
# stays read-only for the unprivileged user.
set -eu

mkdir -p /tmp/ldk

# Basic auth: AUTH_USER plus AUTH_HASH, a crypt(3) hash such as bcrypt (`htpasswd -nbB user pw`,
# or `mkpasswd -m bcrypt`). Without both, the site is open: fine on loopback or behind a
# platform's own login (Umbrel), not on a network.
if [ -n "${AUTH_USER:-}" ] && [ -n "${AUTH_HASH:-}" ]; then
    printf '%s:%s\n' "$AUTH_USER" "$AUTH_HASH" > /tmp/ldk/htpasswd
    printf 'auth_basic "LDK Server";\nauth_basic_user_file /tmp/ldk/htpasswd;\n' > /tmp/ldk/auth.conf
    echo "40-ldk-server-manager: basic auth on for user ${AUTH_USER}"
else
    : > /tmp/ldk/auth.conf
    echo "40-ldk-server-manager: basic auth off (set AUTH_USER and AUTH_HASH to turn it on)"
fi

# /bundle.json: lets the dashboard connect without the user pasting the macaroon. Off unless
# BUNDLE_API_KEY=true, because it hands the credential to whoever can load the page.
#
# ldk-server writes <storage>/<network>/macaroons/admin.macaroon on its first start, which can
# take a while (a chain backend still syncing, a restart loop over bad config). So nginx starts
# right away and a background loop writes the file once the macaroon is readable, and again if
# it ever changes. The file is already hex text; do not encode it again.
rm -f /tmp/ldk/bundle.json
if [ "${BUNDLE_API_KEY:-false}" = "true" ]; then
    write_bundle() {
        macaroon_file="${LDK_MACAROON_FILE:-}"
        if [ -z "$macaroon_file" ]; then
            macaroon_file=$(ls /ldk/*/macaroons/admin.macaroon 2>/dev/null | head -n 1 || true)
        fi
        [ -n "$macaroon_file" ] && [ -r "$macaroon_file" ] || return 1
        macaroon=$(tr -d ' \t\r\n' < "$macaroon_file" | tr 'A-F' 'a-f')
        case "$macaroon" in
            02*) ;;
            *) return 1 ;;
        esac
        body=$(printf '{"nodeUrl":"","gatewayUrl":"/goose/v1","macaroon":"%s"}' "$macaroon")
        if [ "$(cat /tmp/ldk/bundle.json 2>/dev/null)" != "$body" ]; then
            printf '%s\n' "$body" > /tmp/ldk/bundle.json.tmp
            mv /tmp/ldk/bundle.json.tmp /tmp/ldk/bundle.json
            echo "40-ldk-server-manager: /bundle.json ready from ${macaroon_file}"
        fi
    }
    if ! write_bundle; then
        echo "40-ldk-server-manager: waiting for the node's admin.macaroon (${LDK_MACAROON_FILE:-/ldk/*/macaroons/admin.macaroon}); /bundle.json appears once it exists"
    fi
    ( while :; do sleep 5; write_bundle || true; done ) &
fi
