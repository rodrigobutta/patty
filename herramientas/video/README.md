# Videos de la presentación

La historia de Sofía, con relato, hecha con [Remotion](https://www.remotion.dev/) a partir de las capturas y videos de la app (`apps/web/public/presentacion`, ver `apps/web/movil/presentacion/capturar.mjs`). Queda afuera del workspace: no pesa en la app ni en el deploy.

- `src/guion.ts`: la historia de Sofía (voz femenina): lo que dice la voz en cada escena y qué pantallas se ven. `src/guion-martin.ts`: la de Martín (voz masculina), para probar otro público.
- `npm run voz`: genera la voz con ElevenLabs (clave en `~/patty-release/elevenlabs.key`, nunca en el repo). Queda en `public/voz/` con la duración de cada escena. `npm run voz -- final` rehace una sola; `npm run voz -- martin` hace la de Martín (en `public/voz/martin`). Cada historia guarda su voz en `voz.json` y la reusa.
- `npm run estudio`: abre Remotion Studio para ver y ajustar el video.
- `npm run render`: genera `historia.mp4` (horizontal, para la home), `historia-vertical.mp4` (para redes) y lo mismo de Martín (`historia-martin*.mp4`), con sus portadas, en la presentación de la web. `node render.mjs historia-martin` hace solo esa.
- `node capturar.mjs`: regraba las tomas de la app; `node musica.mjs [segundos]`: la música de fondo.

Remotion es gratis para personas y empresas de hasta 3 personas; más grande, necesita licencia.
