import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'

const FORM_VACIO = { nombre: '', email: '', pin: '', rol: 'tecnico', orden_rueda_normal: 0, orden_rueda_navidad: 0 }

export default function AdminTecnicos() {
  const [tecnicos, setTecnicos] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'nuevo' | tecnico
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from('tecnicos').select('*').order('orden_rueda_normal')
    setTecnicos(data || [])
    setLoading(false)
  }

  function abrirNuevo() { setForm({ ...FORM_VACIO, orden_rueda_normal: tecnicos.length, orden_rueda_navidad: tecnicos.length }); setModal('nuevo'); setMsg(null) }
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

  // Mover en rueda normal
  async function moverRueda(tipo, id, direccion) {
    const campo = tipo === 'normal' ? 'orden_rueda_normal' : 'orden_rueda_navidad'
    const lista = [...tecnicos].filter(t => t.rol !== 'admin').sort((a, b) => a[campo] - b[campo])
    const idx = lista.findIndex(t => t.id === id)
    if (idx < 0) return
    const nuevoIdx = idx + direccion
    if (nuevoIdx < 0 || nuevoIdx >= lista.length) return
    // Swap
    const a = lista[idx], b = lista[nuevoIdx]
    await Promise.all([
      supabase.from('tecnicos').update({ [campo]: b[campo] }).eq('id', a.id),
      supabase.from('tecnicos').update({ [campo]: a[campo] }).eq('id', b.id),
    ])
    cargar()
  }

  const tecnicosActivos = tecnicos.filter(t => t.rol !== 'admin' && t.activo).sort((a, b) => a.orden_rueda_normal - b.orden_rueda_normal)
  const tecnicosNavidad = tecnicos.filter(t => t.rol !== 'admin' && t.activo).sort((a, b) => a.orden_rueda_navidad - b.orden_rueda_navidad)

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Gestión de Técnicos</h2>
          <p>Alta, baja y orden de la rueda</p>
        </div>
        <button className="btn btn-primary" onClick={abrirNuevo}>+ Nuevo técnico</button>
      </div>

      <div className="page-body">
        {msg && !modal && <div className={`alert alert-${msg.tipo}`}>{msg.texto}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          {/* Rueda normal */}
          <div className="card">
            <div className="card-header">Rueda Normal (orden de guardia)</div>
            <div>
              {tecnicosActivos.length === 0 ? (
                <div className="card-body text-muted">No hay técnicos activos</div>
              ) : tecnicosActivos.map((t, i) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--gris-2)', gap: 10 }}>
                  <span className="font-mono text-muted" style={{ width: 24, textAlign: 'right', fontSize: 12 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontWeight: 500 }}>{t.nombre}</span>
                  <button className="btn btn-outline btn-icon btn-sm" onClick={() => moverRueda('normal', t.id, -1)} disabled={i === 0}>▲</button>
                  <button className="btn btn-outline btn-icon btn-sm" onClick={() => moverRueda('normal', t.id, 1)} disabled={i === tecnicosActivos.length - 1}>▼</button>
                </div>
              ))}
            </div>
          </div>

          {/* Rueda navidad */}
          <div className="card">
            <div className="card-header">Rueda Navidad (Nochebuena → Navidad → Reyes)</div>
            <div>
              {tecnicosNavidad.length === 0 ? (
                <div className="card-body text-muted">No hay técnicos activos</div>
              ) : tecnicosNavidad.map((t, i) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--gris-2)', gap: 10 }}>
                  <span className="font-mono text-muted" style={{ width: 24, textAlign: 'right', fontSize: 12 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontWeight: 500 }}>{t.nombre}</span>
                  <span style={{ fontSize: 11, color: 'var(--navidad)' }}>
                    {i === 0 ? '🎄 Nochebuena' : i === 1 ? '🎅 Navidad' : i === 2 ? '👑 Reyes' : ''}
                  </span>
                  <button className="btn btn-outline btn-icon btn-sm" onClick={() => moverRueda('navidad', t.id, -1)} disabled={i === 0}>▲</button>
                  <button className="btn btn-outline btn-icon btn-sm" onClick={() => moverRueda('navidad', t.id, 1)} disabled={i === tecnicosNavidad.length - 1}>▼</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabla todos */}
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
                    <th>Pos. Normal</th>
                    <th>Pos. Navidad</th>
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
                      <td className="font-mono text-muted">{t.rol !== 'admin' ? t.orden_rueda_normal + 1 : '—'}</td>
                      <td className="font-mono text-muted">{t.rol !== 'admin' ? t.orden_rueda_navidad + 1 : '—'}</td>
                      <td>
                        <span className={`badge ${t.activo ? 'badge-aprobada' : 'badge-rechazada'}`}>{t.activo ? 'Activo' : 'Inactivo'}</span>
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <button className="btn btn-outline btn-sm" onClick={() => abrirEditar(t)}>✏️ Editar</button>
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

      {/* Modal crear/editar */}
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Posición rueda normal</label>
                  <input className="form-control" type="number" min={0} value={form.orden_rueda_normal} onChange={e => setForm(p => ({ ...p, orden_rueda_normal: +e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Posición rueda navidad</label>
                  <input className="form-control" type="number" min={0} value={form.orden_rueda_navidad} onChange={e => setForm(p => ({ ...p, orden_rueda_navidad: +e.target.value }))} />
                </div>
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
