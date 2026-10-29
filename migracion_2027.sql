-- ============================================================
--  MIGRACIÓN - Recuento equitativo y semana de Año Nuevo
--  Pega esto en el SQL Editor de Supabase (se puede ejecutar varias veces)
-- ============================================================

-- 1. A quién le TOCÓ cada semana (tecnico_id = quién la hace).
--    El recuento y la compensación usan esta columna, no las reservas.
ALTER TABLE semanas_guardia
  ADD COLUMN IF NOT EXISTS tecnico_original_id UUID REFERENCES tecnicos(id) ON DELETE SET NULL;

-- 2. Rellenar lo que ya hay: si hubo un cambio aprobado, le tocaba al primer
--    solicitante; si no, al que la tiene ahora.
UPDATE semanas_guardia g
SET tecnico_original_id = COALESCE(
  (SELECT s.tecnico_solicitante_id FROM solicitudes_cambio s
   WHERE s.semana_id = g.id AND s.estado = 'aprobada'
   ORDER BY s.updated_at ASC
   LIMIT 1),
  g.tecnico_id)
WHERE g.tecnico_original_id IS NULL;

-- 3. Nuevo tipo de semana: Año Nuevo (rueda de Navidad)
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'semanas_guardia'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%tipo%' AND pg_get_constraintdef(oid) ILIKE '%navidad%'
  LOOP
    EXECUTE format('ALTER TABLE semanas_guardia DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE semanas_guardia
  ADD CONSTRAINT semanas_guardia_tipo_check
  CHECK (tipo IN ('normal', 'festivo', 'navidad_nochebuena', 'navidad_navidad', 'navidad_reyes', 'navidad_anionuevo'));

NOTIFY pgrst, 'reload schema';

-- Comprobación: guardias normales de 2026 que le TOCARON a cada técnico
SELECT t.nombre, count(*) AS normales_2026
FROM semanas_guardia g JOIN tecnicos t ON t.id = g.tecnico_original_id
WHERE g.anio = 2026 AND g.tipo = 'normal'
GROUP BY t.nombre ORDER BY normales_2026, t.nombre;
