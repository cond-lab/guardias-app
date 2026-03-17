-- ============================================================
--  GUARDIAS - Supabase Schema
--  Pega esto en el SQL Editor de tu proyecto Supabase
-- ============================================================

-- Técnicos
CREATE TABLE tecnicos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT,
  pin TEXT NOT NULL,
  rol TEXT DEFAULT 'tecnico' CHECK (rol IN ('admin','tecnico')),
  activo BOOLEAN DEFAULT true,
  orden_rueda_normal INT DEFAULT 0,
  orden_rueda_navidad INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Festivos
CREATE TABLE festivos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha DATE NOT NULL,
  nombre TEXT NOT NULL,
  tipo TEXT DEFAULT 'nacional' CHECK (tipo IN ('nacional','local','navidad')),
  anio INT NOT NULL,
  UNIQUE(fecha)
);

-- Semanas de guardia
CREATE TABLE semanas_guardia (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lunes_inicio DATE NOT NULL,
  lunes_fin DATE NOT NULL,
  tecnico_id UUID REFERENCES tecnicos(id) ON DELETE SET NULL,
  tipo TEXT DEFAULT 'normal' CHECK (tipo IN ('normal','festivo','navidad_nochebuena','navidad_navidad','navidad_reyes')),
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente','confirmada','modificada')),
  anio INT NOT NULL,
  semana_iso INT NOT NULL,
  tiene_festivo BOOLEAN DEFAULT false,
  festivo_nombre TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lunes_inicio, tipo)
);

-- Solicitudes de cambio
CREATE TABLE solicitudes_cambio (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  semana_id UUID NOT NULL REFERENCES semanas_guardia(id) ON DELETE CASCADE,
  tecnico_solicitante_id UUID NOT NULL REFERENCES tecnicos(id),
  tecnico_receptor_id UUID REFERENCES tecnicos(id) ON DELETE SET NULL,
  tipo_cambio TEXT DEFAULT 'intercambio' CHECK (tipo_cambio IN ('intercambio','reasignacion')),
  motivo TEXT,
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada')),
  respuesta_admin TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
--  ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE tecnicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE festivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE semanas_guardia ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitudes_cambio ENABLE ROW LEVEL SECURITY;

-- Políticas públicas de lectura (la app usa anon key con PIN propio)
CREATE POLICY "lectura_tecnicos" ON tecnicos FOR SELECT USING (true);
CREATE POLICY "lectura_festivos" ON festivos FOR SELECT USING (true);
CREATE POLICY "lectura_guardias" ON semanas_guardia FOR SELECT USING (true);
CREATE POLICY "lectura_solicitudes" ON solicitudes_cambio FOR SELECT USING (true);

-- Escritura solo desde service_role (el frontend usará service key solo para operaciones de admin)
CREATE POLICY "escritura_tecnicos" ON tecnicos FOR ALL USING (true);
CREATE POLICY "escritura_festivos" ON festivos FOR ALL USING (true);
CREATE POLICY "escritura_guardias" ON semanas_guardia FOR ALL USING (true);
CREATE POLICY "escritura_solicitudes" ON solicitudes_cambio FOR ALL USING (true);

-- ============================================================
--  DATOS INICIALES - Admin y festivos 2026
-- ============================================================

INSERT INTO tecnicos (nombre, pin, rol, orden_rueda_normal, orden_rueda_navidad)
VALUES ('Admin', '0000', 'admin', 0, 0);

INSERT INTO festivos (fecha, nombre, tipo, anio) VALUES
-- Nacionales España 2026
('2026-01-01','Año Nuevo','nacional',2026),
('2026-01-06','Reyes Magos','nacional',2026),
('2026-04-02','Jueves Santo','nacional',2026),
('2026-04-03','Viernes Santo','nacional',2026),
('2026-05-01','Día del Trabajador','nacional',2026),
('2026-08-15','Asunción de la Virgen','nacional',2026),
('2026-10-12','Fiesta Nacional de España','nacional',2026),
('2026-11-01','Todos los Santos','nacional',2026),
('2026-12-06','Día de la Constitución','nacional',2026),
('2026-12-08','Inmaculada Concepción','nacional',2026),
('2026-12-25','Navidad','nacional',2026),
-- Comunitat Valenciana / Alicante 2026
('2026-03-19','San José (Fallas)','local',2026),
('2026-04-06','Lunes de Pascua','local',2026),
('2026-06-24','San Juan','local',2026),
('2026-10-09','Día de la Comunitat Valenciana','local',2026),
-- Navidades (rueda separada)
('2026-12-24','Nochebuena','navidad',2026),
('2026-12-25','Navidad (rueda especial)','navidad',2026),
('2027-01-06','Reyes Magos (rueda especial)','navidad',2026);
