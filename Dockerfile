# Patty completa (API + web) para Railway u otro servicio con contenedores.
# En Railway: este Dockerfile, DATABASE_URL del plugin de Postgres y PORT=8000.
# Opcionales: ANTHROPIC_API_KEY, ANTHROPIC_WORKSPACE_ID, GOOGLE_CLIENT_ID. Las migraciones se aplican al arrancar.

FROM node:24-slim AS build
WORKDIR /repo
RUN npm install -g pnpm@10.12.1
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY patches patches
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
RUN pnpm --filter web build \
 && pnpm --filter api build \
 && pnpm --filter api deploy --prod --legacy /out \
 && cp -r apps/api/dist apps/api/drizzle /out/ \
 && cp -r apps/web/dist /out/static

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8000 \
    STATIC_DIR=/app/static
COPY --from=build /out ./
EXPOSE 8000
CMD ["node", "dist/src/index.js"]
