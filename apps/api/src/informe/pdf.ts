// El informe para el médico en PDF (A4), dibujado con pdfkit a partir de datosInforme: la cabecera con el búho de
// Patty, los datos de la persona, los malestares, los remedios, el sueño, el ánimo, el ciclo y los patrones, y abajo de
// cada hoja que Patty no diagnostica. Con las letras que trae el PDF (Helvetica): los emojis y símbolos raros se sacan.
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import { estadoDe, svgMascota, traducir, traducirDato } from 'shared';
import { sumarDias } from '../lib/fechas.js';
import type { DatosInforme, Franja } from './datos.js';

const COLOR = {
  texto: '#1f1d26',
  suave: '#6b6878',
  borde: '#e4e0ef',
  acento: '#6b4fbb',
  acentoSuave: '#ece7fa',
  fondo: '#f6f4fb',
  verde: '#1f7a4d',
  ambar: '#946200',
  rojo: '#b42318',
};
const MARGEN = 48;
const PIE = 40;

/** Deja solo lo que se puede escribir con las letras estándar del PDF (WinAnsi): saca emojis y símbolos raros. */
export function limpiar(s: string): string {
  return s
    .replace(/[→⇒➔]/g, '->')
    .replace(/[≤]/g, '<=')
    .replace(/[≥]/g, '>=')
    .replace(/[^\x20-\x7E\xA0-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ\n]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function pdfInforme(d: DatosInforme): Promise<Buffer> {
  const idioma = d.idioma;
  const t = (texto: string, vars?: Record<string, string | number>) => traducir(idioma, texto, vars);
  const loc = idioma === 'en' ? 'en-US' : 'es-AR';
  const num = (n: number, dec = 1) => n.toLocaleString(loc, { maximumFractionDigits: dec });
  const fecha = (f: string, opciones: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) =>
    new Date(`${f}T12:00:00Z`).toLocaleDateString(loc, { ...opciones, timeZone: 'UTC' });
  const hora = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  const hm = (h: number) => {
    const min = Math.round(h * 60);
    return min % 60 ? t('{h} h {m} min', { h: Math.floor(min / 60), m: min % 60 }) : t('{h} h', { h: min / 60 });
  };
  const duracion = (min: number) => (min < 60 ? t('{m} min', { m: min }) : hm(min / 60));
  const franja: Record<Franja, string> = { manana: t('a la mañana'), tarde: t('a la tarde'), noche: t('a la noche') };

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGEN, bottom: MARGEN + PIE, left: MARGEN, right: MARGEN },
    bufferPages: true,
    info: { Title: limpiar(t('Informe para el médico: {nombre}', { nombre: d.persona.nombre })), Author: 'Patty', Creator: 'Patty (patty.today)' },
  });
  const partes: Buffer[] = [];
  doc.on('data', (b: Buffer) => partes.push(b));
  const listo = new Promise<Buffer>((res, rej) => {
    doc.on('end', () => res(Buffer.concat(partes)));
    doc.on('error', rej);
  });

  const ancho = doc.page.width - MARGEN * 2;
  const abajo = () => doc.page.height - doc.page.margins.bottom;
  /** Si no entra `alto` en lo que queda de la hoja, pasa a la siguiente. */
  const lugar = (alto: number) => {
    if (doc.y + alto > abajo()) doc.addPage();
  };
  const texto = (s: string, o: PDFKit.Mixins.TextOptions & { tam?: number; color?: string; negrita?: boolean } = {}) => {
    const { tam = 10, color = COLOR.texto, negrita = false, ...resto } = o;
    doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(tam).fillColor(color).text(limpiar(s), resto);
  };

  // ---------- Cabecera ----------
  const arriba = MARGEN;
  doc.roundedRect(MARGEN, arriba, ancho, 78, 12).fill(COLOR.fondo);
  SVGtoPDF(doc, svgMascota('feliz', { lado: 64, zona: 380, centro: 160 }), MARGEN + 10, arriba + 7, { width: 64, height: 64 });
  doc.font('Helvetica-Bold').fontSize(20).fillColor(COLOR.acento).text('Patty', MARGEN + 84, arriba + 14, { lineBreak: false });
  doc.font('Helvetica').fontSize(9).fillColor(COLOR.suave).text('patty.today', MARGEN + 84, arriba + 38, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(15).fillColor(COLOR.texto).text(limpiar(t('Informe para el médico')), MARGEN + 190, arriba + 14, { width: ancho - 200, align: 'right' });
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor(COLOR.suave)
    .text(limpiar(t('Del {desde} al {hasta} ({n} días)', { desde: fecha(d.desde), hasta: fecha(d.hasta), n: d.dias })), MARGEN + 190, arriba + 36, { width: ancho - 200, align: 'right' })
    .text(limpiar(t('Hecho el {fecha}', { fecha: fecha(d.hasta) })), { width: ancho - 200, align: 'right' });
  doc.y = arriba + 94;
  doc.x = MARGEN;

  // ---------- La persona ----------
  const sexo = d.persona.sexo ? traducirDato({ femenino: 'Mujer', masculino: 'Varón', otro: 'Otro' }[d.persona.sexo] ?? d.persona.sexo, idioma) : null;
  const datosPersona = [
    d.persona.edad !== null ? t('{n} años', { n: d.persona.edad }) : null,
    sexo,
    d.persona.altura_cm ? `${d.persona.altura_cm} cm` : null,
    d.persona.peso_kg ? `${num(d.persona.peso_kg)} kg` : null,
  ].filter(Boolean);
  texto(d.persona.nombre, { tam: 16, negrita: true });
  if (datosPersona.length) texto(datosPersona.join('  ·  '), { tam: 10.5, color: COLOR.suave });
  if (d.persona.condiciones.length) texto(`${t('Condiciones que contó')}: ${d.persona.condiciones.map((c) => traducirDato(c, idioma)).join(', ')}`, { tam: 10 });
  doc.moveDown(0.4);
  texto(
    t('Anotó algo {n} de los {total} días del período. Todo sale de lo que la persona fue anotando en Patty (y de lo que juntan el teléfono o el reloj).', {
      n: d.dias_anotados,
      total: d.dias,
    }),
    { tam: 9.5, color: COLOR.suave },
  );
  doc.moveDown(0.6);

  // ---------- Ayudas de dibujo ----------
  const seccion = (titulo: string) => {
    lugar(60);
    doc.moveDown(0.5);
    const y = doc.y;
    doc.rect(MARGEN, y + 1, 4, 15).fill(COLOR.acento);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(COLOR.texto).text(limpiar(titulo), MARGEN + 12, y, { width: ancho - 12 });
    doc.x = MARGEN;
    doc.moveDown(0.35);
  };
  const vacio = (s: string) => texto(s, { tam: 10, color: COLOR.suave });

  /** Una tabla simple: encabezado violeta claro, renglones con el alto de lo que más ocupa, y corte de hoja prolijo. */
  const tabla = (columnas: Array<{ titulo: string; ancho: number; derecha?: boolean }>, renglones: string[][]) => {
    const total = columnas.reduce((a, c) => a + c.ancho, 0);
    const anchos = columnas.map((c) => (c.ancho / total) * ancho);
    const pad = 5;
    const alto = (celdas: string[], negrita: boolean) => {
      doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      return Math.max(...celdas.map((c, i) => doc.heightOfString(limpiar(c) || ' ', { width: anchos[i] - pad * 2 }))) + pad * 2;
    };
    const fila = (celdas: string[], negrita: boolean, fondo: string | null) => {
      const h = alto(celdas, negrita);
      if (doc.y + h > abajo()) {
        doc.addPage();
        if (!negrita) fila(columnas.map((c) => c.titulo), true, COLOR.acentoSuave);
      }
      const y = doc.y;
      if (fondo) doc.rect(MARGEN, y, ancho, h).fill(fondo);
      let x = MARGEN;
      celdas.forEach((c, i) => {
        doc
          .font(negrita ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(9)
          .fillColor(negrita ? COLOR.acento : COLOR.texto)
          .text(limpiar(c), x + pad, y + pad, { width: anchos[i] - pad * 2, align: columnas[i].derecha ? 'right' : 'left' });
        x += anchos[i];
      });
      doc.moveTo(MARGEN, y + h).lineTo(MARGEN + ancho, y + h).lineWidth(0.5).strokeColor(COLOR.borde).stroke();
      doc.x = MARGEN;
      doc.y = y + h;
    };
    fila(columnas.map((c) => c.titulo), true, COLOR.acentoSuave);
    renglones.forEach((r, i) => fila(r, false, i % 2 ? COLOR.fondo : null));
    doc.moveDown(0.5);
  };

  /** Barras verticales simples (una por día o semana), con una línea de referencia opcional. */
  const barras = (valores: Array<{ valor: number | null; color: string; etiqueta?: string }>, max: number, o: { alto?: number; referencia?: { valor: number; texto: string }; escala: string }) => {
    const alto = o.alto ?? 64;
    const conEtiquetas = valores.some((v) => v.etiqueta);
    lugar(alto + (conEtiquetas ? 30 : 18));
    const y0 = doc.y + 4;
    const x0 = MARGEN + 26;
    const w = ancho - 26;
    doc.font('Helvetica').fontSize(7).fillColor(COLOR.suave);
    doc.text(limpiar(o.escala), MARGEN, y0 - 2, { width: 24, lineBreak: false });
    doc.text('0', MARGEN, y0 + alto - 7, { width: 24, lineBreak: false });
    doc.moveTo(x0, y0 + alto).lineTo(x0 + w, y0 + alto).lineWidth(0.6).strokeColor(COLOR.borde).stroke();
    const paso = w / Math.max(valores.length, 1);
    const gruesa = Math.min(paso * 0.7, 28);
    valores.forEach((v, i) => {
      const x = x0 + i * paso + (paso - gruesa) / 2;
      if (v.valor !== null && v.valor > 0) {
        const h = Math.max(1.5, (Math.min(v.valor, max) / max) * alto);
        doc.roundedRect(x, y0 + alto - h, gruesa, h, Math.min(2.5, gruesa / 3)).fill(v.color);
      }
      if (v.etiqueta) doc.font('Helvetica').fontSize(6.5).fillColor(COLOR.suave).text(limpiar(v.etiqueta), x0 + i * paso, y0 + alto + 3, { width: paso, align: 'center', lineBreak: false });
    });
    if (o.referencia) {
      const yr = y0 + alto - (o.referencia.valor / max) * alto;
      doc.moveTo(x0, yr).lineTo(x0 + w, yr).dash(2, { space: 2 }).lineWidth(0.6).strokeColor(COLOR.suave).stroke().undash();
      doc.font('Helvetica').fontSize(7).fillColor(COLOR.suave).text(limpiar(o.referencia.texto), x0 + w - 120, yr - 9, { width: 120, align: 'right', lineBreak: false });
    }
    doc.x = MARGEN;
    doc.y = y0 + alto + (conEtiquetas ? 16 : 8);
  };

  // ---------- Malestares ----------
  seccion(t('Malestares y dolores'));
  if (!d.malestares.length) vacio(t('No anotó malestares ni dolores en el período.'));
  else {
    texto(t('Intensidad de 0 a 10, como la anotó la persona. La duración sale de los que tienen anotado cuándo terminaron.'), { tam: 8.5, color: COLOR.suave });
    doc.moveDown(0.3);
    tabla(
      [
        { titulo: t('Malestar'), ancho: 22 },
        { titulo: t('Días'), ancho: 7, derecha: true },
        { titulo: t('Veces'), ancho: 8, derecha: true },
        { titulo: t('Intensidad'), ancho: 24 },
        { titulo: t('Duración'), ancho: 14 },
        { titulo: t('Cuándo'), ancho: 25 },
      ],
      d.malestares.map((m) => [
        m.nombre,
        String(m.dias),
        String(m.veces),
        m.valor_max !== null
          ? t('hasta {v}', { v: `${num(m.valor_max)}${m.unidad ? ` ${m.unidad}` : ''}` })
          : m.intensidad_prom !== null
            ? t('{prom} en promedio (máx. {max})', { prom: num(m.intensidad_prom), max: m.intensidad_max ?? '-' })
            : '-',
        m.minutos_prom !== null ? (m.con_duracion < m.veces ? t('{d} ({n} de {total})', { d: duracion(m.minutos_prom), n: m.con_duracion, total: m.veces }) : duracion(m.minutos_prom)) : '-',
        [m.franja ? t('más {franja}', { franja: franja[m.franja] }) : null, t('última: {fecha}', { fecha: fecha(m.ultima, { day: 'numeric', month: 'short' }) })].filter(Boolean).join('; '),
      ]),
    );
  }

  // ---------- Remedios ----------
  seccion(t('Remedios'));
  if (!d.remedios.length && !d.tratamientos.length) vacio(t('No anotó remedios en el período.'));
  if (d.remedios.length) {
    tabla(
      [
        { titulo: t('Remedio'), ancho: 28 },
        { titulo: t('Veces'), ancho: 10, derecha: true },
        { titulo: t('Días'), ancho: 10, derecha: true },
        { titulo: t('Dosis habitual'), ancho: 18 },
        { titulo: t('Para qué'), ancho: 34 },
      ],
      d.remedios.map((r) => [r.nombre, String(r.veces), String(r.dias), r.dosis ?? '-', r.para.join(', ') || '-']),
    );
  }
  if (d.tratamientos.length) {
    lugar(50);
    texto(t('Tratamientos cargados'), { tam: 10.5, negrita: true });
    doc.moveDown(0.3);
    tabla(
      [
        { titulo: t('Remedio'), ancho: 28 },
        { titulo: t('Dosis'), ancho: 14 },
        { titulo: t('Cómo'), ancho: 20 },
        { titulo: t('Motivo'), ancho: 20 },
        { titulo: t('Tomas'), ancho: 18 },
      ],
      d.tratamientos.map((x) => [
        x.terminado ? t('{remedio} (terminado)', { remedio: x.remedio }) : x.remedio,
        x.dosis ?? '-',
        x.como,
        x.motivo ?? '-',
        x.programadas ? t('{n} de {total} tomadas', { n: x.tomadas, total: x.programadas }) : '-',
      ]),
    );
  }

  // ---------- Sueño ----------
  seccion(t('Sueño'));
  if (!d.sueno) vacio(t('No hay datos de sueño en el período.'));
  else {
    const s = d.sueno;
    const lineas = [
      s.promedio !== null ? t('Durmió {horas} por noche en promedio ({n} noches con datos; entre {min} y {max}).', { horas: hm(s.promedio), n: s.noches.length, min: hm(s.minimo!), max: hm(s.maximo!) }) : null,
      s.acoste !== null && s.levante !== null
        ? t('Se acostó en promedio a las {acoste} y se levantó a las {levante}.', { acoste: hora(s.acoste), levante: hora(s.levante) })
        : s.acoste !== null
          ? t('Se acostó en promedio a las {hora}.', { hora: hora(s.acoste) })
          : s.levante !== null
            ? t('Se levantó en promedio a las {hora}.', { hora: hora(s.levante) })
            : null,
      s.despertares ? t('Contó que se despertó a la noche {n} veces.', { n: s.despertares }) : null,
    ].filter((x): x is string => Boolean(x));
    for (const l of lineas) texto(l, { tam: 10 });
    if (s.noches.length >= 3) {
      doc.moveDown(0.4);
      const porFecha = new Map(s.noches.map((n) => [n.fecha, n.horas]));
      const valores: Array<{ valor: number | null; color: string; etiqueta?: string }> = [];
      for (let f = d.desde; f <= d.hasta; f = sumarDias(f, 1)) {
        const h = porFecha.get(f) ?? null;
        valores.push({ valor: h, color: h !== null && h < 6 ? COLOR.ambar : COLOR.acento, etiqueta: d.dias <= 14 ? fecha(f, { day: 'numeric', month: 'numeric' }) : undefined });
      }
      barras(valores, 12, { escala: '12 h', referencia: { valor: 7, texto: t('7 h') } });
      texto(t('Horas dormidas por noche (en ámbar, menos de 6 h).'), { tam: 8, color: COLOR.suave });
    }
  }

  // ---------- Ánimo ----------
  seccion(t('Ánimo'));
  if (!d.animo) vacio(t('No contó cómo se sentía en el período.'));
  else {
    const a = d.animo;
    const tend = a.tendencia === 'mejora' ? t('fue mejorando') : a.tendencia === 'empeora' ? t('fue empeorando') : a.tendencia === 'estable' ? t('se mantuvo parecido') : null;
    texto(
      t('Contó cómo se sentía {n} días: {muy_bien} muy bien, {bien} bien, {mal} mal y {muy_mal} muy mal.', { n: a.dias, ...a.por_estado }) +
        (tend ? ` ${t('A lo largo del período, {tendencia}.', { tendencia: tend })}` : ''),
      { tam: 10 },
    );
    doc.moveDown(0.4);
    const colorDe = (v: number) => (v >= 6 ? COLOR.verde : v >= 4 ? COLOR.ambar : COLOR.rojo);
    barras(
      a.tramos.map((x) => ({
        valor: x.promedio,
        color: x.promedio === null ? COLOR.borde : colorDe(x.promedio),
        etiqueta: fecha(x.desde, { day: 'numeric', month: 'numeric' }),
      })),
      10,
      { escala: '10', alto: 54 },
    );
    texto(
      d.dias <= 14
        ? t('Ánimo de cada día, de 1 (muy mal) a 10 (muy bien).')
        : t('Ánimo promedio de cada semana (la fecha es el primer día), de 1 (muy mal) a 10 (muy bien). En promedio: {estado}.', {
            estado: traducirDato(estadoDe(Math.round(a.promedio)).nombre, idioma).toLocaleLowerCase(loc),
          }),
      { tam: 8, color: COLOR.suave },
    );
  }

  // ---------- Ciclo ----------
  if (d.ciclo) {
    seccion(t('Ciclo menstrual'));
    const c = d.ciclo;
    texto(
      c.ciclos >= 1
        ? t('Ciclos de {n} días en promedio, con menstruación de {p} días ({ciclos} ciclos anotados).', { n: c.duracion_ciclo, p: c.duracion_periodo, ciclos: c.ciclos })
        : t('Todavía no hay ciclos completos anotados (menstruación de {p} días).', { p: c.duracion_periodo }),
      { tam: 10 },
    );
    if (c.regular !== null) texto(c.regular ? t('Los ciclos son regulares (varían menos de una semana).') : t('Los ciclos varían bastante de largo.'), { tam: 10 });
    texto(
      c.inicios.length
        ? t('En el período empezó a menstruar el {fechas}.', { fechas: c.inicios.map((f) => fecha(f, { day: 'numeric', month: 'long' })).join(', ') })
        : t('No anotó menstruación en el período.'),
      { tam: 10 },
    );
    if (c.proxima) texto(t('Próxima menstruación estimada: {fecha}.', { fecha: fecha(c.proxima, { day: 'numeric', month: 'long' }) }), { tam: 10, color: COLOR.suave });
  }

  // ---------- Patrones ----------
  seccion(t('Lo que encontró Patty'));
  if (!d.hallazgos.length) vacio(t('Todavía no hay patrones claros en lo anotado.'));
  else {
    texto(
      t('Patty compara los días en que pasó algo con los demás. Son relaciones en los datos de esta persona, no causas comprobadas: sirven como pista para conversar.'),
      { tam: 8.5, color: COLOR.suave },
    );
    doc.moveDown(0.5);
    for (const h of d.hallazgos) {
      doc.font('Helvetica').fontSize(9.5);
      const alto = doc.heightOfString(limpiar(h.texto), { width: ancho - 24 }) + 52;
      lugar(alto);
      const y = doc.y;
      doc.roundedRect(MARGEN, y, ancho, alto - 8, 8).fill(COLOR.fondo);
      // El título: causa → efecto, con la flecha dibujada (la letra del PDF no la tiene).
      const causa = limpiar(h.causa);
      const efecto = limpiar(h.efecto);
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLOR.texto);
      const wCausa = Math.min(doc.widthOfString(causa), ancho / 2 - 30);
      doc.text(causa, MARGEN + 12, y + 9, { width: ancho / 2 - 30, lineBreak: false, ellipsis: true });
      const xf = MARGEN + 12 + wCausa + 6;
      doc.moveTo(xf, y + 14.5).lineTo(xf + 14, y + 14.5).lineWidth(1.2).strokeColor(COLOR.acento).stroke();
      doc.moveTo(xf + 10, y + 11).lineTo(xf + 14.5, y + 14.5).lineTo(xf + 10, y + 18).stroke();
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLOR.texto).text(efecto, xf + 20, y + 9, { width: MARGEN + ancho - (xf + 20) - 90, lineBreak: false, ellipsis: true });
      if (h.confirmado) {
        doc.roundedRect(MARGEN + ancho - 92, y + 7, 82, 14, 7).fill(COLOR.acentoSuave);
        doc.font('Helvetica-Bold').fontSize(7).fillColor(COLOR.acento).text(limpiar(t('Dice que le pasa')), MARGEN + ancho - 92, y + 10.5, { width: 82, align: 'center', lineBreak: false });
      }
      doc.font('Helvetica').fontSize(8.5).fillColor(COLOR.suave).text(limpiar(`${h.cuando[0].toLocaleUpperCase(loc)}${h.cuando.slice(1)} · ${h.detalle}`), MARGEN + 12, y + 25, { width: ancho - 24 });
      doc.font('Helvetica').fontSize(9.5).fillColor(COLOR.texto).text(limpiar(h.texto), MARGEN + 12, y + 39, { width: ancho - 24 });
      doc.x = MARGEN;
      doc.y = y + alto;
    }
  }

  // ---------- Aclaración ----------
  doc.moveDown(0.6);
  const aclaracion = t(
    'Patty no diagnostica ni reemplaza la consulta. Este informe resume lo que la persona anotó en la app para ayudar a contarle al médico cómo estuvo; los datos pueden estar incompletos y los patrones son asociaciones, no causas. Cualquier decisión sobre la salud o los remedios la toma un profesional.',
  );
  doc.font('Helvetica').fontSize(9);
  const altoAcl = doc.heightOfString(limpiar(aclaracion), { width: ancho - 28 }) + 20;
  lugar(altoAcl);
  const ya = doc.y;
  doc.roundedRect(MARGEN, ya, ancho, altoAcl, 8).lineWidth(0.8).strokeColor(COLOR.acento).stroke();
  doc.font('Helvetica').fontSize(9).fillColor(COLOR.texto).text(limpiar(aclaracion), MARGEN + 14, ya + 10, { width: ancho - 28 });

  // ---------- Pie de cada hoja ----------
  const hojas = doc.bufferedPageRange();
  for (let i = hojas.start; i < hojas.start + hojas.count; i++) {
    doc.switchToPage(i);
    // Se escribe en el margen de abajo: sin esto, pdfkit agrega una hoja nueva.
    const margen = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - MARGEN - 14;
    doc.moveTo(MARGEN, y - 6).lineTo(MARGEN + ancho, y - 6).lineWidth(0.5).strokeColor(COLOR.borde).stroke();
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(COLOR.suave)
      .text(limpiar(t('Patty · {nombre} · No es un diagnóstico médico.', { nombre: d.persona.nombre })), MARGEN, y, { width: ancho - 80, lineBreak: false })
      .text(limpiar(t('Hoja {n} de {total}', { n: i - hojas.start + 1, total: hojas.count })), MARGEN + ancho - 80, y, { width: 80, align: 'right', lineBreak: false });
    doc.page.margins.bottom = margen;
  }
  doc.end();
  return listo;
}
