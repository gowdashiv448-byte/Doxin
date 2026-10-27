# syntax=docker/dockerfile:1.7

# ---------- dependencies ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --no-audit --no-fund

# ---------- build ----------
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @doxin/shared \
 && npm run build -w @doxin/api \
 && npm prune --omit=dev

# ---------- runtime ----------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Copy only what the API needs at runtime. The workspace symlink for
# @doxin/shared resolves inside /app/node_modules, so the layout is preserved.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/src/db/migrations ./apps/api/dist/db/migrations
COPY --chown=node:node docker/render-start.sh ./docker/render-start.sh

USER node
EXPOSE 4000

# Render injects PORT (usually 10000); local Compose uses 4000.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD sh -c 'wget -qO- "http://127.0.0.1:${PORT:-4000}/health" >/dev/null || exit 1'

# Migrations and the idempotent seed are safe on every boot; the seed only
# creates demo users and reference data when those tables are empty.
CMD ["sh", "./docker/render-start.sh"]
