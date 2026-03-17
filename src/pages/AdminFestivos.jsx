import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const FORM_VACIO = { fecha: '', nombre: '', tipo: 'nacional', anio: 2026 }

export default function AdminFestivos() {
  const [anio, setAnio] = useState(2026)
  const [festivos, setFestivos] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { cargar() }, [anio])

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from('festivos').select('*').eq('anio', anio).order('fecha')
    setFestivos(data || [])
    setLoading(false)
  }

  function abrirNuevo() { setForm({ ...FORM_VACIO, anio }); setModal('nuevo'); setMsg(null) }
  function abrirEditar(f) { setForm({ ...f }); setModal(f); setMsg(null) }

  async function guardar() {
    if (!form.fecha || !form.nombre.trim()) { setMsg({ tipo: 'danger', texto: 'Fecha y nombre son obligatorios' }); return }
    setGuardando(true); setMsg(null)
    try {
      if (modal === 'nuevo') {
        const { error } = await supabase.from('festivos').insert({ ...form })
        if (error) throw error
      } else {
        const { error } = await supabase.from('festivos').update({ fecha: form.fecha, nombre: form.nombre, tipo: form.tipo }).eq('id', modal.id)
        if (error) throw error
      }
      setMsg({ tipo: 'success', texto: 'Festivo guardado' })
      setTimeout(() => { setModal(null); setMsg(null); cargar() }, 800)
    } catch (err) {
      setMsg({ tipo: 'danger', texto: err.message.includes('unique') ? 'Ya existe un festivo en esa fecha' : err.message })
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(id) {
    if (!window.confirm('¿Eliminar este festivo?')) return
    await supabase.from('festivos').delete().eq('id', id)
    cargar()
  }

  const tipoColor = { nacional: 'badge-normal', local: 'badge-festivo', navidad: 'badge-navidad' }
  const tipoLabel = { nacional: '🇪🇸 Nacional', local: '📍 Local', navidad: '🎄 Navidad' }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Gestión de Festivos</h2>
          <p>Festivos nacionales, locales y días especiales de Navidad</p>
        </div>
        <div className="flex gap-2">
          <select className="form-control" style={{ width: 'auto' }} value={anio} onChange={e => setAnio(+e.target.value)}>
            {[2025, 2026, 2027].map(a => <option key={a}>{a}</option>)}
          </select>
          <button className="btn btn-primary" onClick={abrirNuevo}>+ Añadir festivo</button>
        </div>
      </div>

      <div className="page-body">
        <div className="alert alert-info mb-4">
          Los festivos de tipo <strong>Navidad</strong> (Nochebuena, Navidad, Reyes) se asignan a la <strong>rueda separada</strong> de navidades. Los de tipo Nacional y Local marcan la semana como "guardia de festivo".
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : (
          <div className="card">
            <div className="card-header">
              Festivos {anio}
              <span className="badge badge-normal" style={{ fontWeight: 400 }}>{festivos.length} festivos</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Nombre</th>
                    <th>Tipo</th>
                    <th>Día semana</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {festivos.map(f => (
                    <tr key={f.id} className={f.tipo === 'navidad' ? 'row-navidad' : f.tipo === 'local' ? 'row-festivo' : ''}>
                      <td className="font-mono">{f.fecha}</td>
                      <td><strong>{f.nombre}</strong></td>
                      <td><span className={`badge ${tipoColor[f.tipo]}`}>{tipoLabel[f.tipo]}</span></td>
                      <td className="text-sm text-muted">{format(parseISO(f.fecha), 'EEEE', { locale: es })}</td>
                      <td>
                        <div className="flex gap-2">
                          <button className="btn btn-outline btn-sm" onClick={() => abrirEditar(f)}>✏️</button>
                          <button className="btn btn-danger btn-sm" onClick={() => eliminar(f.id)}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {festivos.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--gris-6)' }}>No hay festivos para {anio}</td></tr>
                  )}
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
              <span>{modal === 'nuevo' ? 'Añadir festivo' : 'Editar festivo'}</span>
              <button className="btn btn-outline btn-icon btn-sm" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {msg && <div className={`alert alert-${msg.tipo}`}>{msg.texto}</div>}
              <div className="form-group">
                <label className="form-label">Fecha *</label>
                <input className="form-control" type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input className="form-control" value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Ej: San Juan" />
              </div>
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <select className="form-control" value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
                  <option value="nacional">🇪🇸 Nacional</option>
                  <option value="local">📍 Local (Alicante)</option>
                  <option value="navidad">🎄 Navidad (rueda especial)</option>
                </select>
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
