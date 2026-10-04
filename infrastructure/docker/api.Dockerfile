# syntax=docker/dockerfile:1
# Build context: repository root.

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install workspace dependencies (schema is needed for `prisma generate` on install).
FROM base AS build
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
COPY packages packages
RUN npm ci --workspace @moneylens/api --include-workspace-root
COPY apps/api apps/api
RUN npm run build -w @moneylens/api

# Runtime image: compiled server, production dependencies, Prisma migrations.
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/packages packages
RUN npm ci --workspace @moneylens/api --omit=dev && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
WORKDIR /app/apps/api
USER node
EXPOSE 4000
# Apply pending migrations, then start. migrate deploy never drops data.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
