# syntax=docker/dockerfile:1.7
#
# The dashboard, served by unprivileged nginx (alpine-slim), which is also the stack's single
# web entry point: it proxies gRPC-Web to the Envoy bridge and /goose/* to goose-gateway.
#
#   docker build -f docker/web/Dockerfile -t ldk-server-manager-web .
#
# The static build is the same on every architecture, so it runs once on the build machine's
# own platform; only the small nginx layer is per-architecture.

FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /repo
ENV PNPM_HOME=/pnpm CI=true
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/ui/package.json packages/ui/
COPY packages/client/package.json packages/client/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter web build \
    # Cloudflare-only files; nginx sets these headers itself.
    && rm -f apps/web/build/_headers apps/web/build/_redirects

FROM nginxinc/nginx-unprivileged:1.29-alpine-slim
COPY --from=build /repo/apps/web/build /usr/share/nginx/html
COPY docker/web/default.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 docker/web/40-ldk-server-manager.sh /docker-entrypoint.d/40-ldk-server-manager.sh
# Upstreams are looked up per request through the local resolver, so a restarted container
# with a new address is picked up without restarting nginx.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    GRPC_WEB_UPSTREAM=grpc-web-bridge:8080 \
    GOOSE_GATEWAY_UPSTREAM=goose-gateway:8791
EXPOSE 8080
