// Las imágenes para compartir (un patrón, la racha, la semana, un nivel): 1080 x 1350, que es lo que mejor se ve en
// WhatsApp y en Instagram. Se dibujan en el teléfono, en un canvas: fondo violeta de Patty, una tarjeta blanca con lo
// que se comparte, el búho y "patty.today" abajo. Recibe los textos ya traducidos y nunca lleva nombres ni lo anotado.
import { svgMascota, type Cara } from '../mascota/dibujo';

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
      /** Lo que se miró o escuchó: la tapa (por la API, con CORS), el título, el género y "Lo vi hoy · 2 h". */
      tipo: 'medio';
      tapa: string | null;
      /** Un póster de película (más alto que ancho) o la tapa cuadrada de un disco. */
      forma: 'poster' | 'cuadrada';
      /** Lo que se dibuja si no hay tapa. */
      icono: 'tele' | 'musica' | 'podcast';
      titulo: string;
      subtitulo: string;
      cuando: string;
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

function redondeado(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

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

function cargarImagen(src: string, deOtroLado = false): Promise<HTMLImageElement> {
  return new Promise((ok, mal) => {
    const img = new Image();
    // Una imagen de otro sitio sin CORS "mancha" el canvas y después no se puede exportar.
    if (deOtroLado) img.crossOrigin = 'anonymous';
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

/** Sin tapa: un cuadro lila con la tele, la nota o el micrófono, dibujados. */
function dibujarSinTapa(c: Ctx, icono: 'tele' | 'musica' | 'podcast', x: number, y: number, lado: number) {
  c.fillStyle = '#ece7fa';
  redondeado(c, x, y, lado, lado, lado * 0.12);
  c.fill();
  const k = lado / 32;
  c.save();
  c.translate(x, y);
  c.scale(k, k);
  c.lineWidth = 1.6;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = ACENTO;
  c.fillStyle = ACENTO;
  if (icono === 'tele') {
    redondeado(c, 6, 9, 20, 14, 2.5);
    c.stroke();
    c.beginPath();
    c.moveTo(14, 13);
    c.lineTo(14, 19);
    c.lineTo(19, 16);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(12.5, 5.5);
    c.lineTo(16, 9);
    c.lineTo(19.5, 5.5);
    c.moveTo(11, 26.5);
    c.lineTo(21, 26.5);
    c.stroke();
  } else if (icono === 'musica') {
    c.beginPath();
    c.moveTo(14, 21);
    c.lineTo(14, 9);
    c.lineTo(22, 7);
    c.lineTo(22, 19);
    c.stroke();
    for (const [cx, cy] of [[11.8, 21.5], [19.8, 19.5]]) {
      c.beginPath();
      c.ellipse(cx, cy, 2.6, 2, -0.3, 0, Math.PI * 2);
      c.fill();
    }
  } else {
    redondeado(c, 12.5, 5, 7, 12, 3.5);
    c.stroke();
    c.beginPath();
    c.arc(16, 13, 7, 0.1 * Math.PI, 0.9 * Math.PI);
    c.moveTo(16, 20);
    c.lineTo(16, 25);
    c.moveTo(12.5, 25.5);
    c.lineTo(19.5, 25.5);
    c.stroke();
  }
  c.restore();
}

/** Lo que se miró o escuchó: la tapa grande, el título, el género y cuándo, todo centrado. */
function bloquesMedio(c: Ctx, d: Extract<Tarjeta, { tipo: 'medio' }>, ancho: number, maxAlto: number, tapa: HTMLImageElement | null): Bloque[] {
  const titulo = texto(c, d.titulo, { peso: 800, tamano: d.titulo.length > 28 ? 58 : 68, color: TINTA, ancho, centrado: true, maxLineas: 2 });
  const sub = d.subtitulo ? texto(c, d.subtitulo, { peso: 500, tamano: 38, color: SUAVE, ancho, centrado: true, maxLineas: 2 }) : espacio(0);
  c.font = fuente(800, 40);
  const anchoPildora = Math.min(ancho, c.measureText(d.cuando).width + 72);
  const pildora: Bloque = {
    alto: 76,
    dibujar(c, x, y, w) {
      const px = x + (w - anchoPildora) / 2;
      c.fillStyle = '#ece7fa';
      redondeado(c, px, y, anchoPildora, 76, 38);
      c.fill();
      c.font = fuente(800, 40);
      c.fillStyle = ACENTO;
      c.textAlign = 'center';
      c.fillText(d.cuando, x + w / 2, y + 52);
      c.textAlign = 'left';
    },
  };
  const textos = [espacio(36), titulo, espacio(12), sub, espacio(30), pildora];
  const altoMax = Math.max(240, Math.min(600, maxAlto - textos.reduce((a, b) => a + b.alto, 0)));
  // La tapa entra en el lugar que queda, sin deformarse (los pósters son más altos que anchos).
  const proporcion = tapa ? tapa.naturalWidth / Math.max(1, tapa.naturalHeight) : 1;
  const alto = tapa ? Math.min(altoMax, ancho / proporcion) : Math.min(altoMax, 360);
  const anchoImg = tapa ? alto * proporcion : alto;
  const imagen: Bloque = {
    alto,
    dibujar(c, x, y, w) {
      const ix = x + (w - anchoImg) / 2;
      if (!tapa) return dibujarSinTapa(c, d.icono, ix, y, alto);
      c.save();
      c.shadowColor = 'rgba(20,10,60,0.35)';
      c.shadowBlur = 36;
      c.shadowOffsetY = 14;
      c.fillStyle = '#ffffff';
      redondeado(c, ix, y, anchoImg, alto, 22);
      c.fill();
      c.restore();
      c.save();
      redondeado(c, ix, y, anchoImg, alto, 22);
      c.clip();
      c.drawImage(tapa, ix, y, anchoImg, alto);
      c.restore();
    },
  };
  return [imagen, ...textos];
}

/** Lo de adentro de la tarjeta blanca, según qué se comparte. */
function contenido(c: Ctx, d: Tarjeta, ancho: number, maxAlto: number, tapa: HTMLImageElement | null = null): Bloque[] {
  if (d.tipo === 'medio') return bloquesMedio(c, d, ancho, maxAlto, tapa);
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
  const relleno = 72;
  const anchoTarjeta = ANCHO - 120;
  // La tapa de lo que se miró o escuchó se trae antes (si no llega, va el dibujo).
  const tapa = d.tipo === 'medio' && d.tapa ? await cargarImagen(d.tapa, true).catch(() => null) : null;
  const bloques = contenido(c, d, anchoTarjeta - relleno * 2, pie - 40 - (96 + arriba.alto + 50) - relleno * 2, tapa);
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

/** La tarjeta como PNG. */
export async function imagenDeTarjeta(d: Tarjeta): Promise<Blob> {
  const canvas = await dibujarTarjeta(d);
  return new Promise((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error('png'))), 'image/png'));
}
