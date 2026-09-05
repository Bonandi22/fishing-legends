# Backend (Fastify + Drizzle). Multi-stage: deps -> dev / build -> runtime.
# Build context is the repo root because the backend imports shared game domain
# from src/game/* and shares package.json with the frontend.

FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=development
RUN apk add --no-cache tini

# ---- deps: install once, cache on lockfile ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- dev: hot-reload server (compose bind-mounts the source over this) ----
FROM deps AS dev
COPY tsconfig*.json drizzle.config.ts ./
COPY src ./src
COPY backend ./backend
EXPOSE 8090
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npm run backend:db:migrate && npx tsx watch backend/src/server.ts"]

# ---- build: typecheck as a build gate ----
FROM deps AS build
COPY tsconfig*.json drizzle.config.ts ./
COPY src ./src
COPY backend ./backend
RUN npm run backend:typecheck

# ---- runtime: run the migrated server via tsx ----
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig*.json drizzle.config.ts ./
COPY src ./src
COPY backend ./backend
RUN chown -R node:node /app
USER node
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8090/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npm run backend:db:migrate && npm run backend:start"]
