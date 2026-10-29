// Las imágenes para compartir (un patrón, la racha, la semana, un nivel, una actividad con su mapita, una noche de
// sueño): 1080 x 1350, que es lo que mejor se ve en WhatsApp y en Instagram. Se dibujan en el teléfono, en un canvas:
// fondo violeta de Patty, una tarjeta blanca con lo que se comparte, el búho y "patty.today" abajo. Recibe los textos
// ya traducidos y nunca lleva nombres ni lo anotado.
import { svgMascota, type Cara } from '../mascota/dibujo';
import { dibujarMapa, prepararMapa, redondeado, type Coord, type MapaListo } from './mapaTarjeta';

export const ANCHO = 1080;
export const ALTO = 1350;

export type Tarjeta = {
  /** La frase de arriba ("Patty encontró un patrón en mis días"). */
  arriba: string;
  /** La que va abajo de patty.today. */
  lema?: string;
  cara?: Cara;
} & (
  | {
      tipo: 'patron';
      causa: string;
      efecto: string;
      /** "al día siguiente". */
      cuando: string;
      /** "×13" y "más probable". */
      numero: string;
      numeroTexto: string;
      aclaracion: string;
    }
  | {
      /** Un número grande con un emoji: la racha, un nivel. */
      tipo: 'grande';
      emoji: string;
      numero: string;
      texto: string;
      detalle?: string;
    }
  | {
      tipo: 'semana';
      subtitulo: string;
      filas: Array<{ nombre: string; valor: string; flecha?: '▲' | '▼'; bien?: boolean }>;
    }
  | {
      /** Una actividad o un viaje: qué fue, a qué hora, los números (duración, km) y el mapita si hay recorrido. */
      tipo: 'actividad';
      /** El dibujo de Patty (un SVG, ver iconoParaTarjeta). */
      icono?: string;
      titulo: string;
      cuando: string;
      datos: Array<{ valor: string; texto: string }>;
      camino?: Coord[];
      /** false: el recorrido sobre el fondo lila, sin los cuadraditos del mapa. */
      teselas?: boolean;
    }
  | {
      /** Una noche: las horas, de cuándo a cuándo, el gráfico de las etapas, la nota y un pedacito de lo que dijo Patty. */
      tipo: 'sueno';
      icono?: string;
      horas: string;
      horario: string;
      calidad?: { nota: number; texto: string };
      /** Las filas del gráfico, de arriba (despierto) a abajo (profundo). */
      niveles: Array<{ nombre: string; color: string; total?: string }>;
      /** Cada tramo de la noche: de dónde a dónde (de 0 a 1) y en qué fila. */
      tramos: Array<{ desde: number; hasta: number; nivel: number }>;
      /** Las horas del eje de abajo. */
      marcas: Array<{ en: number; texto: string }>;
      comentario?: string;
    }
);

const TINTA = '#2a2440';
const ACENTO = '#6b4fbb';
const SUAVE = '#8a83a3';
const LILA = '#e6defc';
const VERDE = '#2f9e6b';
const ROJO = '#d0574b';
const LETRA = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const fuente = (peso: number, tamano: number) => `${peso} ${tamano}px ${LETRA}`;

