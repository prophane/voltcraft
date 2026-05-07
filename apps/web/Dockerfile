FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

ARG VITE_API_URL=http://localhost:3001

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
COPY tsconfig.base.json ./

ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @voltcraft/web build

# ─── Serve with node http-server ─────────────────────────────────
FROM node:20-alpine AS production
RUN npm install -g serve
WORKDIR /app
COPY --from=build /app/apps/web/dist ./dist

EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
