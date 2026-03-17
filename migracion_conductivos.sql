-- ============================================================
--  MIGRACIÓN - Conductivos
--  Pega esto en el SQL Editor de Supabase
-- ============================================================

-- Servicios / ubicaciones
CREATE TABLE servicios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  color TEXT DEFAULT '#2C5282',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Conductivos
CREATE TABLE conductivos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  servicio_id UUID REFERENCES servicios(id) ON DELETE SET NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Técnicos asignados a cada conductivo (relación N:M)
CREATE TABLE conductivos_tecnicos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conductivo_id UUID NOT NULL REFERENCES conductivos(id) ON DELETE CASCADE,
  tecnico_id UUID NOT NULL REFERENCES tecnicos(id) ON DELETE CASCADE,
  UNIQUE(conductivo_id, tecnico_id)
);

-- RLS
ALTER TABLE servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE conductivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE conductivos_tecnicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lectura_servicios" ON servicios FOR SELECT USING (true);
CREATE POLICY "escritura_servicios" ON servicios FOR ALL USING (true);
CREATE POLICY "lectura_conductivos" ON conductivos FOR SELECT USING (true);
CREATE POLICY "escritura_conductivos" ON conductivos FOR ALL USING (true);
CREATE POLICY "lectura_conductivos_tecnicos" ON conductivos_tecnicos FOR SELECT USING (true);
CREATE POLICY "escritura_conductivos_tecnicos" ON conductivos_tecnicos FOR ALL USING (true);

-- Algunos servicios de ejemplo (edítalos luego desde la app)
INSERT INTO servicios (nombre, descripcion, color) VALUES
  ('Servicio A', 'Descripción del servicio A', '#2C5282'),
  ('Servicio B', 'Descripción del servicio B', '#276749'),
  ('Servicio C', 'Descripción del servicio C', '#C05621');
