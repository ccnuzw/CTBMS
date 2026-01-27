FROM node:20-alpine AS base

# Install pnpm and turbo
RUN npm install -g pnpm turbo
RUN apk add --no-cache libc6-compat openssl python3 make g++

FROM base AS builder
WORKDIR /app
COPY . .
# Prune the workspace for the api app
RUN turbo prune --scope=api --docker

# Installer stage
FROM base AS installer
WORKDIR /app

# Copy lockfile and package.json's of isolated subworkspace
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code of isolated subworkspace
COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json
COPY packages/types/tsconfig.json packages/types/tsconfig.json

# Generate Prisma Client
RUN cd apps/api && npx prisma generate

# Build the project
RUN pnpm turbo run build --filter=api...

FROM base AS runner
WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs
USER nestjs

COPY --from=installer /app/apps/api/dist ./apps/api/dist
COPY --from=installer /app/apps/api/package.json ./apps/api/package.json
COPY --from=installer /app/node_modules ./node_modules
COPY --from=installer /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=installer /app/packages ./packages

# Copy Prisma schema and migrations if needed for runtime
COPY --from=installer /app/apps/api/prisma ./apps/api/prisma

EXPOSE 3000

CMD ["node", "apps/api/dist/src/main.js"]
