// En el Día: si anotaste que estuviste con alguien (en una comida, una actividad) y hay otras cosas anotadas cerca de
// esa hora (hasta una hora y media antes o después) o en el mismo lugar donde estabas, sugiere sumarle la misma gente:
// "¿También estuviste con Mamá en el café de las 17:10?". Un toque y queda; "No" no lo vuelve a preguntar.
import { useEffect, useMemo, useState } from 'react';
import { VIAJE_PESADO, type Categoria, type DiaUbicacion, type Persona, type Registro } from 'shared';
import { api } from '../api';
import { horaEn } from '../lib/fechas';
import { idioma, t } from '../lib/idioma';

const CLAVE = 'compania-descartada';
const VENTANA_MIN = 90;
/** Lo que tiene sentido hacer con alguien (no el sueño, los remedios ni cómo te sentís). */
const CON_GENTE = new Set(['comida', 'bebida', 'actividad', 'otro', 'viaje', 'pantalla']);

const descartadas = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) ?? '[]') as string[];
  } catch {
    return [];
  }
};

interface Sugerencia {
  registro: Registro;
  nombres: string[];
  motivo: string;
}

export function CompaniaSugerida({ persona, fecha, registros, categorias, alCambiar }: {
  persona: Persona;
  fecha: string;
  registros: Registro[];
  categorias: Categoria[];
  alCambiar(): void;
}) {
  const [estadias, setEstadias] = useState<DiaUbicacion['estadias']>([]);
  const [no, setNo] = useState<string[]>(descartadas());
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    api<DiaUbicacion>('GET', `/api/ubicacion/dia?persona=${persona.id}&fecha=${fecha}`).then((d) => setEstadias(d.estadias)).catch(() => setEstadias([]));
  }, [persona.id, fecha, registros.length]);

  const genteId = categorias.find((c) => c.clave === 'gente')?.id;
  const claveDe = (c: number) => categorias.find((k) => k.id === c)?.clave ?? '';

  const sugerencias = useMemo<Sugerencia[]>(() => {
    if (genteId === undefined) return [];
    const gente = registros.filter((r) => r.categoria_id === genteId);
    if (!gente.length) return [];
    // Con quién estuvo en cada momento (los registros de gente anotados juntos con algo).
    const momentos = [...new Set(gente.map((g) => g.inicio))].map((inicio) => ({ inicio, nombres: gente.filter((g) => g.inicio === inicio).map((g) => g.concepto) }));
    const lugarDe = (iso: string) => {
      const t0 = Date.parse(iso);
      return estadias.find((e) => Date.parse(e.llegada) <= t0 && t0 <= Date.parse(e.salida));
    };
    const r: Sugerencia[] = [];
    for (const x of registros) {
      if (!CON_GENTE.has(claveDe(x.categoria_id)) || x.concepto === VIAJE_PESADO) continue;
      const ya = gente.filter((g) => g.inicio === x.inicio).map((g) => g.concepto);
      const lugarX = lugarDe(x.inicio);
      const nombres = new Set<string>();
      let motivo = '';
      for (const m of momentos) {
        if (m.inicio === x.inicio) continue;
        const cerca = Math.abs(Date.parse(m.inicio) - Date.parse(x.inicio)) <= VENTANA_MIN * 60000;
        const lugarM = lugarDe(m.inicio);
        const mismoLugar = Boolean(lugarX && lugarM && lugarX.lugar_id === lugarM.lugar_id && lugarX.llegada === lugarM.llegada);
        if (!cerca && !mismoLugar) continue;
        for (const n of m.nombres) if (!ya.includes(n) && !no.includes(`${x.id}|${n}`)) nombres.add(n);
        motivo = mismoLugar ? t('en {lugar}', { lugar: lugarX!.lugar }) : t('cerca de esa hora');
      }
      if (nombres.size) r.push({ registro: x, nombres: [...nombres], motivo });
    }
    return r.slice(0, 3);
  }, [registros, estadias, genteId, no]);

  if (!sugerencias.length) return null;
  const y = idioma() === 'en' ? ' and ' : ' y ';
  const unir = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(', ')}${y}${l.at(-1)}` : l[0]);

  const si = async (s: Sugerencia) => {
    setOcupado(true);
    try {
      for (const n of s.nombres) await api('POST', '/api/registros', { persona_id: persona.id, concepto_nombre: n, categoria_id: genteId, inicio: s.registro.inicio });
      alCambiar();
    } finally {
      setOcupado(false);
    }
  };
  const tampoco = (s: Sugerencia) => {
    const l = [...no, ...s.nombres.map((n) => `${s.registro.id}|${n}`)].slice(-300);
    setNo(l);
    try {
      localStorage.setItem(CLAVE, JSON.stringify(l));
    } catch {
      /* sin almacenamiento */
    }
  };

  return (
    <div className="tarjeta compania-sugerida">
      {sugerencias.map((s) => (
        <div key={s.registro.id} className="sugerencia-compania">
          <p>
            {t('👥 ¿También estuviste con {lista} en «{que}» ({hora})?', { lista: unir(s.nombres), que: t(s.registro.concepto), hora: horaEn(s.registro.inicio, persona.zona_horaria) })}
            <span className="suave chico"> · {s.motivo}</span>
          </p>
          <span className="botones-como">
            <button className="btn chico primario" disabled={ocupado} onClick={() => void si(s)}>{t('Sí')}</button>
            <button className="btn chico" disabled={ocupado} onClick={() => tampoco(s)}>{t('No')}</button>
          </span>
        </div>
      ))}
    </div>
  );
}
