-- La serie diaria suma también cómo era el plato (porción y tipos: "Comida frita", "Porción grande"), guardado en
-- registros.datos (plato_concepto_ids). Como dónde se comió: no son renglones del Día, pero entran a los patrones.
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
CROSS JOIN LATERAL (
  SELECT (r.datos->>'donde_concepto_id')::int
  UNION ALL SELECT (r.datos->>'lugar_concepto_id')::int
  UNION ALL SELECT e::int FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(r.datos->'plato_concepto_ids') = 'array' THEN r.datos->'plato_concepto_ids' ELSE '[]'::jsonb END) AS e
) AS x(concepto_id)
WHERE r.borrado IS NULL AND x.concepto_id IS NOT NULL
GROUP BY r.persona_id, r.fecha, x.concepto_id;
