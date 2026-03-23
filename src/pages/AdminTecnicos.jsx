import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'

const FORM_VACIO = { nombre: '', email: '', pin: '', rol: 'tecnico', orden_rueda_normal: 0, orden_rueda_festivo: 0, orden_rueda_navidad: 0, orden_rueda_sustitucion: 0, hace_guardias: true }

const RUEDAS = [
  { key: 'orden_rueda_normal',       label: 'Rueda Normal',        emoji: '📅' },
  { key: 'orden_rueda_festivo',      label: 'Rueda Festivos',      emoji: '🏖' },
  { key: 'orden_rueda_navidad',      label: 'Rueda Navidad',       emoji: '🎄' },
  { key: 'orden_rueda_sustitucion',  label: 'Rueda Sustitución',   emoji: '🔄' },
]

const NAVIDAD_LABELS = ['🎄 Nochebuena', '🎅 Navidad', '👑 Reyes']

export default function AdminTecnicos() {
  const [tecnicos, setTecnicos] = useState([])
  const [punteroSust, setPunteroSust] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)
  const [ruedaActiva, setRuedaActiva] = useState('orden_rueda_normal')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('tecnicos').select('*').order('orden_rueda_normal'),
      supabase.from('rueda_punteros').select('puntero').eq('tipo', 'sustitucion').eq('anio', 2026).single()
    ])
    setTecnicos(t || [])
    setPunteroSust(p?.puntero || 0)
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

  async function toggleActivo(t) {
    await supabase.from('tecnicos').update({ activo: !t.activo }).eq('id', t.id)
    cargar()
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

  async function resetearPuntero() {
    if (!window.confirm('¿Resetear el puntero de la rueda de sustitución a 0?')) return
    await supabase.from('rueda_punteros').upsert({ tipo: 'sustitucion', anio: 2026, puntero: 0, updated_at: new Date().toISOString() })
    setPunteroSust(0)
  }

  const tecnicosPorRueda = (campo) =>
    tecnicos.filter(t => t.rol !== 'admin' && t.activo && t.hace_guardias !== false).sort((a, b) => (a[campo] ?? 0) - (b[campo] ?? 0))

  const ruedaActual = RUEDAS.find(r => r.key === ruedaActiva)
  const listaTecnicos = tecnicosPorRueda(ruedaActiva)

  // Calcular quién es el siguiente en sustitución
  const tecnicosSust = tecnicosPorRueda('orden_rueda_sustitucion')
  const tecnicoEnTurno = tecnicosSust.length ? tecnicosSust[punteroSust % tecnicosSust.length] : null

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
                Los primeros 3 técnicos se asignan a Nochebuena, Navidad y Reyes respectivamente.
              </div>
            )}
            {ruedaActiva === 'orden_rueda_sustitucion' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 0' }}>
                <div className="alert alert-info" style={{ margin: 0, flex: 1 }}>
                  <strong>Turno actual:</strong> {tecnicoEnTurno ? <strong> {tecnicoEnTurno.nombre}</strong> : ' —'}
                  <span className="text-muted" style={{ marginLeft: 8 }}>(puntero: {punteroSust})</span>
                </div>
                <button className="btn btn-warning btn-sm" style={{ marginLeft: 12 }} onClick={resetearPuntero}>
                  ↺ Resetear puntero
                </button>
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
                {ruedaActiva === 'orden_rueda_navidad' && i < 3 && (
                  <span style={{ fontSize: 11, color: 'var(--navidad)', marginRight: 8 }}>{NAVIDAD_LABELS[i]}</span>
                )}
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
                    <tr key={t.id}>
                      <td><strong>{t.nombre}</strong></td>
                      <td className="text-sm text-muted">{t.email || '—'}</td>
                      <td className="font-mono text-sm">{t.pin}</td>
                      <td>{t.rol === 'admin' ? <span className="badge badge-navidad">Admin</span> : <span className="badge badge-normal">Técnico</span>}</td>
                      <td className="font-mono text-muted text-sm">{t.rol !== 'admin' ? (t.orden_rueda_normal ?? 0) + 1 : '—'}</td>
                      <td className="font-mono text-muted text-sm">{t.rol !== 'admin' ? (t.orden_rueda_festivo ?? 0) + 1 : '—'}</td>
                      <td className="font-mono text-muted text-sm">{t.rol !== 'admin' ? (t.orden_rueda_navidad ?? 0) + 1 : '—'}</td>
                      <td className="font-mono text-muted text-sm">{t.rol !== 'admin' ? (t.orden_rueda_sustitucion ?? 0) + 1 : '—'}</td>
                      <td>{t.rol !== 'admin' ? <span className={`badge ${t.hace_guardias !== false ? 'badge-aprobada' : 'badge-rechazada'}`}>{t.hace_guardias !== false ? 'Sí' : 'No'}</span> : '—'}</td>
                      <td><span className={`badge ${t.activo ? 'badge-aprobada' : 'badge-rechazada'}`}>{t.activo ? 'Activo' : 'Inactivo'}</span></td>
                      <td>
                        <div className="flex gap-2">
                          <button className="btn btn-outline btn-sm" onClick={() => abrirEditar(t)}>✏️</button>
                          {t.rol !== 'admin' && (
                            <button className={`btn btn-sm ${t.activo ? 'btn-warning' : 'btn-success'}`} onClick={() => toggleActivo(t)}>
                              {t.activo ? 'Desactivar' : 'Activar'}
                            </button>
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
              <div className="form-group">
                <label className="form-label">¿Entra en rueda de guardias?</label>
                <select className="form-control" value={form.hace_guardias ? 'si' : 'no'} onChange={e => setForm(p => ({ ...p, hace_guardias: e.target.value === 'si' }))}>
                  <option value="si">Sí — entra en la rueda de guardias</option>
                  <option value="no">No — solo conductivos</option>
                </select>
              </div>
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
    </>
  )
}
