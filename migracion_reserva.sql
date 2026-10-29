-- ============================================================
--  MIGRACIÓN - Rueda de reserva que avanza de verdad
--  Pega esto en el SQL Editor de Supabase (se puede ejecutar varias veces)
-- ============================================================

-- 1. Guardar QUIÉN hizo la última reserva (en vez de un número de posición).
--    Así, si alguien se desactiva o deja de hacer guardias, la rueda lo salta sola.
ALTER TABLE rueda_punteros
  ADD COLUMN IF NOT EXISTS ultimo_tecnico_id UUID REFERENCES tecnicos(id) ON DELETE SET NULL;

-- 2. La rueda de reserva no se reinicia cada año: una sola fila con anio = 0
INSERT INTO rueda_punteros (tipo, anio, puntero) VALUES ('sustitucion', 0, 0)
ON CONFLICT (tipo, anio) DO NOTHING;

-- 3. Arranque: el último que hizo una reserva aprobada (hoy: Jordi Biosca, 14/10/2026)
UPDATE rueda_punteros
SET ultimo_tecnico_id = (
      SELECT tecnico_receptor_id FROM solicitudes_cambio
      WHERE estado = 'aprobada' AND tipo_cambio = 'sustitucion'
      ORDER BY updated_at DESC
      LIMIT 1
    ),
    updated_at = now()
WHERE tipo = 'sustitucion' AND anio = 0 AND ultimo_tecnico_id IS NULL;

-- 4. Permitir los tres tipos de cambio (reserva = 'sustitucion', 'intercambio', 'reasignacion')
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'solicitudes_cambio'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%tipo_cambio%'
  LOOP
    EXECUTE format('ALTER TABLE solicitudes_cambio DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE solicitudes_cambio
  ADD CONSTRAINT solicitudes_cambio_tipo_cambio_check
  CHECK (tipo_cambio IN ('sustitucion', 'intercambio', 'reasignacion'));

-- Comprobación: debe salir una fila con el nombre del último que hizo reserva
SELECT p.tipo, p.anio, t.nombre AS ultimo_reserva
FROM rueda_punteros p LEFT JOIN tecnicos t ON t.id = p.ultimo_tecnico_id
WHERE p.tipo = 'sustitucion' AND p.anio = 0;
