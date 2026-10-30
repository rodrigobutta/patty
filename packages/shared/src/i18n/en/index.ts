// Inglés: el castellano como clave y su traducción. Está partido por zonas de la app para que sea fácil de mantener.
import { CICLO } from './ciclo.js';
import { COMIDA } from './comida.js';
import { COMPARTIR } from './compartir.js';
import { CUENTA } from './cuenta.js';
import { COMUN } from './comun.js';
import { DATOS } from './datos.js';
import { DIA } from './dia.js';
import { INFORME } from './informe.js';
import { MAS } from './mas.js';
import { MEDIOS } from './medios.js';
import { AVISOS_TELEFONO } from './avisostelefono.js';
import { PERMISOS } from './permisos.js';
import { PREVENTIVO } from './preventivo.js';
import { PATRONES } from './patrones.js';
import { PATRONES_FINOS } from './patronesfinos.js';
import { SERVIDOR } from './servidor.js';

export const EN: Record<string, string> = { ...INFORME, ...PERMISOS, ...CUENTA, ...CICLO, ...DATOS, ...SERVIDOR, ...DIA, ...MAS, ...PATRONES, ...PREVENTIVO, ...COMIDA, ...COMPARTIR, ...PATRONES_FINOS, ...MEDIOS, ...AVISOS_TELEFONO, ...COMUN };
