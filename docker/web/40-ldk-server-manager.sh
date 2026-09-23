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

# /bundle.json: lets the dashboard connect without the user pasting the API key. Off unless
# BUNDLE_API_KEY=true, because it hands the key to whoever can load the page.
rm -f /tmp/ldk/bundle.json
if [ "${BUNDLE_API_KEY:-false}" = "true" ]; then
    key_file="${LDK_API_KEY_FILE:-}"
    waited=0
    # ldk-server writes <storage>/<network>/api_key on its first start; give it time.
    while :; do
        if [ -z "${LDK_API_KEY_FILE:-}" ]; then
            key_file=$(ls /ldk/*/api_key 2>/dev/null | head -n 1 || true)
        fi
        if [ -n "$key_file" ] && [ -r "$key_file" ]; then
            break
        fi
        if [ "$waited" -ge 120 ]; then
            echo "40-ldk-server-manager: no readable api_key after ${waited}s (${key_file:-/ldk/*/api_key}); /bundle.json disabled" >&2
            exit 0
        fi
        sleep 2
        waited=$((waited + 2))
    done
    key_hex=$(od -An -v -tx1 "$key_file" | tr -d ' \n')
    printf '{"nodeUrl":"","gatewayUrl":"/goose/v1","apiKey":"%s"}\n' "$key_hex" > /tmp/ldk/bundle.json
    echo "40-ldk-server-manager: /bundle.json ready from ${key_file}"
fi