/** Parte un texto en renglones que entren en `ancho` (una palabra que no entra sola queda en su renglón). */
export function partirEnLineas(texto: string, ancho: number, medir: (s: string) => number): string[] {
  const lineas: string[] = [];
  let actual = '';
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    const probar = actual ? `${actual} ${palabra}` : palabra;
    if (actual && medir(probar) > ancho) {
      lineas.push(actual);
      actual = palabra;
    } else actual = probar;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

type Ctx = CanvasRenderingContext2D;

/** Un bloque de texto: lo mide y lo dibuja desde `y` (arriba); devuelve la altura que ocupa. */
interface Bloque {
  alto: number;
  dibujar(c: Ctx, x: number, y: number, ancho: number): void;
}

function texto(c: Ctx, t: string, o: { peso: number; tamano: number; color: string; ancho: number; centrado?: boolean; interlineado?: number; maxLineas?: number }): Bloque {
  c.font = fuente(o.peso, o.tamano);
  let lineas = partirEnLineas(t, o.ancho, (s) => c.measureText(s).width);
  if (o.maxLineas && lineas.length > o.maxLineas) {
    lineas = lineas.slice(0, o.maxLineas);
    lineas[lineas.length - 1] += '…';
  }
  const alto = o.tamano * (o.interlineado ?? 1.18);
  return {
    alto: lineas.length * alto,
    dibujar(c, x, y, ancho) {
      c.font = fuente(o.peso, o.tamano);
      c.fillStyle = o.color;
      c.textBaseline = 'alphabetic';
      c.textAlign = o.centrado ? 'center' : 'left';
      lineas.forEach((l, i) => c.fillText(l, o.centrado ? x + ancho / 2 : x, y + i * alto + o.tamano * 0.92));
      c.textAlign = 'left';
    },
  };
}

const espacio = (alto: number): Bloque => ({ alto, dibujar() {} });

function fondo(c: Ctx) {
  const g = c.createLinearGradient(0, 0, ANCHO, ALTO);
  g.addColorStop(0, '#8466dc');
  g.addColorStop(0.55, '#5f43b4');
  g.addColorStop(1, '#3b2880');
  c.fillStyle = g;
  c.fillRect(0, 0, ANCHO, ALTO);
  // Unas burbujas suaves y puntitos, como los datos que junta Patty.
  c.fillStyle = 'rgba(255,255,255,0.07)';
  for (const [x, y, r] of [[980, 120, 260], [80, 1240, 220], [1000, 1180, 120]]) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = 'rgba(255,255,255,0.28)';
  for (const [x, y, r] of [[930, 300, 7], [990, 360, 4], [140, 90, 5], [880, 1040, 6], [60, 980, 4]]) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => mal(new Error('imagen'));
    img.src = src;
  });
}

