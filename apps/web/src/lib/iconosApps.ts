// Los íconos de verdad de las apps del teléfono (los del escritorio), para el uso de cada app y sus avisos en el Día.
// Solo en la app de Android: se le piden a TelefonoPlugin.iconos por nombre («Instagram», el mismo con que se guardó
// «Uso de Instagram») o por paquete, y quedan guardados en este teléfono para no pedirlos cada vez. En la web, el
// iPhone o la app vieja no hay: se ve el ícono de Patty de siempre.
import { useEffect, useState } from 'react';
import { plataforma } from './nativo';
import { Telefono } from './telefono';

const CLAVE = 'iconos-apps';
const DIA = 86400000;
/** Las que se encontraron se vuelven a pedir cada tanto (la app pudo cambiar de ícono); las que no, antes (se pudo instalar). */
const VIGENCIA_CON = 30 * DIA;
const VIGENCIA_SIN = 3 * DIA;

/** Lo guardado: el ícono (o '' si el teléfono no lo tiene) y cuándo se pidió. */
type Guardados = Record<string, { i: string; t: number }>;

export interface AppConIcono {
  nombre: string;
  paquete?: string | null;
}

/** «Uso de Instagram» → «Instagram» (o null si no es el uso de una app). */
export function appDelUso(concepto: string): string | null {
  const m = /^Uso de (.+)$/.exec(concepto);
  return m ? m[1] : null;
}

function leer(): Guardados {
  try {
    return (JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as Guardados) ?? {};
  } catch {
    return {};
  }
}

function guardar(g: Guardados): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(g));
  } catch {
    /* sin lugar: se pedirán de nuevo */
  }
}

/** Los íconos que ya están guardados (los vencidos también: mejor viejo que ninguno). */
function guardados(nombres: string[]): Record<string, string> {
  const g = leer();
  const r: Record<string, string> = {};
  for (const n of nombres) if (g[n]?.i) r[n] = g[n].i;
  return r;
}

/** La app vieja no tiene el método: no se insiste en esta sesión. */
let sinMetodo = false;
const pidiendo = new Map<string, Promise<void>>();

async function pedir(apps: AppConIcono[]): Promise<void> {
  const g = leer();
  const ahora = Date.now();
  const faltan = apps.filter((a) => {
    const x = g[a.nombre];
    return !pidiendo.has(a.nombre) && (!x || ahora - x.t > (x.i ? VIGENCIA_CON : VIGENCIA_SIN));
  });
  if (!faltan.length) {
    await Promise.all(apps.map((a) => pidiendo.get(a.nombre)));
    return;
  }
  const p = Telefono.iconos({ nombres: faltan.map((a) => a.nombre), paquetes: faltan.map((a) => a.paquete ?? null), tamano: 96 })
    .then(({ iconos }) => {
      const nuevo = leer();
      for (const a of faltan) nuevo[a.nombre] = { i: iconos[a.nombre] ?? '', t: ahora };
      guardar(nuevo);
    })
    .catch(() => {
      sinMetodo = true;
    })
    .finally(() => faltan.forEach((a) => pidiendo.delete(a.nombre)));
  faltan.forEach((a) => pidiendo.set(a.nombre, p));
  await p;
}

/** Los íconos de esas apps (por nombre); los que no hay, no están. */
export function useIconosApps(apps: AppConIcono[]): Record<string, string> {
  const nombres = apps.map((a) => a.nombre);
  const clave = nombres.join('\n');
  const [iconos, setIconos] = useState<Record<string, string>>(() => guardados(nombres));
  useEffect(() => {
    setIconos(guardados(nombres));
    if (plataforma() !== 'android' || sinMetodo || !apps.length) return;
    let vivo = true;
    void pedir(apps).then(() => {
      if (vivo) setIconos(guardados(nombres));
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return iconos;
}
