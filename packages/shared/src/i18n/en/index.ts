// Inglés: el castellano como clave y su traducción. Está partido por zonas de la app para que sea fácil de mantener.
import { COMUN } from './comun.js';
import { DATOS } from './datos.js';
import { DIA } from './dia.js';
import { MAS } from './mas.js';
import { PATRONES } from './patrones.js';
import { SERVIDOR } from './servidor.js';

export const EN: Record<string, string> = { ...DATOS, ...SERVIDOR, ...DIA, ...MAS, ...PATRONES, ...COMUN };
