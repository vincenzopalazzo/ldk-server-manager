#!/bin/sh
# Build the web image for amd64 and arm64 and push it to ghcr.io.
#
#   docker login ghcr.io          # once, with a token that can write packages
#   docker/web/publish.sh 0.1.0
#
# The dashboard's source is private, so this image is published from a machine that has it
# rather than from CI. It needs no emulation: the static build runs once on this machine's own
# platform and the per-architecture part only copies files onto nginx.
set -eu
cd "$(dirname "$0")/../.."

version=${1:?usage: docker/web/publish.sh <version>}
image=${IMAGE:-ghcr.io/vincenzopalazzo/ldk-server-manager-web}
revision=$(git rev-parse HEAD)
[ -z "$(git status --porcelain)" ] || { echo "Commit or stash your changes first: the image is labelled with $revision." >&2; exit 1; }

# The source label names the public bundle repository on purpose: this repository is private,
# so its URL would be a 404 for anyone pulling the image, and the bundle is where the image is
# documented and released. The revision label is this repository's commit.
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --file docker/web/Dockerfile \
    --label org.opencontainers.image.source=https://github.com/vincenzopalazzo/ldk-node-bundle \
    --label org.opencontainers.image.revision="$revision" \
    --label org.opencontainers.image.version="$version" \
    --tag "$image:$version" \
    --push \
    .
docker buildx imagetools inspect "$image:$version"
