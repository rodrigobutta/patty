import type { DatoAutomatico } from 'shared';
import { agruparAutomaticos, duracion, resumenDelGrupo, valorAutomatico } from './automatico';

const dato = (d: Partial<DatoAutomatico>): DatoAutomatico => ({
  fuente: 'App de Android', tipo_fuente: 'telefono', concepto: 'x', categoria_id: 1, unidad: null, cantidad: 1, suma: 0, minimo: 0, maximo: 0, ...d,
});

describe('datos automáticos del día', () => {
  it('los minutos se leen como horas y minutos', () => {
    expect(duracion(45)).toBe('45 min');
    expect(duracion(120)).toBe('2 h');
    expect(duracion(192.4)).toBe('3 h 12 min');
    expect(valorAutomatico(dato({ unidad: 'min', suma: 75 }))).toBe('1 h 15 min');
    expect(valorAutomatico(dato({ suma: 5 }))).toBe('5');
  });

  it('del clima muestra el rango del día, y de la lluvia el total', () => {
    expect(valorAutomatico(dato({ tipo_fuente: 'clima', unidad: '°C', cantidad: 3, suma: 54, minimo: 14.2, maximo: 21.66 }))).toBe('14,2–21,7 °C');
    expect(valorAutomatico(dato({ tipo_fuente: 'clima', unidad: 'mm', cantidad: 3, suma: 2.5, minimo: 0, maximo: 2 }))).toBe('2,5 mm');
    expect(valorAutomatico(dato({ tipo_fuente: 'clima', unidad: 'min', cantidad: 3, suma: 150, minimo: 30, maximo: 60 }))).toBe('2 h 30 min');
  });

  it('agrupa por fuente: primero el teléfono, al final el clima', () => {
    const g = agruparAutomaticos([
      dato({ fuente: 'Clima automático', tipo_fuente: 'clima', concepto: 'Humedad', unidad: '%', suma: 60, minimo: 60, maximo: 60 }),
      dato({ concepto: 'Tiempo de pantalla', categoria_id: 9, unidad: 'min', suma: 200 }),
      dato({ concepto: 'Llamadas', categoria_id: 8, suma: 4 }),
    ]);
    expect(g.map((x) => [x.fuente, x.lineas.map((l) => `${l.concepto}: ${l.valor}`)])).toEqual([
      ['App de Android', ['Llamadas: 4', 'Tiempo de pantalla: 3 h 20 min']],
      ['Clima automático', ['Humedad: 60 %']],
    ]);
  });
});

describe('el clima del día', () => {
  it('si está el resumen del día, no se muestran las horas, y las horas se leen como duración', () => {
    const g = agruparAutomaticos([
      dato({ fuente: 'Clima automático', tipo_fuente: 'clima', concepto: 'Temperatura', unidad: '°C', cantidad: 10, minimo: 10, maximo: 20 }),
      dato({ fuente: 'Clima del día', tipo_fuente: 'clima', concepto: 'Horas de sol', unidad: 'h', suma: 2.5 }),
      dato({ fuente: 'Clima del día', tipo_fuente: 'clima', concepto: 'Temperatura máxima', unidad: '°C', suma: 20 }),
    ]);
    expect(g.map((x) => [x.fuente, x.lineas.map((l) => `${l.concepto}: ${l.valor}`)])).toEqual([
      ['Clima del día', ['Temperatura máxima: 20 °C', 'Horas de sol: 2 h 30 min']],
    ]);
  });
});

describe('el renglón de resumen de cada fuente', () => {
  it('dice lo principal en una línea', () => {
    const [tel, clima] = agruparAutomaticos([
      dato({ concepto: 'Tiempo de pantalla', categoria_id: 9, unidad: 'min', suma: 200 }),
      dato({ concepto: 'Uso de Instagram', categoria_id: 9, unidad: 'min', suma: 60 }),
      dato({ concepto: 'Llamadas', categoria_id: 8, suma: 4 }),
      dato({ fuente: 'Clima del día', tipo_fuente: 'clima', concepto: 'Temperatura máxima', unidad: '°C', suma: 21.5 }),
      dato({ fuente: 'Clima del día', tipo_fuente: 'clima', concepto: 'Lluvia del día', unidad: 'mm', suma: 0 }),
      dato({ fuente: 'Clima del día', tipo_fuente: 'clima', concepto: 'Horas de sol', unidad: 'h', suma: 6 }),
    ]);
    expect(resumenDelGrupo(tel)).toBe('3 h 20 min de pantalla · 4 llamadas');
    expect(resumenDelGrupo(clima)).toBe('máx 21,5 °C · 6 h de sol · sin lluvia');
  });
});
