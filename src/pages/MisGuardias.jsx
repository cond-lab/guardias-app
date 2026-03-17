import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

function formatFecha(f) { return format(parseISO(f), "d 'de' MMMM yyyy", { locale: es }) }

export default function MisGuardias() {
  const { user } = useAuth()
  const [anio, setAnio] = useState(2026)
  const [guardias, setGuardias] = useState([])
  const [tecnicos, setTecnicos] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // semana seleccionada para cambio
  const [form, setForm] = useState({ tipo_cambio: 'intercambio', tecnico_receptor_id: '', motivo: '' })
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { cargar() }, [anio])

  async function cargar() {
    setLoading(true)
    const [{ data: g }, { data: t }] = await Promise.all([
      supabase.from('semanas_guardia').select('*').eq('tecnico_id', user.id).eq('anio', anio).order('lunes_inicio'),
      supabase.from('tecnicos').select('id,nombre').eq('activo', true).neq('id', user.id).neq('rol','admin')
    ])
    setGuardias(g || [])
    setTecnicos(t || [])
    setLoading(false)
  }

  async function solicitarCambio() {
    if (!form.motivo.trim()) { setMsg({ tipo: 'danger', texto: 'El motivo es obligatorio' }); return }
    setEnviando(true); setMsg(null)
    try {
      // Verificar si ya hay solicitud pendiente
      const { data: pend } = await supabase
        .from('solicitudes_cambio')
        .select('id')
        .eq('semana_id', modal.id)
        .eq('estado', 'pendiente')
      if (pend?.length) { setMsg({ tipo: 'danger', texto: 'Ya hay una solicitud pendiente para esta semana' }); setEnviando(false); return }

      const { error } = await supabase.from('solicitudes_cambio').insert({
        semana_id: modal.id,
        tecnico_solicitante_id: user.id,
        tecnico_receptor_id: form.tecnico_receptor_id || null,
        tipo_cambio: form.tipo_cambio,
        motivo: form.motivo
      })
      if (error) throw error
      setMsg({ tipo: 'success', texto: 'Solicitud enviada correctamente. El administrador la revisará.' })
      setTimeout(() => { setModal(null); setMsg(null); setForm({ tipo_cambio: 'intercambio', tecnico_receptor_id: '', motivo: '' }) }, 2000)
    } catch (err) {
      setMsg({ tipo: 'danger', texto: err.message })
    } finally {
      setEnviando(false)
    }
  }

  const tipoLabel = { normal: 'Normal', festivo: '🏖 Festivo', navidad_nochebuena: '🎄 Nochebuena', navidad_navidad: '🎅 Navidad', navidad_reyes: '👑 Reyes' }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Mis Guardias</h2>
          <p>Tus semanas de guardia asignadas</p>
        </div>
        <select className="form-control" style={{ width: 'auto' }} value={anio} onChange={e => setAnio(+e.target.value)}>
          {[2025,2026,2027].map(a => <option key={a}>{a}</option>)}
        </select>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-center"><div className="spinner" /><span>Cargando...</span></div>
        ) : (
          <>
            <div className="stats-grid mb-4">
              <div className="stat-card">
                <div className="stat-num">{guardias.length}</div>
                <div className="stat-label">Total guardias</div>
              </div>
              <div className="stat-card">
                <div className="stat-num">{guardias.filter(g => g.tipo === 'festivo').length}</div>
                <div className="stat-label">En festivo</div>
              </div>
              <div className="stat-card">
                <div className="stat-num">{guardias.filter(g => g.tipo?.startsWith('navidad')).length}</div>
                <div className="stat-label">Navidad</div>
              </div>
              <div className="stat-card">
                <div className="stat-num">{guardias.filter(g => g.tipo === 'normal').length}</div>
                <div className="stat-label">Normales</div>
              </div>
            </div>

            {guardias.length === 0 ? (
              <div className="alert alert-info">No tienes guardias asignadas para {anio}.</div>
            ) : (
              <div className="card">
                <div className="card-header">Detalle de guardias {anio}</div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Inicio (Lunes)</th>
                        <th>Fin (Lunes)</th>
                        <th>Tipo</th>
                        <th>Festivo</th>
                        <th>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {guardias.map((g, i) => (
                        <tr key={g.id} className={g.tipo === 'festivo' ? 'row-festivo' : g.tipo?.startsWith('navidad') ? 'row-navidad' : ''}>
                          <td className="font-mono text-muted">{i + 1}</td>
                          <td>{formatFecha(g.lunes_inicio)}</td>
                          <td>{formatFecha(g.lunes_fin)}</td>
                          <td>{tipoLabel[g.tipo] || g.tipo}</td>
                          <td>{g.festivo_nombre || <span className="text-muted">—</span>}</td>
                          <td>
                            {!g.tipo?.startsWith('navidad') && (
                              <button className="btn btn-outline btn-sm" onClick={() => { setModal(g); setMsg(null) }}>
                                🔄 Solicitar cambio
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal solicitud */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <span>Solicitar cambio de guardia</span>
              <button className="btn btn-outline btn-icon btn-sm" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {msg && <div className={`alert alert-${msg.tipo}`}>{msg.texto}</div>}
              <div className="alert alert-info" style={{ marginBottom: 14 }}>
                <strong>Semana:</strong> {formatFecha(modal.lunes_inicio)} → {formatFecha(modal.lunes_fin)}
              </div>
              <div className="form-group">
                <label className="form-label">Tipo de cambio</label>
                <select className="form-control" value={form.tipo_cambio} onChange={e => setForm(p => ({ ...p, tipo_cambio: e.target.value }))}>
                  <option value="intercambio">Intercambio con otro técnico</option>
                  <option value="reasignacion">Reasignación (sin técnico específico)</option>
                </select>
              </div>
              {form.tipo_cambio === 'intercambio' && (
                <div className="form-group">
                  <label className="form-label">Técnico con quien intercambiar</label>
                  <select className="form-control" value={form.tecnico_receptor_id} onChange={e => setForm(p => ({ ...p, tecnico_receptor_id: e.target.value }))}>
                    <option value="">— Selecciona técnico —</option>
                    {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Motivo *</label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="Explica el motivo del cambio..."
                  value={form.motivo}
                  onChange={e => setForm(p => ({ ...p, motivo: e.target.value }))}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={solicitarCambio} disabled={enviando}>
                {enviando ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Enviando...</> : 'Enviar solicitud'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
