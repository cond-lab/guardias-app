import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { getSiguienteReserva, puedeHacerGuardias, tecnicoOriginal } from '../utils/asignacion'
import { format, parseISO, addDays } from 'date-fns'
import { es } from 'date-fns/locale'

const formatFecha = f => format(parseISO(f), "d MMM yyyy", { locale: es })
const hoy = () => format(new Date(), 'yyyy-MM-dd')

const FORM_VACIO = { nombre: '', email: '', pin: '', rol: 'tecnico', orden_rueda_normal: 0, orden_rueda_festivo: 0, orden_rueda_navidad: 0, orden_rueda_sustitucion: 0, hace_guardias: true }

const RUEDAS = [
  { key: 'orden_rueda_normal',       label: 'Rueda Normal',        emoji: '📅' },
  { key: 'orden_rueda_festivo',      label: 'Rueda Festivos',      emoji: '🏖' },
  { key: 'orden_rueda_navidad',      label: 'Rueda Navidad',       emoji: '🎄' },
  { key: 'orden_rueda_sustitucion',  label: 'Rueda Sustitución',   emoji: '🔄' },
]

export default function AdminTecnicos() {
  const [tecnicos, setTecnicos] = useState([])
  const [ultimoReservaId, setUltimoReservaId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)
  const [ruedaActiva, setRuedaActiva] = useState('orden_rueda_normal')
  // Cambio de estado pendiente de confirmar: { tecnico, cambio, titulo, semanas: [{ semana, receptor, aviso }] }
  const [modalEstado, setModalEstado] = useState(null)
  const [aplicando, setAplicando] = useState(false)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('tecnicos').select('*').order('orden_rueda_normal'),
      supabase.from('rueda_punteros').select('ultimo_tecnico_id').eq('tipo', 'sustitucion').eq('anio', 0).maybeSingle()
    ])
    setTecnicos(t || [])
    setUltimoReservaId(p?.ultimo_tecnico_id || null)
    setLoading(false)
  }

  function abrirNuevo() {
    const n = tecnicos.filter(t => t.rol !== 'admin').length
    setForm({ ...FORM_VACIO, orden_rueda_normal: n, orden_rueda_festivo: n, orden_rueda_navidad: n, orden_rueda_sustitucion: n })
    setModal('nuevo'); setMsg(null)
  }
  function abrirEditar(t) { setForm({ ...t }); setModal(t); setMsg(null) }

  async function guardar() {
    if (!form.nombre.trim() || !form.pin.trim()) { setMsg({ tipo: 'danger', texto: 'Nombre y PIN son obligatorios' }); return }
    setGuardando(true); setMsg(null)
    try {
      if (modal === 'nuevo') {
        const { error } = await supabase.from('tecnicos').insert({ ...form })
        if (error) throw error
      } else {
        const { error } = await supabase.from('tecnicos').update({ ...form }).eq('id', modal.id)
        if (error) throw error
      }
      setMsg({ tipo: 'success', texto: modal === 'nuevo' ? 'Técnico creado' : 'Técnico actualizado' })
      setTimeout(() => { setModal(null); setMsg(null); cargar() }, 1000)
    } catch (err) {
      setMsg({ tipo: 'danger', texto: err.message })
    } finally {
      setGuardando(false)
    }
  }

  /**
   * Baja (activo=false: no entra en la app ni en las ruedas) o
   * fuera de guardias (hace_guardias=false: entra en la app, no en las ruedas).
   * Si sale de las ruedas, sus semanas futuras pasan por la rueda de reserva.
   */
  async function prepararCambio(t, cambio, titulo) {
    setMsg(null)
    const despues = { ...t, ...cambio }
    let semanas = []
    if (puedeHacerGuardias(t) && !puedeHacerGuardias(despues)) {
      const { data: futuras, error } = await supabase
        .from('semanas_guardia')
        .select('*')
        .eq('tecnico_id', t.id)
        .gte('lunes_inicio', hoy())
        .order('lunes_inicio')
      if (error) { setMsg({ tipo: 'danger', texto: error.message }); return }

      // Guardias de todos alrededor de esas semanas, para avisar si alguien queda con dos seguidas
      let vecinas = []
      if (futuras?.length) {
        const { data } = await supabase
          .from('semanas_guardia')
          .select('lunes_inicio, tecnico_id')
          .gte('lunes_inicio', format(addDays(parseISO(futuras[0].lunes_inicio), -7), 'yyyy-MM-dd'))
          .lte('lunes_inicio', format(addDays(parseISO(futuras.at(-1).lunes_inicio), 7), 'yyyy-MM-dd'))
        vecinas = data || []
      }

      const tecnicosDespues = tecnicos.map(x => x.id === t.id ? despues : x)
      let ultimo = ultimoReservaId
      semanas = (futuras || []).map(semana => {
        const receptor = getSiguienteReserva(tecnicosDespues, ultimo, t.id)
        if (receptor) ultimo = receptor.id
        const antes = format(addDays(parseISO(semana.lunes_inicio), -7), 'yyyy-MM-dd')
        const luego = format(addDays(parseISO(semana.lunes_inicio), 7), 'yyyy-MM-dd')
        const pegada = receptor && vecinas.some(v => v.tecnico_id === receptor.id && (v.lunes_inicio === antes || v.lunes_inicio === luego))
        return { semana, receptor, aviso: pegada ? 'tiene guardia la semana de al lado' : null }
      })
    }
    setModalEstado({ tecnico: t, cambio, titulo, semanas })
  }

  async function confirmarCambio() {
    const { tecnico: t, cambio, semanas } = modalEstado
    setAplicando(true); setMsg(null)
    try {
      const { error } = await supabase.from('tecnicos').update(cambio).eq('id', t.id)
      if (error) throw error

      const motivo = cambio.activo === false ? `Baja de ${t.nombre}` : `${t.nombre} sale de guardias`
      for (const { semana, receptor } of semanas) {
        if (!receptor) continue
        // Queda en Solicitudes como reserva aprobada, igual que un cambio normal
        const { error: errSol } = await supabase.from('solicitudes_cambio').insert({
          semana_id: semana.id,
          tecnico_solicitante_id: t.id,
          tecnico_receptor_id: receptor.id,
          tipo_cambio: 'sustitucion',
          motivo,
          estado: 'aprobada',
          respuesta_admin: 'Reasignada automáticamente por la rueda de reserva',
        })
        if (errSol) throw errSol
        const { error: errSem } = await supabase.from('semanas_guardia')
          .update({ tecnico_id: receptor.id, tecnico_original_id: tecnicoOriginal(semana), estado: 'modificada' })
          .eq('id', semana.id)
        if (errSem) throw errSem
      }

      const ultimo = semanas.filter(s => s.receptor).at(-1)?.receptor
      if (ultimo) {
        const { error: errRueda } = await supabase.from('rueda_punteros')
          .update({ ultimo_tecnico_id: ultimo.id, updated_at: new Date().toISOString() })
          .eq('tipo', 'sustitucion').eq('anio', 0)
        if (errRueda) throw errRueda
      }

      setMsg({ tipo: 'success', texto: `${t.nombre}: ${modalEstado.titulo.toLowerCase()} hecho${semanas.length ? ` · ${semanas.length} semana${semanas.length > 1 ? 's' : ''} reasignada${semanas.length > 1 ? 's' : ''}` : ''}` })
      setModalEstado(null)
      cargar()
    } catch (err) {
      setMsg({ tipo: 'danger', texto: err.message })
      setModalEstado(null)
      cargar()
    } finally {
      setAplicando(false)
    }
  }

  async function moverRueda(campo, id, dir) {
    const lista = [...tecnicos].filter(t => t.rol !== 'admin').sort((a, b) => (a[campo] ?? 0) - (b[campo] ?? 0))
    const idx = lista.findIndex(t => t.id === id)
    if (idx < 0) return
    const nuevoIdx = idx + dir
    if (nuevoIdx < 0 || nuevoIdx >= lista.length) return
    const a = lista[idx], b = lista[nuevoIdx]
    await Promise.all([
      supabase.from('tecnicos').update({ [campo]: b[campo] }).eq('id', a.id),
      supabase.from('tecnicos').update({ [campo]: a[campo] }).eq('id', b.id),
    ])
    cargar()
  }

  const tecnicosPorRueda = (campo) =>
    tecnicos.filter(t => t.rol !== 'admin' && t.activo && t.hace_guardias !== false).sort((a, b) => (a[campo] ?? 0) - (b[campo] ?? 0))

  const ruedaActual = RUEDAS.find(r => r.key === ruedaActiva)
  const listaTecnicos = tecnicosPorRueda(ruedaActiva)

  // Quién hizo la última reserva y a quién le toca la próxima
  const ultimoReserva = tecnicos.find(t => t.id === ultimoReservaId) || null
  const tecnicoEnTurno = getSiguienteReserva(tecnicos, ultimoReservaId)

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Gestión de Técnicos</h2>
          <p>Alta, baja y orden de las ruedas</p>
        </div>
        <button className="btn btn-primary" onClick={abrirNuevo}>+ Nuevo técnico</button>
      </div>

      <div className="page-body">
        {msg && !modal && <div className={`alert alert-${msg.tipo}`}>{msg.texto}</div>}

        {/* Panel ruedas */}
        <div className="card mb-4">
          <div className="card-header">
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              {RUEDAS.map(r => (
                <button
                  key={r.key}
                  className={`btn btn-sm ${ruedaActiva === r.key ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setRuedaActiva(r.key)}
                >
                  {r.emoji} {r.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            {/* Info especial según rueda */}
            {ruedaActiva === 'orden_rueda_navidad' && (
              <div className="alert alert-info" style={{ margin: '12px 16px 0' }}>
                Va rotando: cada semana de Navidad (Reyes, Navidad y Año Nuevo) la hace el siguiente al que hizo la anterior.
              </div>
            )}
            {ruedaActiva === 'orden_rueda_sustitucion' && (
              <div className="alert alert-info" style={{ margin: '12px 16px 0' }}>
                <strong>Próxima reserva:</strong> {tecnicoEnTurno ? <strong> {tecnicoEnTurno.nombre}</strong> : ' —'}
                <span className="text-muted" style={{ marginLeft: 8 }}>
                  (última hecha por {ultimoReserva?.nombre || '—'})
                </span>
              </div>
            )}

            {listaTecnicos.length === 0 ? (
              <div className="card-body text-muted">No hay técnicos activos</div>
            ) : listaTecnicos.map((t, i) => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', padding: '9px 16px',
                borderBottom: '1px solid var(--gris-2)', gap: 10,
                background: ruedaActiva === 'orden_rueda_sustitucion' && t.id === tecnicoEnTurno?.id
                  ? 'var(--azul-claro)' : undefined
              }}>
                <span className="font-mono text-muted" style={{ width: 24, textAlign: 'right', fontSize: 12 }}>{i + 1}</span>
                <span style={{ flex: 1, fontWeight: 500 }}>
                  {t.nombre}
                  {ruedaActiva === 'orden_rueda_sustitucion' && t.id === tecnicoEnTurno?.id &&
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--azul)', fontWeight: 700 }}>← En turno</span>
                  }
                </span>
                <button className="btn btn-outline btn-icon btn-sm" onClick={() => moverRueda(ruedaActiva, t.id, -1)} disabled={i === 0}>▲</button>
                <button className="btn btn-outline btn-icon btn-sm" onClick={() => moverRueda(ruedaActiva, t.id, 1)} disabled={i === listaTecnicos.length - 1}>▼</button>
              </div>
            ))}
          </div>
        </div>

        {/* Tabla todos los técnicos */}
        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : (
          <div className="card">
            <div className="card-header">Todos los técnicos</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Email</th>
                    <th>PIN</th>
                    <th>Rol</th>
                    <th>📅 Normal</th>
                    <th>🏖 Festivo</th>
                    <th>🎄 Navidad</th>
                    <th>🔄 Sust.</th>
                    <th>Guardias</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {tecnicos.map(t => (
                    <tr key={t.id} style={!t.activo ? { opacity: 0.6 } : undefined}>
                      <td><strong>{t.nombre}</strong></td>
                      <td className="text-sm text-muted">{t.email || '—'}</td>
                      <td className="font-mono text-sm">{t.pin}</td>
                      <td>{t.rol === 'admin' ? <span className="badge badge-navidad">Admin</span> : <span className="badge badge-normal">Técnico</span>}</td>
                      <td className="font-mono text-muted text-sm">{t.rol !== 'admin' ? (t.orden_rueda_normal ?? 0) + 1 : '—'}</td>
                      <td className="font-mono text-muted text-sm">{t.rol !== 'admin' ? (t.orden_rueda_festivo ?? 0) + 1 : '—'}</td>
                      <td className="font-mono text-muted text-sm">{t.rol !== 'admin' ? (t.orden_rueda_navidad ?? 0) + 1 : '—'}</td>
                      <td className="font-mono text-muted text-sm">{t.rol !== 'admin' ? (t.orden_rueda_sustitucion ?? 0) + 1 : '—'}</td>
                      <td>{t.rol !== 'admin' ? <span className={`badge ${t.hace_guardias !== false ? 'badge-aprobada' : 'badge-rechazada'}`}>{t.hace_guardias !== false ? 'Sí' : 'No'}</span> : '—'}</td>
                      <td><span className={`badge ${t.activo ? 'badge-aprobada' : 'badge-rechazada'}`}>{t.activo ? 'Activo' : 'Baja'}</span></td>
                      <td>
                        <div className="flex gap-2">
                          <button className="btn btn-outline btn-sm" onClick={() => abrirEditar(t)}>✏️</button>
                          {t.rol !== 'admin' && t.activo && (
                            t.hace_guardias !== false
                              ? <button className="btn btn-outline btn-sm" title="Sigue entrando en la app, pero sale de las ruedas" onClick={() => prepararCambio(t, { hace_guardias: false }, 'Sacar de guardias')}>Sacar de guardias</button>
                              : <button className="btn btn-outline btn-sm" title="Vuelve a entrar en las ruedas" onClick={() => prepararCambio(t, { hace_guardias: true }, 'Meter en guardias')}>Meter en guardias</button>
                          )}
                          {t.rol !== 'admin' && (
                            t.activo
                              ? <button className="btn btn-warning btn-sm" title="No entra en la app ni en las ruedas" onClick={() => prepararCambio(t, { activo: false }, 'Dar de baja')}>Dar de baja</button>
                              : <button className="btn btn-success btn-sm" onClick={() => prepararCambio(t, { activo: true }, 'Reactivar')}>Reactivar</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal !== null && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <span>{modal === 'nuevo' ? 'Nuevo técnico' : `Editar — ${modal.nombre}`}</span>
              <button className="btn btn-outline btn-icon btn-sm" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {msg && <div className={`alert alert-${msg.tipo}`}>{msg.texto}</div>}
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input className="form-control" value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-control" type="email" value={form.email || ''} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">PIN *</label>
                <input className="form-control font-mono" value={form.pin} onChange={e => setForm(p => ({ ...p, pin: e.target.value }))} maxLength={10} placeholder="Ej: 1234" />
              </div>
              <div className="form-group">
                <label className="form-label">Rol</label>
                <select className="form-control" value={form.rol} onChange={e => setForm(p => ({ ...p, rol: e.target.value }))}>
                  <option value="tecnico">Técnico</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              {modal === 'nuevo' ? (
                <div className="form-group">
                  <label className="form-label">¿Entra en rueda de guardias?</label>
                  <select className="form-control" value={form.hace_guardias ? 'si' : 'no'} onChange={e => setForm(p => ({ ...p, hace_guardias: e.target.value === 'si' }))}>
                    <option value="si">Sí — entra en la rueda de guardias</option>
                    <option value="no">No — solo conductivos</option>
                  </select>
                </div>
              ) : (
                <div className="text-sm text-muted mb-3">
                  Para sacarlo o meterlo en guardias, o darlo de baja, usa los botones de la tabla: así se reasignan sus semanas pendientes.
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {RUEDAS.map(r => (
                  <div key={r.key} className="form-group">
                    <label className="form-label">{r.emoji} {r.label}</label>
                    <input className="form-control" type="number" min={0}
                      value={form[r.key] ?? 0}
                      onChange={e => setForm(p => ({ ...p, [r.key]: +e.target.value }))} />
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando}>
                {guardando ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Guardando...</> : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal baja / guardias */}
      {modalEstado && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !aplicando && setModalEstado(null)}>
          <div className="modal">
            <div className="modal-header">
              <span>{modalEstado.titulo} — {modalEstado.tecnico.nombre}</span>
              <button className="btn btn-outline btn-icon btn-sm" onClick={() => setModalEstado(null)} disabled={aplicando}>✕</button>
            </div>
            <div className="modal-body">
              <div className="alert alert-info mb-3">
                {modalEstado.cambio.activo === false && <>No podrá entrar en la app y sale de todas las ruedas. Su historial se conserva.</>}
                {modalEstado.cambio.activo === true && <>Vuelve a poder entrar en la app{modalEstado.tecnico.hace_guardias !== false ? ' y entra otra vez en las ruedas' : ''}.</>}
                {modalEstado.cambio.hace_guardias === false && <>Sigue entrando en la app (conductivos, calendario), pero sale de todas las ruedas.</>}
                {modalEstado.cambio.hace_guardias === true && <>Vuelve a entrar en las ruedas en su posición. Las semanas ya generadas no cambian.</>}
              </div>

              {modalEstado.semanas.length > 0 && (
                <>
                  <div className="form-label">Sus semanas pendientes pasan por la rueda de reserva:</div>
                  <div className="table-wrap mb-3">
                    <table>
                      <thead><tr><th>Semana</th><th>Tipo</th><th>La hará</th></tr></thead>
                      <tbody>
                        {modalEstado.semanas.map(({ semana, receptor, aviso }) => (
                          <tr key={semana.id}>
                            <td className="text-sm">{formatFecha(semana.lunes_inicio)}</td>
                            <td className="text-sm">{semana.tipo}</td>
                            <td>
                              <strong>{receptor?.nombre || 'Sin asignar'}</strong>
                              {aviso && <div className="text-sm" style={{ color: 'var(--naranja)' }}>⚠ {aviso}</div>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-sm text-muted">
                    Quedan en Solicitudes como reservas aprobadas y la rueda de reserva avanza. Si prefieres otro técnico, cámbialo luego con ✏️ en Gestión de Rueda.
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModalEstado(null)} disabled={aplicando}>Cancelar</button>
              <button className={`btn ${modalEstado.cambio.activo === false ? 'btn-warning' : 'btn-primary'}`} onClick={confirmarCambio} disabled={aplicando}>
                {aplicando ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Aplicando...</> : modalEstado.titulo}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
