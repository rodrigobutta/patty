# Patty

Anotá tu día (sueño, comidas, baño, actividad, llamadas, pantalla, clima, dolores, ánimo) y Patty busca qué cosas se
relacionan: "cuando comés tomate, a los dos días te duele la cabeza". Ver [docs/DISENO.md](docs/DISENO.md).

- `apps/api`: Node + TypeScript (Hono) con Postgres.
- `apps/web`: React + TypeScript (Vite), instalable en el teléfono (PWA) y como app nativa de Android e iPhone
  (Capacitor, en `apps/web/android` y `apps/web/ios`).
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

## App nativa (Android e iPhone)

La app nativa es una cáscara que abre la web: por defecto la de Railway, así que **cada push a `main` llega solo al
teléfono, sin reinstalar**. Suma lo que una web no puede: ubicación con la app cerrada, y en Android el tiempo de uso
de cada app y las llamadas (en el iPhone eso no se puede leer). Solo hay que recompilar e instalar cuando cambia algo
nativo: un plugin, un permiso, `capacitor.config.ts` o el código de `android/` o `ios/`.

Necesita Java 21, Android Studio con el SDK (Android) y Xcode (iPhone). En la Mac de Rodrigo ya están, con
`JAVA_HOME` y `ANDROID_HOME` en `~/.zshrc`, y un emulador `Patty_Pixel`.

```sh
cd apps/web
# Desarrollo: Vite + la app apuntando a él, con recarga en vivo (los cambios se ven al guardar)
pnpm movil:dev:android                # emulador o teléfono por cable (con "Depuración USB" prendida)
pnpm movil:dev:android -- --wifi      # teléfono en la misma red, sin cable
pnpm movil:dev:ios                    # simulador de iPhone
# La app "de verdad", apuntando a Railway (la que queda instalada en el teléfono)
pnpm movil:android
pnpm movil:ios
# Volver a generar los íconos (web y Android) después de tocar el dibujo de la mascota
pnpm movil:iconos
# Abrir el proyecto en Android Studio / Xcode (para firmar, ver logs, etc.)
pnpm movil:abrir:android
pnpm movil:abrir:ios
```

`movil:dev` usa Vite en el 5173 (o `PUERTO_WEB`) y manda `/api` a `API_PROXY` (por defecto `http://127.0.0.1:8000`),
como `pnpm dev:web`. Después de usar `movil:dev`, la app instalada queda apuntando a la Mac: correr `movil:android`
para que vuelva a Railway. Si hay varios dispositivos, Capacitor pregunta en cuál (o `-- --target <id>`; la lista con
`pnpm exec cap run android --list`).

Entrar con Google no funciona dentro de la app (Google no lo deja en una WebView): usar usuario y clave.

## Railway

Igual que Quincho: un servicio con este repo (usa el `Dockerfile` por `railway.json`), el plugin de Postgres
(`DATABASE_URL`) y `PORT=8000`. Opcionales: `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID`, `GOOGLE_CLIENT_ID`.
No necesita volumen: no guarda archivos.
