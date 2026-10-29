import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { format, parseISO, addDays, differenceInCalendarDays } from 'date-fns'
import { es } from 'date-fns/locale'
import Avatar from './Avatar'

const TIPO = {
  normal: 'Guardia normal', festivo: 'Semana con festivo',
  navidad_nochebuena: 'Nochebuena', navidad_navidad: 'Navidad', navidad_reyes: 'Reyes', navidad_anionuevo: 'Año Nuevo',
}
const rango = s => `${format(parseISO(s.lunes_inicio), "d MMM", { locale: es })} → ${format(parseISO(s.lunes_fin), "d MMM", { locale: es })}`

/**
 * Quién está de guardia esta semana, cuántos días le quedan y las próximas semanas.
 * Busca por fechas (no por año) para que funcione también en el cambio de año.
 */
export default function GuardiaAhora({ userId, proximas = 5 }) {
  const [semanas, setSemanas] = useState(null)

  useEffect(() => {
    const hoy = new Date()
    supabase
      .from('semanas_guardia')
      .select('id, lunes_inicio, lunes_fin, tipo, festivo_nombre, tecnico_id, tecnicos!tecnico_id(nombre)')
      .gt('lunes_fin', format(hoy, 'yyyy-MM-dd'))
      .lte('lunes_inicio', format(addDays(hoy, 7 * (proximas + 1)), 'yyyy-MM-dd'))
      .order('lunes_inicio')
      .then(({ data }) => setSemanas(data || []))
  }, [proximas])

  if (!semanas?.length) return null

  const hoy = new Date()
  const actual = semanas.find(s => parseISO(s.lunes_inicio) <= hoy) || null
  const siguientes = semanas.filter(s => s !== actual).slice(0, proximas)
  const tipoClase = actual?.tipo === 'festivo' ? 'tipo-festivo' : actual?.tipo?.startsWith('navidad') ? 'tipo-navidad' : ''
  const quedan = actual ? Math.max(0, differenceInCalendarDays(parseISO(actual.lunes_fin), hoy)) : 0

  return (
    <section className={`ahora ${tipoClase}`} aria-label="Guardia de esta semana">
      {actual ? (
        <>
          <div>
            <div className="ahora-etiqueta">De guardia esta semana</div>
            <div className="ahora-persona">
              <Avatar id={actual.tecnico_id} nombre={actual.tecnicos?.nombre || '?'} size={52} />
              <div>
                <div className="ahora-nombre">
                  {actual.tecnicos?.nombre || 'Sin asignar'}{actual.tecnico_id === userId ? ' (tú)' : ''}
                </div>
                <div className="ahora-detalle">
                  {rango(actual)} · {TIPO[actual.tipo] || actual.tipo}{actual.festivo_nombre ? ` · ${actual.festivo_nombre}` : ''}
                </div>
              </div>
            </div>
          </div>
          <div className="ahora-dias">
            <strong>{quedan}</strong>
            <span>{quedan === 1 ? 'día queda' : 'días quedan'}</span>
          </div>
        </>
      ) : (
        <div>
          <div className="ahora-etiqueta">Esta semana</div>
          <div className="ahora-nombre" style={{ marginTop: 10 }}>Sin guardia asignada</div>
        </div>
      )}
      {siguientes.length > 0 && (
        <div className="ahora-proximas">
          <span className="ahora-proximas-titulo">Próximas:</span>
          {siguientes.map(s => (
            <span key={s.id} className={`ahora-prox${s.tecnico_id === userId ? ' es-mia' : ''}`} title={`${rango(s)} · ${s.tecnicos?.nombre || 'Sin asignar'}`}>
              <Avatar id={s.tecnico_id} nombre={s.tecnicos?.nombre || '?'} size={22} />
              {(s.tecnicos?.nombre || 'Sin asignar').split(' ')[0]}
              <small>{format(parseISO(s.lunes_inicio), 'd MMM', { locale: es })}</small>
            </span>
          ))}
        </div>
      )}
    </section>
  )
}
