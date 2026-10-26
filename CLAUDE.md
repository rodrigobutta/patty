# Patty: memoria del proyecto para Claude

Leé esto antes de trabajar. El diseño técnico completo está en [docs/DISENO.md](docs/DISENO.md) y cómo correrlo en
[README.md](README.md); acá va el contexto que no sale del código.

## Qué pidió Rodrigo (pedido original, 2026-10-24)

Una app donde cada día se anota todo lo que hizo una persona: horarios de levantarse y acostarse, comidas, idas al baño,
clima, temperatura, humedad, actividades bien tipificadas, cantidad de llamadas, dolores y molestias con su intensidad,
etc. ("luego vemos más cosas"). Con eso Patty, usando IA (la misma conexión con Anthropic que la app de Quincho), busca
patrones y relaciones entre cosas: "si comés tomate, a los dos días te duele la cabeza levemente". El nombre viene de
*patterns* / patrones.

Requisitos que marcó:
- Pensada desde ya como **app móvil**. En el futuro tiene que leer métricas de relojes y del teléfono (actividad,
  tiempo de pantalla, uso de redes, etc.).
- Carga **muy sencilla**, con categorías. Al escribir, si la cosa ya existe se sugiere; si no, se crea ahí mismo.
- El **nombre (label) es la clave a nivel humano**, pero internamente no: ids y un índice que permita búsquedas
  inteligentes y rápidas.

## De dónde sale

Se armó a partir de la reescritura en TypeScript de la app de gastos de obra del quincho
(`~/quincho/easy-project-plan-next`, repo `rodrigobutta/easy-project-plan`): misma base de login (usuario/clave y
Google), roles, IA de Anthropic, PWA y despliegue en Railway con Dockerfile. Es una app **aparte**, con su propia base;
no comparte datos con Quincho. Si hace falta ver cómo se resolvió algo de la base, mirar ese repo.

## Estado (2026-10-24)

- Primera versión completa en un solo commit ("Patty: primera versión"), subida a
  `git@github.com:rodrigobutta/patty.git`, rama `main`. El repo tenía un proyecto viejo sin relación (telegraf/mqtt) que
  se pisó a pedido de Rodrigo; quedó una rama local `respaldo-repo-viejo` en `~/patty` (no subida).
- Carpeta local: `~/patty` en la Mac de Rodrigo (Node 24, pnpm 10.12, Postgres local en /usr/local/bin). La base local
  `patty` todavía no se creó.
- Typecheck y tests pasan. La base de pruebas `patty_test` ya está creada en la Mac.
- **Railway (2026-10-24)**: proyecto `patty` en la cuenta de Rodrigo (rbutta@gmail.com, plan hobby), servicios `web`
  (repo `rodrigobutta/patty`, rama `main`, se redespliega con cada push) y `Postgres`. Variables de `web`: `PORT=8000`,
  `DATABASE_URL=${{Postgres.DATABASE_URL}}`. URL: https://patty.today (dominio propio desde 2026-10-24; la de Railway, web-production-4c7d8.up.railway.app, sigue andando). `ANTHROPIC_API_KEY`
  queda para que la cargue Rodrigo (la misma de Quincho, proyecto `easy-project-plan-next`, servicio `app`).

- **App nativa (2026-10-24)**: Capacitor 8 en `apps/web` (Android e iPhone), abre la web de Railway o el Vite de
  la Mac con recarga en vivo (`pnpm movil:dev:android`). Rodrigo usa un **Android**; se mantienen las dos plataformas
  y en el iPhone faltan uso de apps y llamadas. En su Mac quedaron Java 21, Android Studio, el SDK y el emulador
  `Patty_Pixel`; Xcode lo instala él (pide su clave). Detalle en docs/DISENO.md y el README.

## Próximos pasos posibles

Ver "Pendiente / ideas" en docs/DISENO.md. Lo más pedido por Rodrigo: que la app nativa lea Salud / Health Connect. El clima automático por ubicación ya está (Open-Meteo), y también el seguimiento de ubicación con lugares con nombre y viajes (ver docs/DISENO.md).

## Cómo trabajar acá

- Todo en **español rioplatense** (voseo): textos de la interfaz, nombres en el código (`registros`, `conceptos`,
  `diaDePatty`), comentarios, docs y mensajes de commit. Los commits describen el cambio para una persona, no para un
  programador (ej: "Al cargar una compra sugiere cancelar presupuestos parecidos").
- La interfaz es primero para el teléfono: pestañas abajo, botón + para anotar, tema claro/oscuro.
- Cambios en la base: editar `apps/api/src/db/schema.ts` y `pnpm --filter api db:generate` (las migraciones se aplican
  al arrancar la API).
- Antes de dar algo por terminado: `pnpm typecheck` y `pnpm test`.
- Modelo de IA por defecto: el más nuevo de Claude (hoy `claude-opus-5-5`), con salida estructurada en JSON.
- **Versión**: la de la app es la de `apps/web/package.json` (la misma en el `package.json` de la raíz y de la API).
  En cada cambio que se sube, subir el último número (1.1.0 → 1.1.1); un cambio grande o que pide reinstalar la app,
  el del medio (1.1.x → 1.2.0). Se ve abajo de todo en Más y en la administración, y la app de Android toma su
  `versionName` de ahí al compilar.
- El web typecheck de verdad es `npx tsc --noEmit -p tsconfig.app.json` (el `tsconfig.json` de la web no tiene archivos).
