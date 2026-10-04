# syntax=docker/dockerfile:1
# Build context: repository root.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages packages
RUN npm ci --workspace @moneylens/web --include-workspace-root
COPY apps/web apps/web
RUN npm run build -w @moneylens/web

FROM nginx:1.27-alpine AS runtime
COPY infrastructure/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
