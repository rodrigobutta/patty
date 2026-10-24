# Patty

Anotá tu día (sueño, comidas, baño, actividad, llamadas, pantalla, clima, dolores, ánimo) y Patty busca qué cosas se
relacionan: "cuando comés tomate, a los dos días te duele la cabeza". Ver [docs/DISENO.md](docs/DISENO.md).

- `apps/api`: Node + TypeScript (Hono) con Postgres.
- `apps/web`: React + TypeScript (Vite), instalable en el teléfono (PWA).
- `packages/shared`: tipos y reglas comunes.

## Desarrollo

Necesita Node 22+, pnpm 10 y Postgres (con la extensión `pg_trgm`, que viene con Postgres).

```sh
pnpm install
createdb patty
cp apps/api/.env.example apps/api/.env      # DATABASE_URL y, si querés IA, ANTHROPIC_API_KEY
pnpm dev:api                                # http://localhost:8000 (aplica las migraciones al arrancar)
pnpm dev:web                                # http://localhost:5173
pnpm --filter api ejemplo                   # opcional: persona "Ejemplo" con 60 días de datos y dos patrones escondidos
```

Pruebas: `createdb patty_test && pnpm --filter api test` (usa `TEST_DATABASE_URL`, por defecto `postgres://localhost/patty_test`).

Cambios en la base: editar `apps/api/src/db/schema.ts` y `pnpm --filter api db:generate`.

## Railway

Igual que Quincho: un servicio con este repo (usa el `Dockerfile` por `railway.json`), el plugin de Postgres
(`DATABASE_URL`) y `PORT=8000`. Opcionales: `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID`, `GOOGLE_CLIENT_ID`.
No necesita volumen: no guarda archivos.
