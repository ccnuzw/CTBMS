FROM node:20-slim AS base
# Using Debian slim instead of Alpine

FROM node:20 AS build-base
# Using full node:20 for building
RUN npm install -g pnpm turbo
ENV PNPM_HOME="/pnpm" \
    PATH="$PNPM_HOME:$PATH"
RUN pnpm config set store-dir /pnpm/store

FROM build-base AS builder
WORKDIR /app
COPY . .
RUN turbo prune --scope=web --docker

FROM build-base AS installer
WORKDIR /app

ARG VITE_GOOGLE_GENAI_API_KEY
ENV VITE_GOOGLE_GENAI_API_KEY=$VITE_GOOGLE_GENAI_API_KEY

COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Install dependencies using pnpm cache mount
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json

RUN pnpm turbo run build --filter=web...

FROM nginx:alpine AS runner
# We can still keep alpine for nginx runner, since it only serves static files
COPY --from=installer /app/apps/web/dist /usr/share/nginx/html
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
