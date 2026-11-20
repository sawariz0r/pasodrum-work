# Builds the web app and serves it with Caddy, which also forwards Matrix paths to continuwuity (D-17).
# Build context: repo root.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY services/invite/package.json services/invite/
RUN pnpm install --frozen-lockfile --filter @pasodrum/web
COPY apps/web apps/web
RUN pnpm --filter @pasodrum/web build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
