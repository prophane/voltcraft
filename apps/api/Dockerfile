FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install all dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY tsconfig.base.json ./

# Generate Prisma client
RUN pnpm --filter @voltcraft/api prisma:generate

# Build
RUN pnpm --filter @voltcraft/api build

# ─── Production image ────────────────────────────────────────────
FROM node:20-alpine AS production
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile --prod

COPY --from=base /app/apps/api/dist ./apps/api/dist
COPY --from=base /app/apps/api/prisma ./apps/api/prisma
COPY --from=base /app/node_modules/.pnpm ./node_modules/.pnpm

ENV NODE_ENV=production
EXPOSE 3001

CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy && node dist/server.js"]
