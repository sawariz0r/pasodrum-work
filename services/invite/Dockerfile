# Invite service (D-26). Node 24 runs the TypeScript directly; one dependency, ws (D-39). Build context: repo root.
FROM node:24-alpine
ENV NODE_ENV=production NODE_NO_WARNINGS=1 DB_PATH=/data/invites.db PORT=8080
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY services/invite/package.json services/invite/
RUN pnpm install --frozen-lockfile --prod --filter @pasodrum/invite
COPY services/invite/src services/invite/src
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
WORKDIR /repo/services/invite
CMD ["node", "src/index.ts"]
