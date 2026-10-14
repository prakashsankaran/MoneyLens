# syntax=docker/dockerfile:1
# Build context: repository root.
#
# MoneyLens as one container: the API also serves the built web app
# (WEB_DIST_DIR), so a free single-service host such as Render can run it.
# The database is separate (for example Neon); pass DATABASE_URL.

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/api/prisma apps/api/prisma
COPY packages packages
RUN npm ci --workspace @moneylens/api --workspace @moneylens/web --include-workspace-root
COPY apps/api apps/api
COPY apps/web apps/web
RUN npm run build -w @moneylens/api && npm run build -w @moneylens/web

FROM base AS runtime
ENV NODE_ENV=production WEB_DIST_DIR=/app/web
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/packages packages
RUN npm ci --workspace @moneylens/api --omit=dev && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist /app/web
WORKDIR /app/apps/api
USER node
EXPOSE 4000
# Apply pending migrations, then start. migrate deploy never drops data.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