/** Un patrón: la causa, la flecha, el efecto, cuándo y cuánto más probable; `tam` es la letra de los nombres. */
function bloquesPatron(c: Ctx, d: Extract<Tarjeta, { tipo: 'patron' }>, ancho: number, tam: number): Bloque[] {
  const grande = Math.min(150, Math.round(tam * 1.8));
  const flecha: Bloque = {
    alto: 96,
    dibujar(c, x, y) {
      c.fillStyle = '#ece7fa';
      c.beginPath();
      c.arc(x + 44, y + 48, 40, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = ACENTO;
      c.lineWidth = 9;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(x + 44, y + 26);
      c.lineTo(x + 44, y + 70);
      c.moveTo(x + 26, y + 54);
      c.lineTo(x + 44, y + 72);
      c.lineTo(x + 62, y + 54);
      c.stroke();
    },
  };
  c.font = fuente(800, grande);
  const anchoNumero = c.measureText(d.numero).width;
  const numero: Bloque = {
    alto: grande,
    dibujar(c, x, y) {
      c.font = fuente(800, grande);
      c.fillStyle = ACENTO;
      c.fillText(d.numero, x, y + grande * 0.87);
      c.font = fuente(700, 50);
      c.fillStyle = TINTA;
      c.fillText(d.numeroTexto, x + anchoNumero + 24, y + grande * 0.85);
    },
  };
  const linea: Bloque = {
    alto: 2,
    dibujar(c, x, y, w) {
      c.fillStyle = '#e8e3f5';
      c.fillRect(x, y, w, 2);
    },
  };
  return [
    texto(c, d.causa, { peso: 800, tamano: tam, color: TINTA, ancho, maxLineas: 4 }),
    espacio(18),
    flecha,
    espacio(18),
    texto(c, d.efecto, { peso: 800, tamano: tam, color: TINTA, ancho, maxLineas: 3 }),
    espacio(20),
    texto(c, d.cuando, { peso: 500, tamano: 42, color: SUAVE, ancho }),
    espacio(40),
    linea,
    espacio(28),
    numero,
    espacio(24),
    texto(c, d.aclaracion, { peso: 500, tamano: 30, color: SUAVE, ancho, maxLineas: 2 }),
  ];
}

/** Arriba de una actividad o de una noche: el dibujo de Patty en un círculo lila y, al lado, el título y lo de abajo. */
function cabecera(c: Ctx, icono: HTMLImageElement | null, titulo: string, sub: string, ancho: number, tamTitulo: number, colorTitulo = TINTA, derecha = 0): Bloque {
  const lado = 128;
  const izq = icono ? lado + 32 : 0;
  const a = texto(c, titulo, { peso: 800, tamano: tamTitulo, color: colorTitulo, ancho: ancho - izq - derecha, maxLineas: 2, interlineado: 1.08 });
  const b = texto(c, sub, { peso: 500, tamano: 36, color: SUAVE, ancho: ancho - izq - derecha, maxLineas: 2 });
  const altoTexto = a.alto + 10 + b.alto;
  const alto = Math.max(icono ? lado : 0, altoTexto);
  return {
    alto,
    dibujar(c, x, y) {
      if (icono) {
        c.fillStyle = '#efe9fc';
        c.beginPath();
        c.arc(x + lado / 2, y + alto / 2, lado / 2, 0, Math.PI * 2);
        c.fill();
        c.drawImage(icono, x + 22, y + alto / 2 - lado / 2 + 22, lado - 44, lado - 44);
      }
      const yt = y + (alto - altoTexto) / 2;
      a.dibujar(c, x + izq, yt, ancho - izq);
      b.dibujar(c, x + izq, yt + a.alto + 10, ancho - izq);
    },
  };
}

/** Los números en columnas (duración, km…), separados por una rayita. */
function columnas(c: Ctx, datos: Array<{ valor: string; texto: string }>, ancho: number, tam: number): Bloque {
  const n = Math.max(1, datos.length);
  const w = ancho / n;
  let t = tam;
  c.font = fuente(800, t);
  while (t > 36 && datos.some((d) => c.measureText(d.valor).width > w - 24)) c.font = fuente(800, (t -= 4));
  return {
    alto: t + 54,
    dibujar(c, x, y) {
      datos.forEach((d, i) => {
        const cx = x + w * i + w / 2;
        if (i) {
          c.fillStyle = '#eeeaf7';
          c.fillRect(x + w * i, y + 8, 2, t + 38);
        }
        c.textAlign = 'center';
        c.font = fuente(800, t);
        c.fillStyle = ACENTO;
        c.fillText(d.valor, cx, y + t * 0.9);
        c.font = fuente(500, 30);
        c.fillStyle = SUAVE;
        c.fillText(d.texto, cx, y + t + 40);
        c.textAlign = 'left';
      });
    },
  };
}

async function bloquesActividad(c: Ctx, d: Extract<Tarjeta, { tipo: 'actividad' }>, ancho: number, maxAlto: number, icono: HTMLImageElement | null): Promise<Bloque[]> {
  const conMapa = (d.camino?.length ?? 0) > 1;
  const arriba = cabecera(c, icono, d.titulo, d.cuando, ancho, conMapa ? 60 : 72);
  const numeros = d.datos.length ? columnas(c, d.datos, ancho, conMapa ? 64 : 88) : null;
  if (!conMapa) return [arriba, ...(numeros ? [espacio(56), linea(), espacio(48), numeros] : [])];
  const fijo = arriba.alto + 36 + (numeros ? 40 + numeros.alto : 0);
  const altoMapa = Math.round(Math.max(240, Math.min(420, maxAlto - fijo)));
  const camino = d.camino!;
  const listo: MapaListo = await prepararMapa(camino, ancho, altoMapa, d.teselas === false ? null : undefined);
  const mapa: Bloque = { alto: altoMapa, dibujar: (c, x, y, w) => dibujarMapa(c, listo, camino, x, y, w, altoMapa) };
  return [arriba, espacio(36), mapa, ...(numeros ? [espacio(40), numeros] : [])];
}

const linea = (): Bloque => ({
  alto: 2,
  dibujar(c, x, y, w) {
    c.fillStyle = '#e8e3f5';
    c.fillRect(x, y, w, 2);
  },
});

/** La nota de la noche: un círculo del color según qué tan bien fue, con el número adentro. */
function colorCalidad(nota: number): string {
  return nota >= 8 ? VERDE : nota >= 5 ? '#e0a020' : ROJO;
}

function bloquesSueno(c: Ctx, d: Extract<Tarjeta, { tipo: 'sueno' }>, ancho: number, maxAlto: number, icono: HTMLImageElement | null): Bloque[] {
  const R = 68;
  const nota: Bloque | null = d.calidad
    ? {
        alto: 0,
        dibujar(c, x, y) {
          const cx = x + ancho - R;
          const cy = y + R;
          c.fillStyle = colorCalidad(d.calidad!.nota);
          c.beginPath();
          c.arc(cx, cy, R, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#ffffff';
          c.font = fuente(800, 60);
          const n = String(d.calidad!.nota);
          const wn = c.measureText(n).width;
          c.font = fuente(700, 28);
          const wd = c.measureText('/10').width;
          const x0 = cx - (wn + wd) / 2;
          c.font = fuente(800, 60);
          c.fillText(n, x0, cy + 8);
          c.font = fuente(700, 28);
          c.fillText('/10', x0 + wn + 2, cy + 8);
          c.textAlign = 'center';
          c.font = fuente(600, 22);
          c.fillText(d.calidad!.texto, cx, cy + 40);
          c.textAlign = 'left';
        },
      }
    : null;
  const arriba = cabecera(c, icono, d.horas, d.horario, ancho, 92, ACENTO, nota ? R * 2 + 24 : 0);
  const cabeza: Bloque = { alto: Math.max(arriba.alto, nota ? R * 2 : 0), dibujar(c, x, y, w) { arriba.dibujar(c, x, y, w); nota?.dibujar(c, x, y, w); } };

  // El gráfico: una fila por etapa, con las barras en escalones y las horas abajo.
  const FILA = 50;
  const BARRA = 30;
  c.font = fuente(600, 26);
  const izq = Math.max(...d.niveles.map((n) => c.measureText(n.nombre).width)) + 22;
  const grafico: Bloque = {
    alto: d.niveles.length * FILA + 40,
    dibujar(c, x, y, w) {
      const x0 = x + izq;
      const ancho = w - izq - 6;
      const px = (f: number) => x0 + f * ancho;
      const centro = (n: number) => y + n * FILA + FILA / 2;
      d.niveles.forEach((n, i) => {
        c.fillStyle = '#eeeaf7';
        c.fillRect(x0, centro(i) - 1, ancho, 2);
        c.font = fuente(600, 26);
        c.fillStyle = SUAVE;
        c.textAlign = 'right';
        c.fillText(n.nombre, x0 - 16, centro(i) + 9);
        c.textAlign = 'left';
      });
      c.strokeStyle = '#cfc6ea';
      c.lineWidth = 2;
      d.tramos.slice(1).forEach((tr, i) => {
        const ant = d.tramos[i];
        c.beginPath();
        c.moveTo(px(tr.desde), centro(ant.nivel));
        c.lineTo(px(tr.desde), centro(tr.nivel));
        c.stroke();
      });
      for (const tr of d.tramos) {
        c.fillStyle = d.niveles[tr.nivel]?.color ?? ACENTO;
        const a = px(tr.desde);
        const b = Math.max(a + 3, px(tr.hasta));
        redondeado(c, a, centro(tr.nivel) - BARRA / 2, b - a, BARRA, Math.min(8, (b - a) / 2));
        c.fill();
      }
      c.font = fuente(500, 24);
      c.fillStyle = SUAVE;
      c.textAlign = 'center';
      for (const m of d.marcas) c.fillText(m.texto, px(m.en), y + d.niveles.length * FILA + 32);
      c.textAlign = 'left';
    },
  };

  // Cuánto de cada etapa, en dos columnas, con su color.
  const conTotal = d.niveles.filter((n) => n.total);
  const totales: Bloque | null = conTotal.length
    ? {
        alto: Math.ceil(conTotal.length / 2) * 44,
        dibujar(c, x, y, w) {
          conTotal.forEach((n, i) => {
            const cx = x + (i % 2) * (w / 2);
            const cy = y + Math.floor(i / 2) * 44;
            c.fillStyle = n.color;
            c.beginPath();
            c.arc(cx + 12, cy + 20, 11, 0, Math.PI * 2);
            c.fill();
            c.font = fuente(600, 28);
            c.fillStyle = TINTA;
            c.fillText(n.nombre, cx + 34, cy + 30);
            const wn = c.measureText(n.nombre).width;
            c.font = fuente(500, 28);
            c.fillStyle = SUAVE;
            c.fillText(` · ${n.total}`, cx + 34 + wn, cy + 30);
          });
        },
      }
    : null;

  // Lo que dijo Patty va con hasta tres renglones: si no entra, primero se sacan los totales (ya se ven en el gráfico).
  const conTotales: Bloque[] = [cabeza, espacio(34), grafico, ...(totales ? [espacio(18), totales] : [])];
  if (!d.comentario) return conTotales;
  const dicho = (lineas: number) => texto(c, `“${d.comentario}”`, { peso: 500, tamano: 34, color: TINTA, ancho, maxLineas: lineas, interlineado: 1.24 });
  const pie = (b: Bloque) => [espacio(28), linea(), espacio(24), b];
  const lugar = (base: Bloque[]) => maxAlto - base.reduce((a, b) => a + b.alto, 0) - 54;
  const completo = dicho(3);
  if (completo.alto <= lugar(conTotales) || !totales) return [...conTotales, ...pie(dicho(Math.max(1, Math.min(3, Math.floor(lugar(conTotales) / 42)))))];
  const sinTotales = conTotales.slice(0, 3);
  return [...sinTotales, ...pie(dicho(Math.max(1, Math.min(3, Math.floor(lugar(sinTotales) / 42)))))];
}

/** Lo de adentro de la tarjeta blanca, según qué se comparte. */
async function contenido(c: Ctx, d: Tarjeta, ancho: number, maxAlto: number): Promise<Bloque[]> {
  if (d.tipo === 'actividad' || d.tipo === 'sueno') {
    const icono = d.icono ? await cargarImagen(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(d.icono)}`).catch(() => null) : null;
    return d.tipo === 'actividad' ? bloquesActividad(c, d, ancho, maxAlto, icono) : bloquesSueno(c, d, ancho, maxAlto, icono);
  }
  if (d.tipo === 'patron') {
    // Los nombres largos achican la letra hasta que todo entre en la tarjeta.
    for (let tam = 84; ; tam -= 4) {
      const b = bloquesPatron(c, d, ancho, tam);
      if (tam <= 44 || b.reduce((a, x) => a + x.alto, 0) <= maxAlto) return b;
    }
  }
  if (d.tipo === 'grande') {
    let tam = 220;
    c.font = fuente(800, tam);
    while (tam > 90 && c.measureText(d.numero).width > ancho) c.font = fuente(800, (tam -= 10));
    return [
      texto(c, d.emoji, { peso: 400, tamano: 130, color: TINTA, ancho, centrado: true, interlineado: 1.1 }),
      espacio(10),
      texto(c, d.numero, { peso: 800, tamano: tam, color: ACENTO, ancho, centrado: true, interlineado: 1.05, maxLineas: 2 }),
      espacio(16),
      texto(c, d.texto, { peso: 800, tamano: 60, color: TINTA, ancho, centrado: true, maxLineas: 3 }),
      ...(d.detalle ? [espacio(22), texto(c, d.detalle, { peso: 500, tamano: 42, color: SUAVE, ancho, centrado: true, maxLineas: 2 })] : []),
    ];
  }
  const filas: Bloque[] = d.filas.slice(0, 6).map((f, i) => ({
    alto: 108,
    dibujar(c, x, y, w) {
      if (i) {
        c.fillStyle = '#eeeaf7';
        c.fillRect(x, y, w, 2);
      }
      c.font = fuente(500, 42);
      c.fillStyle = TINTA;
      c.fillText(f.nombre, x, y + 70);
      const flecha = f.flecha ? `  ${f.flecha}` : '';
      c.textAlign = 'right';
      if (flecha) {
        c.font = fuente(700, 34);
        c.fillStyle = f.bien ? VERDE : ROJO;
        c.fillText(flecha, x + w, y + 68);
      }
      const corrida = flecha ? (c.font = fuente(700, 34), c.measureText(flecha).width) : 0;
      c.font = fuente(800, 56);
      c.fillStyle = ACENTO;
      c.fillText(f.valor, x + w - corrida, y + 72);
      c.textAlign = 'left';
    },
  }));
  return [texto(c, d.subtitulo, { peso: 600, tamano: 40, color: SUAVE, ancho }), espacio(16), ...filas];
}

/** Dibuja la tarjeta en un canvas de 1080 x 1350. */
export async function dibujarTarjeta(d: Tarjeta, canvas: HTMLCanvasElement = document.createElement('canvas')): Promise<HTMLCanvasElement> {
  canvas.width = ANCHO;
  canvas.height = ALTO;
  const c = canvas.getContext('2d')!;
  try {
    await document.fonts?.ready;
  } catch {
    /* sin fuentes que esperar */
  }
  fondo(c);

  const margen = 84;
  // Arriba: la frase, en lila.
  const arriba = texto(c, d.arriba, { peso: 700, tamano: 50, color: LILA, ancho: ANCHO - margen * 2, maxLineas: 2 });
  arriba.dibujar(c, margen, 96, ANCHO - margen * 2);

  // Abajo: el búho, patty.today y el lema.
  const pie = 1040;
  const buho = await cargarImagen(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMascota(d.cara ?? 'feliz', { lado: 600 }))}`);
  c.drawImage(buho, 30, pie - 20, 300, 300);
  c.font = fuente(800, 76);
  c.fillStyle = '#ffffff';
  c.fillText('patty.today', 330, pie + 128);
  texto(c, d.lema ?? '', { peso: 500, tamano: 36, color: LILA, ancho: ANCHO - 330 - 60, maxLineas: 2 }).dibujar(c, 332, pie + 156, ANCHO - 390);

  // En el medio: la tarjeta blanca, centrada entre la frase y el pie.
  const relleno = d.tipo === 'actividad' || d.tipo === 'sueno' ? 56 : 72;
  const anchoTarjeta = ANCHO - 120;
  const bloques = await contenido(c, d, anchoTarjeta - relleno * 2, pie - 40 - (96 + arriba.alto + 50) - relleno * 2);
  const altoContenido = bloques.reduce((a, b) => a + b.alto, 0);
  const desde = 96 + arriba.alto + 50;
  const alto = Math.min(pie - 40 - desde, altoContenido + relleno * 2);
  const y = desde + Math.max(0, (pie - 40 - desde - alto) / 2);
  c.save();
  c.shadowColor = 'rgba(20,10,60,0.35)';
  c.shadowBlur = 50;
  c.shadowOffsetY = 18;
  c.fillStyle = '#ffffff';
  redondeado(c, 60, y, anchoTarjeta, alto, 56);
  c.fill();
  c.restore();
  let yy = y + relleno + Math.max(0, (alto - relleno * 2 - altoContenido) / 2);
  for (const b of bloques) {
    b.dibujar(c, 60 + relleno, yy, anchoTarjeta - relleno * 2);
    yy += b.alto;
  }
  return canvas;
}

/** La tarjeta como PNG. Si el mapa "ensució" el canvas (el teléfono no dejó usar los cuadraditos), va sin ellos. */
export async function imagenDeTarjeta(d: Tarjeta): Promise<Blob> {
  const canvas = await dibujarTarjeta(d);
  try {
    return await new Promise<Blob>((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error('png'))), 'image/png'));
  } catch (e) {
    if (d.tipo === 'actividad' && d.camino && d.teselas !== false) return imagenDeTarjeta({ ...d, teselas: false });
    throw e;
  }
}
