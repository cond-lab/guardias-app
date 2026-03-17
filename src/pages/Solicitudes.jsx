import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

function formatFecha(f) { return format(parseISO(f), "d MMM yyyy", { locale: es }) }

export default function Solicitudes() {
  const { user, isAdmin } = useAuth()
  const [solicitudes, setSolicitudes] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalResolver, setModalResolver] = useState(null)
  const [respuesta, setRespuesta] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    let q = supabase
      .from('solicitudes_cambio')
      .select(`
        *,
        semanas_guardia(lunes_inicio, lunes_fin, tipo, anio),
        solicitante:tecnico_solicitante_id(nombre),
        receptor:tecnico_receptor_id(nombre)
      `)
      .order('created_at', { ascending: false })

    if (!isAdmin) {
      q = q.or(`tecnico_solicitante_id.eq.${user.id},tecnico_receptor_id.eq.${user.id}`)
    }

    const { data } = await q
    setSolicitudes(data || [])
    setLoading(false)
  }

  async function resolver(estado) {
    setProcesando(true); setMsg(null)
    try {
      const s = modalResolver
      const anio = s.semanas_guardia?.anio || 2026

      if (estado === 'aprobada') {
        // Asignar la guardia al técnico receptor
        await supabase
          .from('semanas_guardia')
          .update({ tecnico_id: s.tecnico_receptor_id, estado: 'modificada' })
          .eq('id', s.semana_id)

        // Si es sustitución, avanzar el puntero de la rueda de sustitución
        if (s.tipo_cambio === 'sustitucion') {
          const { data: punteroData } = await supabase
            .from('rueda_punteros')
            .select('puntero')
            .eq('tipo', 'sustitucion')
            .eq('anio', anio)
            .single()

          const nuevoPuntero = (punteroData?.puntero ?? 0) + 1
          await supabase
            .from('rueda_punteros')
            .upsert({ tipo: 'sustitucion', anio, puntero: nuevoPuntero, updated_at: new Date().toISOString() })
        }
      }

      await supabase
        .from('solicitudes_cambio')
        .update({ estado, respuesta_admin: respuesta || null, updated_at: new Date().toISOString() })
        .eq('id', s.id)

      setMsg({ tipo: 'success', texto: `Solicitud ${estado} correctamente` })
      setTimeout(() => { setModalResolver(null); setRespuesta(''); setMsg(null); cargar() }, 1500)
    } catch (err) {
      setMsg({ tipo: 'danger', texto: err.message })
    } finally {
      setProcesando(false)
    }
  }

  const estadoBadge = (e) => {
    const map = { pendiente: 'badge-pendiente', aprobada: 'badge-aprobada', rechazada: 'badge-rechazada' }
    return <span className={`badge ${map[e]}`}>{e}</span>
  }

  const tipoCambioLabel = (t) => {
    if (t === 'sustitucion') return '🔄 Sustitución'
    if (t === 'intercambio') return '↔️ Intercambio'
    return t
  }

  const pendientes = solicitudes.filter(s => s.estado === 'pendiente').length

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Solicitudes de Cambio</h2>
          <p>{isAdmin ? 'Gestión de todas las solicitudes' : 'Tus solicitudes de cambio de guardia'}</p>
        </div>
        {pendientes > 0 && (
          <span className="badge badge-pendiente" style={{ fontSize: 13, padding: '6px 12px' }}>
            {pendientes} pendiente{pendientes > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-center"><div className="spinner" /><span>Cargando...</span></div>
        ) : solicitudes.length === 0 ? (
          <div className="alert alert-info">No hay solicitudes registradas.</div>
        ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Semana guardia</th>
                    <th>Solicitante</th>
                    <th>Tipo</th>
                    <th>Sustituto propuesto</th>
                    <th>Motivo</th>
                    <th>Estado</th>
                    {isAdmin && <th>Acción</th>}
                  </tr>
                </thead>
                <tbody>
                  {solicitudes.map(s => (
                    <tr key={s.id}>
                      <td className="text-sm text-muted">{formatFecha(s.created_at)}</td>
                      <td className="text-sm">
                        {s.semanas_guardia
                          ? `${formatFecha(s.semanas_guardia.lunes_inicio)} → ${formatFecha(s.semanas_guardia.lunes_fin)}`
                          : '—'}
                      </td>
                      <td><strong>{s.solicitante?.nombre || '—'}</strong></td>
                      <td>{tipoCambioLabel(s.tipo_cambio)}</td>
                      <td>{s.receptor?.nombre || <span className="text-muted">—</span>}</td>
                      <td style={{ maxWidth: 200, wordBreak: 'break-word' }}>{s.motivo}</td>
                      <td>{estadoBadge(s.estado)}</td>
                      {isAdmin && (
                        <td>
                          {s.estado === 'pendiente' && (
                            <button className="btn btn-outline btn-sm" onClick={() => { setModalResolver(s); setRespuesta(''); setMsg(null) }}>
                              Resolver
                            </button>
                          )}
                          {s.estado !== 'pendiente' && s.respuesta_admin && (
                            <span className="text-sm text-muted" title={s.respuesta_admin}>💬</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal resolver */}
      {modalResolver && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalResolver(null)}>
          <div className="modal">
            <div className="modal-header">
              <span>Resolver solicitud</span>
              <button className="btn btn-outline btn-icon btn-sm" onClick={() => setModalResolver(null)}>✕</button>
            </div>
            <div className="modal-body">
              {msg && <div className={`alert alert-${msg.tipo}`}>{msg.texto}</div>}
              <div className="alert alert-info mb-3">
                <strong>Solicitante:</strong> {modalResolver.solicitante?.nombre}<br />
                <strong>Semana:</strong> {modalResolver.semanas_guardia
                  ? `${formatFecha(modalResolver.semanas_guardia.lunes_inicio)} → ${formatFecha(modalResolver.semanas_guardia.lunes_fin)}`
                  : '—'}<br />
                <strong>Tipo:</strong> {tipoCambioLabel(modalResolver.tipo_cambio)}<br />
                <strong>Sustituto propuesto:</strong> {modalResolver.receptor?.nombre || '—'}<br />
                <strong>Motivo:</strong> {modalResolver.motivo}
              </div>
              {modalResolver.tipo_cambio === 'sustitucion' && (
                <div className="alert alert-warning mb-3">
                  ⚠️ Si apruebas, la guardia pasará a <strong>{modalResolver.receptor?.nombre}</strong> y la rueda de sustitución avanzará una posición.
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Respuesta / Comentario (opcional)</label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="Añade un comentario para el técnico..."
                  value={respuesta}
                  onChange={e => setRespuesta(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModalResolver(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={() => resolver('rechazada')} disabled={procesando}>✕ Rechazar</button>
              <button className="btn btn-success" onClick={() => resolver('aprobada')} disabled={procesando}>✓ Aprobar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
