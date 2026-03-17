-- ============================================================
--  MIGRACIÓN - Ruedas de festivo y sustitución
--  Pega esto en el SQL Editor de Supabase
-- ============================================================

-- Añadir campos de orden para rueda festivo y sustitución
ALTER TABLE tecnicos 
  ADD COLUMN IF NOT EXISTS orden_rueda_festivo INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS orden_rueda_sustitucion INT DEFAULT 0;

-- Tabla para trackear el puntero actual de cada rueda
CREATE TABLE IF NOT EXISTS rueda_punteros (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('normal','festivo','navidad','sustitucion')),
  anio INT NOT NULL,
  puntero INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tipo, anio)
);

-- Políticas RLS para la nueva tabla
ALTER TABLE rueda_punteros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lectura_punteros" ON rueda_punteros FOR SELECT USING (true);
CREATE POLICY "escritura_punteros" ON rueda_punteros FOR ALL USING (true);

-- Inicializar punteros para 2026
INSERT INTO rueda_punteros (tipo, anio, puntero) VALUES
  ('normal', 2026, 0),
  ('festivo', 2026, 0),
  ('navidad', 2026, 0),
  ('sustitucion', 2026, 0)
ON CONFLICT (tipo, anio) DO NOTHING;

-- Inicializar orden_rueda_festivo y sustitucion igual que el normal (para no romper datos existentes)
UPDATE tecnicos SET 
  orden_rueda_festivo = orden_rueda_normal,
  orden_rueda_sustitucion = orden_rueda_normal
WHERE orden_rueda_festivo = 0 AND rol = 'tecnico';
