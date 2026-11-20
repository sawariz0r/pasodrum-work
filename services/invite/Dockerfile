# Invite service (D-26). No dependencies: Node 24 runs the TypeScript directly. Build context: repo root.
FROM node:24-alpine
ENV NODE_ENV=production NODE_NO_WARNINGS=1 DB_PATH=/data/invites.db PORT=8080
WORKDIR /app
COPY services/invite/package.json ./
COPY services/invite/src ./src
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
CMD ["node", "src/index.ts"]
