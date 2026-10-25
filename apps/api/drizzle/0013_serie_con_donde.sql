-- La serie diaria suma también dónde se comió (casera, afuera, delivery) y en qué lugar: esos conceptos no son
-- renglones del Día, están en registros.datos (donde_concepto_id, lugar_concepto_id). Así entran a los patrones.
CREATE OR REPLACE VIEW "serie_diaria" AS
SELECT r.persona_id, r.fecha, r.concepto_id,
       count(*)::int AS veces,
       sum(r.valor) AS suma,
       avg(r.valor) AS promedio,
       max(r.intensidad)::int AS intensidad_max,
       min(r.inicio) AS primera
FROM "registros" r
WHERE r.borrado IS NULL
GROUP BY r.persona_id, r.fecha, r.concepto_id
UNION ALL
SELECT m.persona_id, m.fecha, m.concepto_id,
       count(*)::int,
       sum(m.valor),
       avg(m.valor),
       NULL::int,
       min(m.inicio)
FROM "mediciones" m
GROUP BY m.persona_id, m.fecha, m.concepto_id
UNION ALL
SELECT r.persona_id, r.fecha, x.concepto_id, count(*)::int, NULL, NULL, NULL::int, min(r.inicio)
FROM "registros" r
CROSS JOIN LATERAL (VALUES ((r.datos->>'donde_concepto_id')::int), ((r.datos->>'lugar_concepto_id')::int)) AS x(concepto_id)
WHERE r.borrado IS NULL AND x.concepto_id IS NOT NULL
GROUP BY r.persona_id, r.fecha, x.concepto_id;
