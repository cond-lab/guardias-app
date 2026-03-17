import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function tipoBadge(tipo) {
  if (tipo === 'festivo') return <span className="badge badge-festivo">🏖 Festivo</span>
  if (tipo?.startsWith('navidad')) {
    const labels = { navidad_nochebuena: '🎄 Nochebuena', navidad_navidad: '🎅 Navidad', navidad_reyes: '👑 Reyes' }
    return <span className="badge badge-navidad">{labels[tipo] || '🎄 Navidad'}</span>
  }
  return null
}

function formatRango(inicio, fin) {
  const d1 = parseISO(inicio)
  const d2 = parseISO(fin)
  return `${format(d1, 'd MMM', { locale: es })} → ${format(d2, 'd MMM', { locale: es })}`
}

export default function Calendario() {
  const { user } = useAuth()
  const [anio, setAnio] = useState(2026)
  const [guardias, setGuardias] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todas') // 'todas' | 'festivos' | 'navidad' | 'mias'

  useEffect(() => { cargar() }, [anio])

  async function cargar() {
    setLoading(true)
    const { data } = await supabase
      .from('semanas_guardia')
      .select('*, tecnicos(nombre)')
      .eq('anio', anio)
      .order('lunes_inicio')
    setGuardias(data || [])
    setLoading(false)
  }

  // Agrupar por mes
  const porMes = {}
  for (let m = 0; m < 12; m++) porMes[m] = []
  for (const g of guardias) {
    const mes = parseISO(g.lunes_inicio).getMonth()
    let mostrar = true
    if (filtro === 'festivos') mostrar = g.tipo === 'festivo'
    if (filtro === 'navidad') mostrar = g.tipo?.startsWith('navidad')
    if (filtro === 'mias') mostrar = g.tecnico_id === user.id
    if (mostrar) porMes[mes].push(g)
  }

  const totalMias = guardias.filter(g => g.tecnico_id === user.id).length
  const totalFestivos = guardias.filter(g => g.tipo === 'festivo').length

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Calendario de Guardias</h2>
          <p>Vista anual de la rueda de guardias</p>
        </div>
        <div className="flex gap-2">
          <select className="form-control" style={{ width: 'auto' }} value={anio} onChange={e => setAnio(+e.target.value)}>
            {[2025,2026,2027].map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div className="page-body">
        {/* Stats rápidas */}
        <div className="stats-grid mb-4">
          <div className="stat-card">
            <div className="stat-num">{guardias.length}</div>
            <div className="stat-label">Semanas totales</div>
          </div>
          <div className="stat-card">
            <div className="stat-num">{totalMias}</div>
            <div className="stat-label">Mis guardias</div>
          </div>
          <div className="stat-card">
            <div className="stat-num">{totalFestivos}</div>
            <div className="stat-label">Semanas festivo</div>
          </div>
          <div className="stat-card">
            <div className="stat-num">{guardias.filter(g => g.tipo?.startsWith('navidad')).length}</div>
            <div className="stat-label">Rueda navidad</div>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex gap-2 mb-4">
          {[['todas','Todas'],['mias','Mis guardias'],['festivos','Festivos'],['navidad','Navidad']].map(([val, label]) => (
            <button key={val} className={`btn ${filtro === val ? 'btn-primary' : 'btn-outline'} btn-sm`} onClick={() => setFiltro(val)}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner" /><span>Cargando guardias...</span></div>
        ) : guardias.length === 0 ? (
          <div className="alert alert-warning">No hay guardias generadas para {anio}. El administrador debe generarlas desde el panel de gestión.</div>
        ) : (
          <div className="cal-grid">
            {Object.entries(porMes).map(([mes, sems]) => {
              if (!sems.length) return null
              return (
                <div key={mes} className="card cal-mes">
                  <div className="cal-mes-titulo">{MESES[mes]}</div>
                  {sems.map(g => (
                    <div key={g.id} className={`cal-semana tipo-${g.tipo?.startsWith('navidad') ? 'navidad' : g.tipo} ${g.tecnico_id === user.id ? 'mi-guardia' : ''}`}>
                      <div className="cal-fechas">
                        <div className="cal-rango">{formatRango(g.lunes_inicio, g.lunes_fin)}</div>
                        {(g.tiene_festivo || g.tipo?.startsWith('navidad')) && (
                          <div className="cal-festivo-nombre">{g.festivo_nombre}</div>
                        )}
                        {tipoBadge(g.tipo)}
                      </div>
                      <div className={`cal-tecnico ${!g.tecnicos ? 'sin-asignar' : ''}`}>
                        {g.tecnicos?.nombre || 'Sin asignar'}
                        {g.tecnico_id === user.id && <div style={{ fontSize: 10, color: '#2B6CB0' }}>← Tú</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
