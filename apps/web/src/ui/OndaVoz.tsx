// La onda de lo que se escucha, detrás del micrófono grande: se mueve con la voz (si se puede leer el audio) o, si no,
// late suave para que se note que está escuchando. Tres líneas del color de Patty, la del medio más fuerte.
import { useEffect, useRef } from 'react';

export function OndaVoz({ analizador, activa }: { analizador?: AnalyserNode; activa: boolean }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = lienzo.current;
    if (!c || !activa) return;
    const ctx = c.getContext('2d')!;
    const color = getComputedStyle(c).color || '#6b4fbb';
    const datos = analizador ? new Uint8Array(analizador.fftSize) : null;
    let nivel = 0;
    let cuadro = 0;
    const dibujar = (t: number) => {
      const dpr = window.devicePixelRatio || 1;
      const ancho = c.clientWidth;
      const alto = c.clientHeight;
      if (c.width !== ancho * dpr) {
        c.width = ancho * dpr;
        c.height = alto * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, ancho, alto);
      // Volumen (RMS) suavizado, de 0 a 1.
      let rms = 0.05;
      if (analizador && datos) {
        analizador.getByteTimeDomainData(datos);
        let suma = 0;
        for (const v of datos) suma += ((v - 128) / 128) ** 2;
        rms = Math.min(1, Math.sqrt(suma / datos.length) * 4);
      } else {
        rms = 0.18 + 0.08 * Math.sin(t / 300);
      }
      nivel += (rms - nivel) * 0.25;
      const capas = [
        { amp: 1, alfa: 0.9, ancho: 2.5, fase: 0, frec: 1.6 },
        { amp: 0.65, alfa: 0.45, ancho: 2, fase: 1.7, frec: 2.3 },
        { amp: 0.4, alfa: 0.3, ancho: 1.5, fase: 3.1, frec: 3.1 },
      ];
      for (const capa of capas) {
        ctx.beginPath();
        for (let x = 0; x <= ancho; x += 3) {
          const u = x / ancho;
          // Se apaga en los bordes, como una onda que sale del micrófono.
          const envolvente = Math.sin(Math.PI * u) ** 2;
          const y = alto / 2 + Math.sin(u * Math.PI * 2 * capa.frec + t / 180 + capa.fase) * (alto / 2 - 4) * nivel * capa.amp * envolvente;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color;
        ctx.globalAlpha = capa.alfa;
        ctx.lineWidth = capa.ancho;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      cuadro = requestAnimationFrame(dibujar);
    };
    cuadro = requestAnimationFrame(dibujar);
    return () => {
      cancelAnimationFrame(cuadro);
      ctx.clearRect(0, 0, c.width, c.height);
    };
  }, [analizador, activa]);
  return <canvas ref={lienzo} className={`onda-voz${activa ? ' activa' : ''}`} aria-hidden />;
}
