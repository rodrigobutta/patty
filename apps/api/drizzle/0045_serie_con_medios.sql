-- La serie diaria suma también lo que se miró o escuchó (registros.datos.medio_concepto_ids: «Tele: Terror», «Tele en
-- Netflix», «Música: Rock»), con los minutos del registro: como el plato o los detalles, no son renglones del Día pero
-- entran a los patrones ("los días que mirás terror dormís peor").
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
  UNION ALL SELECT e::int FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(r.datos->'detalle_concepto_ids') = 'array' THEN r.datos->'detalle_concepto_ids' ELSE '[]'::jsonb END) AS e
) AS x(concepto_id)
WHERE r.borrado IS NULL AND x.concepto_id IS NOT NULL
GROUP BY r.persona_id, r.fecha, x.concepto_id
UNION ALL
SELECT r.persona_id, r.fecha, e::int, count(*)::int, sum(r.valor), avg(r.valor), NULL::int, min(r.inicio)
FROM "registros" r
CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(r.datos->'medio_concepto_ids') = 'array' THEN r.datos->'medio_concepto_ids' ELSE '[]'::jsonb END) AS e
WHERE r.borrado IS NULL
GROUP BY r.persona_id, r.fecha, e::int;
