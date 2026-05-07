FROM node:20-alpine AS base
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# Install all dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --no-frozen-lockfile

# Copy source
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY apps/web ./apps/web
COPY tsconfig.base.json ./

# Generate Prisma client
RUN pnpm --filter @voltcraft/api prisma:generate

# Build shared package first (api depends on it)
RUN pnpm --filter @voltcraft/shared build

# Build API
RUN pnpm --filter @voltcraft/api build

# Build web frontend
RUN pnpm --filter @voltcraft/web build

# ─── Production image ────────────────────────────────────────────
FROM node:20-alpine AS production
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
RUN mkdir -p /app/data

COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --no-frozen-lockfile --prod

COPY --from=base /app/apps/api/dist ./apps/api/dist
COPY --from=base /app/apps/api/prisma ./apps/api/prisma
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/apps/web/dist ./apps/web/dist
COPY --from=base /app/node_modules/.pnpm ./node_modules/.pnpm

# Generate Prisma client in production image (ensures correct OpenSSL binaries)
RUN cd apps/api && npx prisma generate

ENV NODE_ENV=production
EXPOSE 3001

CMD ["sh", "-c", "cd apps/api && npx prisma db push --accept-data-loss && node dist/server.js"]
