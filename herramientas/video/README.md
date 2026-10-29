# Videos de la presentación

La historia de Sofía, con relato, hecha con [Remotion](https://www.remotion.dev/) a partir de las capturas y videos de la app (`apps/web/public/presentacion`, ver `apps/web/movil/presentacion/capturar.mjs`). Queda afuera del workspace: no pesa en la app ni en el deploy.

- `src/guion.ts`: lo que dice la voz en cada escena y qué pantallas se ven. Para cambiar el relato, se cambia acá.
- `npm run voz`: genera la voz con ElevenLabs (clave en `~/patty-release/elevenlabs.key`, nunca en el repo). Queda en `public/voz/` con la duración de cada escena. `npm run voz -- final` rehace una sola.
- `npm run estudio`: abre Remotion Studio para ver y ajustar el video.
- `npm run render`: genera `historia.mp4` (horizontal, para la home) y `historia-vertical.mp4` (para redes) con sus portadas, directo en la presentación de la web.

Remotion es gratis para personas y empresas de hasta 3 personas; más grande, necesita licencia.
