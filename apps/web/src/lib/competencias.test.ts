import { describe, expect, it, beforeEach } from 'vitest';
import { codigoDeTexto, comoVas, gane, leerInvitacion, linkCompetencia, olvidarInvitacion, placaDe, valorTexto, type DetalleCompetencia, type FilaPosicion } from './competencias';

const fila = (apodo: string, valor: number | null, posicion: number | null, yo = false): FilaPosicion => ({ apodo, valor, posicion, yo });
const detalle = (posiciones: FilaPosicion[], cambios: Partial<DetalleCompetencia> = {}): DetalleCompetencia => ({
  id: 1,
  codigo: 'ABCD2345',
  nombre: 'Los primos',
  metrica: 'pasos',
  duracion: 'semana',
  desde: '2026-11-01',
  hasta: '2026-11-07',
  estado: 'en_curso',
  dias_restantes: 3,
  posiciones,
  ...cambios,
});

describe('el link de invitación', () => {
  beforeEach(() => {
    olvidarInvitacion();
    history.replaceState(null, '', '/app/');
  });

  it('saca el código del link o del código solo, y no de cualquier cosa', () => {
    expect(codigoDeTexto(linkCompetencia('ABCD2345'))).toBe('ABCD2345');
    expect(codigoDeTexto(' abcd2345 ')).toBe('ABCD2345');
    expect(codigoDeTexto('https://patty.today/app/?ref=12&competir=abcd2345')).toBe('ABCD2345');
    expect(codigoDeTexto('https://patty.today/')).toBeNull();
    expect(codigoDeTexto('<script>')).toBeNull();
    expect(codigoDeTexto('')).toBeNull();
  });

  it('se recuerda hasta que se contesta (para quien todavía no entró) y limpia la dirección', () => {
    expect(leerInvitacion()).toBeNull();
    history.replaceState(null, '', '/app/?competir=ABCD2345&otra=1#x');
    expect(leerInvitacion()).toBe('ABCD2345');
    expect(location.search).toBe('?otra=1');
    expect(location.hash).toBe('#x');
    expect(leerInvitacion()).toBe('ABCD2345');
    olvidarInvitacion();
    expect(leerInvitacion()).toBeNull();
  });
});

describe('los números', () => {
  it('sin dato no es cero', () => {
    expect(valorTexto('pasos', null)).toBe('sin dato');
    expect(valorTexto('pasos', 0)).not.toBe('sin dato');
    expect(valorTexto('dias', 1)).toBe('1 día');
    expect(valorTexto('racha', 4)).toBe('4 días');
    expect(valorTexto('sueno', 7.5)).toMatch(/^7[.,]5 h$/);
  });
});

describe('cómo vas', () => {
  it('dice cuánto le sacás o te falta, y qué falta para entrar', () => {
    expect(comoVas(detalle([fila('Ana', 10000, 1, true), fila('Beto', 7000, 2)])).frase).toMatch(/cabeza.*3.000 pasos.*Beto.*Quedan 3 días/);
    expect(comoVas(detalle([fila('Ana', 10000, 1), fila('Yo', 9000, 2, true), fila('Beto', 7000, 3)])).frase).toMatch(/puesto 2.*1.000 pasos.*Ana/);
    expect(comoVas(detalle([fila('Ana', 10000, 1), fila('Yo', 7000, 2, true), fila('Beto', null, null)])).frase).toMatch(/cerrás la tabla.*3.000 pasos.*Ana/);
    expect(comoVas(detalle([fila('Ana', 10000, 1), fila('Yo', null, null, true)])).frase).toMatch(/Todavía no me llegó tu número/);
    expect(comoVas(detalle([fila('Ana', 10000, 1), fila('Yo', null, null, true)], { metrica: 'dias' })).frase).toMatch(/anotes algo/);
    expect(comoVas(detalle([fila('Yo', 100, 1, true)])).frase).toMatch(/soledad/);
    expect(comoVas(detalle([fila('Ana', 5, 1), fila('Yo', 5, 1, true)])).frase).toMatch(/Empate arriba con Ana/);
    expect(comoVas(detalle([fila('Yo', 5, 1, true), fila('Ana', null, null)])).frase).toMatch(/nadie más tiene número/);
  });

  it('al terminar: ganó, empató, o el puesto', () => {
    const fin = { estado: 'terminada' as const, dias_restantes: 0 };
    const gano = detalle([fila('Yo', 9, 1, true), fila('Ana', 5, 2)], fin);
    expect(gane(gano)).toBe(true);
    expect(comoVas(gano).frase).toMatch(/Ganaste/);
    expect(comoVas(detalle([fila('Yo', 9, 1, true), fila('Ana', 9, 1)], fin)).frase).toMatch(/Empate/);
    expect(comoVas(detalle([fila('Ana', 9, 1), fila('Yo', 5, 2, true)], fin)).frase).toMatch(/puesto 2/);
    // Todos en cero: nadie gana.
    expect(gane(detalle([fila('Yo', 0, 1, true), fila('Ana', 0, 1)], fin))).toBe(false);
    expect(gane(detalle([fila('Yo', 9, 1, true), fila('Ana', 5, 2)]))).toBe(false);
  });
});

describe('la placa', () => {
  const tabla = [fila('Ana', 10000, 1), fila('Yo', 9000, 2, true), fila('Beto', 7000, 3)];

  it('en curso: tu puesto, con el link de invitación al lado; nunca los otros', () => {
    const p = placaDe(detalle(tabla))!;
    expect(p.que).toBe('competencia');
    expect(p.link).toBe('https://patty.today/app/?competir=ABCD2345');
    expect(p.tarjeta).toMatchObject({ tipo: 'grande', numero: '2°', texto: 'de 3 en «Los primos»' });
    const todo = JSON.stringify(p);
    expect(todo).not.toMatch(/Ana|Beto|10\.?000|7\.?000/);
    // El número propio se puede sacar.
    expect(JSON.stringify(p.tarjeta)).toMatch(/9.000 pasos/);
    expect(JSON.stringify(p.opcion!.sin)).not.toMatch(/9.000/);
  });

  it('al terminar: la del ganador, o el puesto; la competencia ya no invita', () => {
    const fin = { estado: 'terminada' as const, dias_restantes: 0 };
    const g = placaDe(detalle([fila('Yo', 9, 1, true), fila('Ana', 5, 2)], fin))!;
    expect(g.tarjeta).toMatchObject({ emoji: '🏆', numero: '1°', arriba: '¡Gané la competencia en Patty!' });
    expect(g.link).toBeUndefined();
    expect(JSON.stringify(g)).not.toContain('Ana');
    expect(placaDe(detalle(tabla, fin))!.tarjeta).toMatchObject({ arriba: 'Terminé la competencia en Patty', numero: '2°' });
  });

  it('sin número o sin rivales, no hay placa', () => {
    expect(placaDe(detalle([fila('Ana', 9, 1), fila('Yo', null, null, true)]))).toBeNull();
    expect(placaDe(detalle([fila('Yo', 9, 1, true)]))).toBeNull();
  });
});
