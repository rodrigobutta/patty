// Al tocar algo anotado en el Día: primero un resumen de lo que fue (horario, cuánto duró, lo contestado, con quién,
// la nota) y, si fue un paseo, una salida o un viaje, el recorrido que vio la ubicación en ese rato, con su mapa, los
// km, la velocidad y de dónde a dónde. Para afinarlo, el botón Editar abre la hoja de siempre.
import type { ReactNode } from 'react';
import type { Categoria, Persona, Registro } from 'shared';
import { duracion } from '../lib/automatico';
import { horaEn } from '../lib/fechas';
import { locale, t } from '../lib/idioma';
import { detalleDelMedio } from '../lib/medios';
import { etiquetaDonde } from '../ui/DondeComida';
import { IconoLapiz } from '../ui/Iconos';
import { IconoCategoria } from '../ui/IconosPatty';
import { BotonCompartir } from '../ui/HojaCompartir';
import { useEstado } from '../estado';
import { compartibleRegistro } from '../lib/tarjetasDelDia';
import { RecorridoDeRegistro } from './RecorridoDelDia';

/** Lo que no tiene fin anotado se mira como un rato de media hora para buscarle el recorrido. */
const RATO_SIN_FIN = 30 * 60000;

export function ResumenRegistro({ persona, registro: r, categoria: cat, frase, gente = [], alCerrar, alEditar }: {
  persona: Persona;
  registro: Registro;
  categoria?: Categoria;
  /** La misma frase del renglón del Día. */
  frase: ReactNode;
  gente?: string[];
  alCerrar(): void;
  /** Sin esto (quien solo mira), no hay botón de editar. */
  alEditar?: () => void;
}) {
  const { usuario } = useEstado();
  const zona = persona.zona_horaria;
  const min = r.fin ? (Date.parse(r.fin) - Date.parse(r.inicio)) / 60000 : null;
  const finRato = r.fin ?? new Date(Date.parse(r.inicio) + RATO_SIN_FIN).toISOString();
  const cantidad = r.valor !== null && cat?.tipo_valor !== 'intensidad' ? `${Number(r.valor).toLocaleString(locale())}${r.unidad ? ` ${t(r.unidad)}` : ''}` : null;
  const filas: Array<[string, string | null]> = [
    [t('Horario'), r.fin ? `${horaEn(r.inicio, zona)} → ${horaEn(r.fin, zona)}` : r.abierto ? `${horaEn(r.inicio, zona)} → ${t('ahora')}` : horaEn(r.inicio, zona)],
    [t('Duración'), min !== null && min >= 1 ? duracion(min) : null],
    [t('Categoría'), cat ? t(cat.nombre) : null],
    [t('Cantidad'), cantidad],
    [t('Intensidad'), r.intensidad !== null && cat?.clave !== 'animo' ? `${r.intensidad}/10` : null],
    ...(r.detalles ?? []).map((d): [string, string | null] => [t(d.pregunta), d.respuestas.map((x) => t(x)).join(', ') || null]),
    [t('Para'), r.para ? t(r.para) : null],
    [t('Dónde'), etiquetaDonde(r.donde, r.lugar) || null],
    [t('Con quién'), gente.length ? gente.join(', ') : null],
    [r.medio ? t('Qué fue') : '', r.medio ? detalleDelMedio(r.medio).join(' · ') || null : null],
  ];
  return (
    <div className="hoja resumen-registro" role="dialog" aria-label={t(r.concepto)}>
      <div className="hoja-cabeza">
        <h3>
          <IconoCategoria clave={cat?.clave} emoji={cat?.icono} /> {t(r.concepto)}
        </h3>
        <button className="btn-icono" onClick={alCerrar} aria-label={t('Cerrar')}>✕</button>
      </div>
      <p className="resumen-frase">{frase}</p>
      <ul className="detalle-auto recorrido-datos">
        {filas.map(([que, valor]) =>
          valor ? (
            <li key={que}>
              <span className="que">{que}</span>
              <span className="valor-chip">{valor}</span>
            </li>
          ) : null,
        )}
      </ul>
      {r.nota ? <p className="resumen-nota">{r.nota}</p> : null}
      <RecorridoDeRegistro persona={persona} fecha={r.fecha} inicio={r.inicio} fin={finRato} />
      {usuario?.rol !== 'lector' ? (
        <div className="fila-compartir">
          <BotonCompartir
            armar={() =>
              compartibleRegistro({
                persona,
                concepto: r.concepto,
                claveCategoria: cat?.clave,
                emoji: cat?.icono,
                inicio: r.inicio,
                fin: r.fin,
                fecha: r.fecha,
                // El horario y la duración ya van arriba en la imagen; la categoría no hace falta.
                detalles: filas.slice(3).flatMap(([nombre, valor]) => (nombre && valor ? [{ nombre, valor }] : [])),
                nota: r.nota,
              })
            }
          />
        </div>
      ) : null}
      {alEditar ? (
        <button className="btn primario ancho resumen-editar" onClick={alEditar}><IconoLapiz tamano={18} /> {t('Editar')}</button>
      ) : null}
    </div>
  );
}
