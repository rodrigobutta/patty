import { describe, expect, it } from 'vitest';
import { esReunion, reunionesDelDia, type EventoCalendario } from '../lib/calendario';

const dia = new Date(2026, 9, 27); // martes
const fin = new Date(2026, 9, 28);
const ev = (h1: number, h2: number, extra: Partial<EventoCalendario> = {}): EventoCalendario => ({
  inicio: new Date(2026, 9, 27, Math.floor(h1), (h1 % 1) * 60).getTime(),
  fin: new Date(2026, 9, 27, Math.floor(h2), (h2 % 1) * 60).getTime(),
  todoElDia: false,
  libre: false,
  rechazado: false,
  cuenta: 'com.google',
  invitados: 4,
  ...extra,
});
const valor = (l: ReturnType<typeof reunionesDelDia>, c: string) => l.find((x) => x.concepto === c)?.valor;

describe('reuniones del calendario', () => {
  it('cuenta reuniones, horas (sin contar dos veces lo superpuesto), seguidas y fuera de horario', () => {
    const l = reunionesDelDia(dia, fin, [
      ev(9, 10),
      ev(10, 11), // seguida
      ev(10.5, 11.5), // superpuesta: suma media hora más
      ev(14, 15, { invitados: 0 }), // sin gente, de Google: no es reunión (el dentista)
      ev(15, 16, { invitados: 0, cuenta: 'com.microsoft.office.outlook' }), // de Outlook: sí
      ev(16, 17, { rechazado: true }),
      ev(17, 18, { libre: true }),
      ev(19.5, 20.5), // fuera de horario
      ev(0, 23.99, { todoElDia: true }),
    ]);
    expect(valor(l, 'Reuniones')).toBe(5);
    expect(valor(l, 'Horas de reuniones')).toBe(4.5);
    expect(valor(l, 'Reuniones seguidas')).toBe(2);
    expect(valor(l, 'Reuniones fuera de horario')).toBe(1);
    expect(valor(l, 'Primera reunión')).toBe(9);
    expect(valor(l, 'Última reunión')).toBe(20.5);
    expect(l.every((x) => x.categoria === 'trabajo')).toBe(true);
  });

  it('un día sin reuniones manda cero', () => {
    const l = reunionesDelDia(dia, fin, [ev(14, 15, { invitados: 1 })]);
    expect(l.map((x) => [x.concepto, x.valor])).toEqual([['Reuniones', 0], ['Horas de reuniones', 0]]);
    expect(esReunion(ev(9, 9.05))).toBe(false); // 3 minutos
  });
});
