FROM node:20-alpine AS base
RUN npm install -g pnpm turbo
RUN apk add --no-cache libc6-compat

FROM base AS builder
WORKDIR /app
COPY . .
RUN turbo prune --scope=web --docker

FROM base AS installer
WORKDIR /app

ARG VITE_GOOGLE_GENAI_API_KEY
ENV VITE_GOOGLE_GENAI_API_KEY=$VITE_GOOGLE_GENAI_API_KEY

COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

RUN pnpm install --frozen-lockfile

COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json

RUN pnpm turbo run build --filter=web...

FROM nginx:alpine AS runner
COPY --from=installer /app/apps/web/dist /usr/share/nginx/html
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
