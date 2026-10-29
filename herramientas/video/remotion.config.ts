import { Config } from '@remotion/cli/config';

// Las capturas y videos de la app son los de la presentación (apps/web/public/presentacion); la voz va en public/voz.
Config.setPublicDir('./public');
Config.setVideoImageFormat('jpeg');
