-- Los remedios tomados para un malestar (datos.para_registro_id): el índice para traer, con cada malestar, sus remedios.
CREATE INDEX IF NOT EXISTS registros_para_registro_idx ON registros ((datos->>'para_registro_id')) WHERE datos ? 'para_registro_id';
