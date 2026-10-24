-- Una fila por persona, día local y concepto, juntando lo anotado a mano y lo medido por dispositivos.
-- Es lo que lee el motor de patrones (src/patrones).
CREATE VIEW "serie_diaria" AS
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
GROUP BY m.persona_id, m.fecha, m.concepto_id;
