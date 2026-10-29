// La mascota vive en shared (packages/shared/src/mascota.ts) porque la API también la dibuja, en el informe para el
// médico. Acá se reexporta para no cambiar cómo la importa la web.
export { ANIMAL, CARAS, figuras, svgMascota, type Animal, type Cara } from 'shared';
