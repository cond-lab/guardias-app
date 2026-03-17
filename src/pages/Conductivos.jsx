import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { format, parseISO, isWithinInterval, addDays } from 'date-fns'
import { es } from 'date-fns/locale'

function formatFecha(f) { return format(parseISO(f), "d MMM yyyy", { locale: es }) }
function formatDia(f) { return format(parseISO(f), "d 'de' MMMM yyyy", { locale: es }) }

const FORM_VACIO = { servicio_id: '', fecha_inicio: '', fecha_fin: '', notas: '', tecnicos_ids: [] }

export default function Conductivos() {
  const { isAdmin } = useAuth()
  const [conductivos, setConductivos] = useState([])
  const [servicios, setServicios] = useState([])
  const [tecnicos, setTecnicos] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'nuevo' | conductivo
  const [modalServicio, setModalServicio] = useState(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [formServicio, setFormServicio] = useState({ nombre: '', descripcion: '', color: '#2C5282' })
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)
  const [filtroServicio, setFiltroServicio] = useState('todos')
  const [vista, setVista] = useState('lista') // 'lista' | 'calendario'
  const [mesVista, setMesVista] = useState(() => {
    const h = new Date()
    return { anio: h.getFullYear(), mes: h.getMonth() }
  })

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const [{ data: c }, { data: s }, { data: t }] = await Promise.all([
      supabase
        .from('conductivos')
        .select(`
          *,
          servicios(id, nombre, color),
          conductivos_tecnicos(tecnico_id, tecnicos(id, nombre))
        `)
        .order('fecha_inicio', { ascending: false }),
      supabase.from('servicios').select('*').eq('activo', true).order('nombre'),
      supabase.from('tecnicos').select('id, nombre').eq('activo', true).neq('rol', 'admin').order('nombre')
    ])
    setConductivos(c || [])
    setServicios(s || [])
    setTecnicos(t || [])
    setLoading(false)
  }

  function abrirNuevo() {
    setForm(FORM_VACIO)
    setModal('nuevo')
    setMsg(null)
  }

  function abrirEditar(c) {
    setForm({
      servicio_id: c.servicio_id || '',
      fecha_inicio: c.fecha_inicio,
      fecha_fin: c.fecha_fin,
      notas: c.notas || '',
      tecnicos_ids: c.conductivos_tecnicos?.map(ct => ct.tecnico_id) || []
    })
    setModal(c)
    setMsg(null)
  }

  function toggleTecnico(id) {
    setForm(p => ({
      ...p,
      tecnicos_ids: p.tecnicos_ids.includes(id)
        ? p.tecnicos_ids.filter(t => t !== id)
        : [...p.tecnicos_ids, id]
    }))
  }

  async function guardar() {
    if (!form.fecha_inicio || !form.fecha_fin) { setMsg({ tipo: 'danger', texto: 'Las fechas son obligatorias' }); return }
    if (form.fecha_fin < form.fecha_inicio) { setMsg({ tipo: 'danger', texto: 'La fecha fin no puede ser anterior al inicio' }); return }
    setGuardando(true); setMsg(null)
    try {
      let conductivoId

      if (modal === 'nuevo') {
        const { data, error } = await supabase.from('conductivos').insert({
          servicio_id: form.servicio_id || null,
          fecha_inicio: form.fecha_inicio,
          fecha_fin: form.fecha_fin,
          notas: form.notas || null
        }).select().single()
        if (error) throw error
        conductivoId = data.id
      } else {
        const { error } = await supabase.from('conductivos').update({
          servicio_id: form.servicio_id || null,
          fecha_inicio: form.fecha_inicio,
          fecha_fin: form.fecha_fin,
          notas: form.notas || null
        }).eq('id', modal.id)
        if (error) throw error
        conductivoId = modal.id
        // Eliminar asignaciones anteriores
        await supabase.from('conductivos_tecnicos').delete().eq('conductivo_id', conductivoId)
      }

      // Insertar técnicos asignados
      if (form.tecnicos_ids.length > 0) {
        const rows = form.tecnicos_ids.map(tid => ({ conductivo_id: conductivoId, tecnico_id: tid }))
        await supabase.from('conductivos_tecnicos').insert(rows)
      }

      setMsg({ tipo: 'success', texto: modal === 'nuevo' ? 'Conductivo creado' : 'Conductivo actualizado' })
      setTimeout(() => { setModal(null); setMsg(null); cargar() }, 800)
    } catch (err) {
      setMsg({ tipo: 'danger', texto: err.message })
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(id) {
    if (!window.confirm('¿Eliminar este conductivo?')) return
    await supabase.from('conductivos').delete().eq('id', id)
    cargar()
  }

  async function guardarServicio() {
    if (!formServicio.nombre.trim()) { setMsg({ tipo: 'danger', texto: 'El nombre es obligatorio' }); return }
    setGuardando(true)
    try {
      if (modalServicio === 'nuevo') {
        await supabase.from('servicios').insert({ ...formServicio })
      } else {
        await supabase.from('servicios').update({ ...formServicio }).eq('id', modalServicio.id)
      }
      setModalServicio(null)
      cargar()
    } catch (err) {
      setMsg({ tipo: 'danger', texto: err.message })
    } finally {
      setGuardando(false)
    }
  }

  // Filtrar conductivos
  const conductivosFiltrados = conductivos.filter(c =>
    filtroServicio === 'todos' || c.servicio_id === filtroServicio
  )

  // Vista calendario — días del mes
  const diasDelMes = () => {
    const dias = []
    const primer = new Date(mesVista.anio, mesVista.mes, 1)
    const ultimo = new Date(mesVista.anio, mesVista.mes + 1, 0)
    for (let d = new Date(primer); d <= ultimo; d = addDays(d, 1)) {
      dias.push(new Date(d))
    }
    return dias
  }

  function conductivosDia(fecha) {
    return conductivosFiltrados.filter(c => {
      const ini = parseISO(c.fecha_inicio)
      const fin = parseISO(c.fecha_fin)
      return fecha >= ini && fecha <= fin
    })
  }

  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Conductivos</h2>
          <p>Puestas en marcha por servicio</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <button className="btn btn-outline btn-sm" onClick={() => { setModalServicio('nuevo'); setFormServicio({ nombre: '', descripcion: '', color: '#2C5282' }) }}>
                ⚙️ Servicios
              </button>
              <button className="btn btn-primary" onClick={abrirNuevo}>+ Nuevo conductivo</button>
            </>
          )}
        </div>
      </div>

      <div className="page-body">
        {msg && !modal && !modalServicio && <div className={`alert alert-${msg.tipo}`}>{msg.texto}</div>}

        {/* Filtros y vista */}
        <div className="flex gap-2 mb-4" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="flex gap-2">
            <button className={`btn btn-sm ${vista === 'lista' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setVista('lista')}>📋 Lista</button>
            <button className={`btn btn-sm ${vista === 'calendario' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setVista('calendario')}>📅 Calendario</button>
          </div>
          <div style={{ width: 1, background: 'var(--gris-3)', height: 24 }} />
          <select className="form-control" style={{ width: 'auto' }} value={filtroServicio} onChange={e => setFiltroServicio(e.target.value)}>
            <option value="todos">Todos los servicios</option>
            {servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          {vista === 'calendario' && (
            <div className="flex gap-2" style={{ marginLeft: 'auto' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setMesVista(p => {
                const d = new Date(p.anio, p.mes - 1)
                return { anio: d.getFullYear(), mes: d.getMonth() }
              })}>◀</button>
              <span style={{ fontWeight: 600, minWidth: 140, textAlign: 'center', lineHeight: '30px' }}>
                {MESES[mesVista.mes]} {mesVista.anio}
              </span>
              <button className="btn btn-outline btn-sm" onClick={() => setMesVista(p => {
                const d = new Date(p.anio, p.mes + 1)
                return { anio: d.getFullYear(), mes: d.getMonth() }
              })}>▶</button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner" /><span>Cargando...</span></div>
        ) : vista === 'lista' ? (
          // ---- VISTA LISTA ----
          conductivosFiltrados.length === 0 ? (
            <div className="alert alert-info">No hay conductivos{filtroServicio !== 'todos' ? ' para este servicio' : ''}.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {conductivosFiltrados.map(c => {
                const color = c.servicios?.color || '#2C5282'
                const tecnAsig = c.conductivos_tecnicos || []
                return (
                  <div key={c.id} className="card" style={{ borderLeft: `4px solid ${color}` }}>
                    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                          <span style={{
                            background: color, color: 'white',
                            padding: '2px 10px', borderRadius: 99,
                            fontSize: 11, fontWeight: 600
                          }}>
                            {c.servicios?.nombre || 'Sin servicio'}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gris-8)' }}>
                            {formatFecha(c.fecha_inicio)}
                            {c.fecha_inicio !== c.fecha_fin && <> → {formatFecha(c.fecha_fin)}</>}
                          </span>
                        </div>
                        {c.notas && <div style={{ fontSize: 12, color: 'var(--gris-6)', marginBottom: 6 }}>{c.notas}</div>}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {tecnAsig.length === 0
                            ? <span style={{ fontSize: 12, color: 'var(--gris-4)', fontStyle: 'italic' }}>Sin técnicos asignados</span>
                            : tecnAsig.map(ct => (
                              <span key={ct.tecnico_id} style={{
                                background: 'var(--gris-2)', color: 'var(--gris-8)',
                                padding: '2px 8px', borderRadius: 99, fontSize: 12, fontWeight: 500
                              }}>
                                👤 {ct.tecnicos?.nombre}
                              </span>
                            ))
                          }
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-2">
                          <button className="btn btn-outline btn-icon btn-sm" onClick={() => abrirEditar(c)}>✏️</button>
                          <button className="btn btn-danger btn-icon btn-sm" onClick={() => eliminar(c.id)}>🗑</button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : (
          // ---- VISTA CALENDARIO ----
          <div className="card">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '2px solid var(--gris-3)' }}>
              {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => (
                <div key={d} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--gris-6)', textTransform: 'uppercase' }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {(() => {
                const dias = diasDelMes()
                const primerDia = dias[0].getDay() // 0=dom, 1=lun...
                const offset = primerDia === 0 ? 6 : primerDia - 1
                const celdas = []
                // Celdas vacías al inicio
                for (let i = 0; i < offset; i++) {
                  celdas.push(<div key={`empty-${i}`} style={{ minHeight: 80, borderRight: '1px solid var(--gris-2)', borderBottom: '1px solid var(--gris-2)', background: 'var(--gris-1)' }} />)
                }
                dias.forEach(dia => {
                  const cs = conductivosDia(dia)
                  const hoy = new Date()
                  const esHoy = dia.toDateString() === hoy.toDateString()
                  celdas.push(
                    <div key={dia.toISOString()} style={{
                      minHeight: 80, padding: '4px 6px',
                      borderRight: '1px solid var(--gris-2)',
                      borderBottom: '1px solid var(--gris-2)',
                      background: esHoy ? 'var(--azul-claro)' : 'white'
                    }}>
                      <div style={{
                        fontSize: 12, fontWeight: esHoy ? 700 : 400,
                        color: esHoy ? 'var(--azul)' : 'var(--gris-6)',
                        marginBottom: 3
                      }}>{dia.getDate()}</div>
                      {cs.map(c => (
                        <div key={c.id} style={{
                          background: c.servicios?.color || 'var(--azul)',
                          color: 'white', borderRadius: 3,
                          fontSize: 10, padding: '1px 4px',
                          marginBottom: 2, overflow: 'hidden',
                          whiteSpace: 'nowrap', textOverflow: 'ellipsis'
                        }} title={`${c.servicios?.nombre} — ${c.conductivos_tecnicos?.map(ct => ct.tecnicos?.nombre).join(', ')}`}>
                          {c.servicios?.nombre || '—'}
                        </div>
                      ))}
                    </div>
                  )
                })
                return celdas
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Modal conductivo */}
      {modal !== null && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <span>{modal === 'nuevo' ? 'Nuevo conductivo' : 'Editar conductivo'}</span>
              <button className="btn btn-outline btn-icon btn-sm" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {msg && <div className={`alert alert-${msg.tipo}`}>{msg.texto}</div>}
              <div className="form-group">
                <label className="form-label">Servicio</label>
                <select className="form-control" value={form.servicio_id} onChange={e => setForm(p => ({ ...p, servicio_id: e.target.value }))}>
                  <option value="">— Sin servicio —</option>
                  {servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Fecha inicio *</label>
                  <input className="form-control" type="date" value={form.fecha_inicio} onChange={e => setForm(p => ({ ...p, fecha_inicio: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha fin *</label>
                  <input className="form-control" type="date" value={form.fecha_fin} onChange={e => setForm(p => ({ ...p, fecha_fin: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Técnicos asignados</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, maxHeight: 200, overflowY: 'auto', padding: 4 }}>
                  {tecnicos.map(t => (
                    <label key={t.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px', borderRadius: 'var(--radio)',
                      border: `1px solid ${form.tecnicos_ids.includes(t.id) ? 'var(--azul)' : 'var(--gris-3)'}`,
                      background: form.tecnicos_ids.includes(t.id) ? 'var(--azul-claro)' : 'white',
                      cursor: 'pointer', fontSize: 13, userSelect: 'none'
                    }}>
                      <input
                        type="checkbox"
                        checked={form.tecnicos_ids.includes(t.id)}
                        onChange={() => toggleTecnico(t.id)}
                        style={{ accentColor: 'var(--azul)' }}
                      />
                      {t.nombre}
                    </label>
                  ))}
                </div>
                <div className="text-sm text-muted" style={{ marginTop: 4 }}>
                  {form.tecnicos_ids.length} técnico{form.tecnicos_ids.length !== 1 ? 's' : ''} seleccionado{form.tecnicos_ids.length !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notas</label>
                <textarea className="form-control" rows={2} value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} placeholder="Observaciones opcionales..." />
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

      {/* Modal servicios */}
      {modalServicio !== null && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalServicio(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <span>Gestión de servicios</span>
              <button className="btn btn-outline btn-icon btn-sm" onClick={() => setModalServicio(null)}>✕</button>
            </div>
            <div className="modal-body">
              {/* Lista servicios */}
              <div style={{ marginBottom: 16 }}>
                {servicios.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--gris-2)' }}>
                    <span style={{ width: 14, height: 14, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{s.nombre}</span>
                    <button className="btn btn-outline btn-icon btn-sm" onClick={() => {
                      setFormServicio({ nombre: s.nombre, descripcion: s.descripcion || '', color: s.color })
                      setModalServicio(s)
                    }}>✏️</button>
                    <button className="btn btn-danger btn-icon btn-sm" onClick={async () => {
                      if (!window.confirm('¿Eliminar este servicio?')) return
                      await supabase.from('servicios').update({ activo: false }).eq('id', s.id)
                      cargar()
                    }}>🗑</button>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: '2px solid var(--gris-3)', paddingTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--azul)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {modalServicio === 'nuevo' ? 'Nuevo servicio' : 'Editar servicio'}
                </div>
                <div className="form-group">
                  <label className="form-label">Nombre *</label>
                  <input className="form-control" value={formServicio.nombre} onChange={e => setFormServicio(p => ({ ...p, nombre: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Descripción</label>
                  <input className="form-control" value={formServicio.descripcion} onChange={e => setFormServicio(p => ({ ...p, descripcion: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Color</label>
                  <div className="flex gap-2" style={{ alignItems: 'center' }}>
                    <input type="color" value={formServicio.color} onChange={e => setFormServicio(p => ({ ...p, color: e.target.value }))} style={{ width: 40, height: 36, border: '1px solid var(--gris-3)', borderRadius: 'var(--radio)', cursor: 'pointer', padding: 2 }} />
                    <span className="text-sm text-muted">{formServicio.color}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => { setModalServicio('nuevo'); setFormServicio({ nombre: '', descripcion: '', color: '#2C5282' }) }}>+ Nuevo</button>
              <button className="btn btn-primary" onClick={guardarServicio} disabled={guardando}>
                {guardando ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Guardando...</> : 'Guardar servicio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
