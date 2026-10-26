-- Los nombres viejos de zonas horarias (el de Android: "America/Buenos_Aires") que el Postgres del servidor no conoce:
-- con el nombre actual, AT TIME ZONE anda (ver zonaCanonica en lib/fechas.ts).
UPDATE "personas" SET "zona_horaria" = CASE "zona_horaria"
  WHEN 'America/Buenos_Aires' THEN 'America/Argentina/Buenos_Aires'
  WHEN 'America/Catamarca' THEN 'America/Argentina/Catamarca'
  WHEN 'America/Cordoba' THEN 'America/Argentina/Cordoba'
  WHEN 'America/Rosario' THEN 'America/Argentina/Cordoba'
  WHEN 'America/Jujuy' THEN 'America/Argentina/Jujuy'
  WHEN 'America/Mendoza' THEN 'America/Argentina/Mendoza'
  WHEN 'Asia/Calcutta' THEN 'Asia/Kolkata'
  WHEN 'Asia/Saigon' THEN 'Asia/Ho_Chi_Minh'
  WHEN 'Asia/Katmandu' THEN 'Asia/Kathmandu'
  ELSE "zona_horaria" END;
