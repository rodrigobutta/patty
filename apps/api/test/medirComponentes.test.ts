// La medición de falsos positivos de los componentes: datos al azar (causas y efectos independientes), con y sin los rasgos de
// componentes. No es una prueba de todos los días: corre solo con MEDIR_COMPONENTES=1 y muestra una tabla.
import { describe, it } from 'vitest';
import { armarDeSemilla, semilla } from '../src/componentes/resolver.js';
import { tablaIngredientes } from '../src/componentes/tabla.js';
import { buscarPatrones } from '../src/patrones/motor.js';
import { rasgosDeComidas } from '../src/componentes/niveles.js';
import { sumarDias } from '../src/lib/fechas.js';
import { comidaDePrueba, conComponentes } from './sinteticos.js';

describe.runIf(process.env.MEDIR_COMPONENTES)('falsos positivos', () => {
  it('con y sin componentes', async () => {
    const t = await tablaIngredientes();
    const composiciones = (await semilla()).alimentos.map((a) => armarDeSemilla(t, a).componentes);
    // Cuánto tarda armar los rasgos: cinco años, cuatro comidas por día.
    const comidas = Array.from({ length: 7300 }, (_, i) => comidaDePrueba(sumarDias('2020-01-01', i >> 2), `C${i % 50}`, composiciones[i % composiciones.length]));
    const t0 = performance.now();
    const rasgos = rasgosDeComidas(comidas);
    console.log(`Armar ${rasgos.length} rasgos con ${comidas.length} comidas: ${Math.round(performance.now() - t0)} ms`);
    for (const [dias, conceptos, semillas, dispareja] of [[180, 40, 40, false], [365, 60, 40, false], [730, 150, 20, false], [1825, 300, 6, false], [365, 60, 40, true], [730, 150, 20, true]] as const) {
      const r = { sinFirmes: 0, conFirmes: 0, compFirmes: 0, sinTodos: 0, conTodos: 0, compTodos: 0, sinMs: 0, conMs: 0, sinPares: 0, conPares: 0, personasConComp: 0 };
      for (let s = 1; s <= semillas; s++) {
        const h = conComponentes(dias, conceptos, s * 1009, composiciones, { dispareja });
        let t0 = performance.now();
        const sin = buscarPatrones(h.filas, h.sinComponentes, h.desde, h.hasta);
        r.sinMs += performance.now() - t0;
        t0 = performance.now();
        const con = buscarPatrones(h.conFilas, h.conceptos, h.desde, h.hasta);
        r.conMs += performance.now() - t0;
        const comp = new Set(h.conceptos.filter((c) => c.componente).map((c) => c.id));
        const esComp = (x: { causa_id: number; causas_extra: Array<{ id: number }> }) => comp.has(x.causa_id) || x.causas_extra.some((c) => comp.has(c.id));
        r.sinFirmes += sin.candidatos.filter((x) => x.q_valor <= 0.1).length;
        r.conFirmes += con.candidatos.filter((x) => x.q_valor <= 0.1).length;
        const f = con.candidatos.filter((x) => x.q_valor <= 0.1 && esComp(x)).length;
        r.compFirmes += f;
        if (f) r.personasConComp++;
        r.sinTodos += sin.candidatos.length;
        r.conTodos += con.candidatos.length;
        r.compTodos += con.candidatos.filter(esComp).length;
        r.sinPares += sin.pares_evaluados;
        r.conPares += con.pares_evaluados;
      }
      const por = (x: number) => (x / semillas).toFixed(2);
      console.log(
        `${dias} días, ${conceptos} conceptos${dispareja ? ', se anota dispar' : ''}, ${semillas} personas: firmes por persona sin ${por(r.sinFirmes)} / con ${por(r.conFirmes)} (de componentes ${por(r.compFirmes)}; personas con alguno ${r.personasConComp}); ` +
          `posibles sin ${por(r.sinTodos)} / con ${por(r.conTodos)} (de componentes ${por(r.compTodos)}); pruebas ${Math.round(r.sinPares / semillas)} → ${Math.round(r.conPares / semillas)}; motor ${Math.round(r.sinMs / semillas)} → ${Math.round(r.conMs / semillas)} ms`,
      );
    }
  }, 900000);
});
