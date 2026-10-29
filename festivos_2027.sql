-- ============================================================
--  FESTIVOS 2027 - Pega esto en el SQL Editor de Supabase
--  ⚠ Revisa las fechas autonómicas y locales con el calendario oficial
--    (DOGV / Ayuntamiento de Alicante) antes de generar 2027.
--    Se pueden corregir luego desde la pantalla Festivos.
-- ============================================================

INSERT INTO festivos (fecha, nombre, tipo, anio) VALUES
-- Navidad (rueda especial)
('2027-01-01', 'Año Nuevo (rueda especial)',          'navidad',  2027),  -- cae en la semana del 28/12/2026, ya generada
('2027-01-06', 'Reyes Magos (rueda especial)',        'navidad',  2027),  -- ya existe (guardado como 2026): se ignora
('2027-12-24', 'Nochebuena',                          'navidad',  2027),
('2027-12-25', 'Navidad (rueda especial)',            'navidad',  2027),
('2028-01-01', 'Año Nuevo (rueda especial)',          'navidad',  2027),  -- marca la semana del 27/12/2027
('2028-01-06', 'Reyes Magos (rueda especial)',        'navidad',  2027),  -- para generar 2028
-- Nacionales
('2027-03-25', 'Jueves Santo',                        'nacional', 2027),
('2027-03-26', 'Viernes Santo',                       'nacional', 2027),
('2027-05-01', 'Día del Trabajador',                  'nacional', 2027),
('2027-08-15', 'Asunción de la Virgen',               'nacional', 2027),  -- domingo: revisar si se traslada
('2027-10-12', 'Fiesta Nacional de España',           'nacional', 2027),
('2027-11-01', 'Todos los Santos',                    'nacional', 2027),
('2027-12-06', 'Día de la Constitución',              'nacional', 2027),
('2027-12-08', 'Inmaculada Concepción',               'nacional', 2027),
-- Comunitat Valenciana (REVISAR)
('2027-03-19', 'San José (Fallas)',                   'local',    2027),
('2027-03-29', 'Lunes de Pascua',                     'local',    2027),
('2027-06-24', 'San Juan',                            'local',    2027),
('2027-10-09', 'Día de la Comunitat Valenciana',      'local',    2027),
-- Alicante (REVISAR)
('2027-04-08', 'Santa Faz',                           'local',    2027),
('2027-06-23', 'Hogueras',                            'local',    2027)
ON CONFLICT (fecha) DO NOTHING;

SELECT fecha, nombre, tipo, anio FROM festivos
WHERE fecha BETWEEN '2027-01-01' AND '2028-01-06' ORDER BY fecha;
