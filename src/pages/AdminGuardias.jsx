import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { getLunesDelAnio, marcarFestivos, asignarGuardias } from '../utils/asignacion'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

function formatFecha(f) { return format(parseISO(f), "d MMM yyyy", { locale: es }) }

export default function AdminGuardias() {
  const [anio, setAnio] = useState(2026)
  const [guardias, setGuardias] = useState([])
  const [tecnicos, setTecnicos] = useState([])
  const [estadisticas, setEstadisticas] = useState([])
  const [loading, setLoading] = useState(true)
  const [generando, setGenerando] = useState(false)
  const [recalculando, setRecalculando] = useState(false)
  const [msg, setMsg] = useState(null)
  const [modalEditar, setModalEditar] = useState(null)
  const [tecnicoEdit, setTecnicoEdit] = useState('')
  const [notasEdit, setNotasEdit] = useState('')

  useEffect(() => { cargar() }, [anio])

  async function cargar() {
    setLoading(true)
    const [{ data: g }, { data: t }] = await Promise.all([
      supabase.from('semanas_guardia').select('*, tecnicos(nombre)').eq('anio', anio).order('lunes_inicio'),
      supabase.from('tecnicos').select('*').eq('activo', true).order('orden_rueda_normal')
    ])
    setGuardias(g || [])
    setTecnicos(t || [])
    if (g?.length) calcularEstadisticas(g, t || [])
    setLoading(false)
  }

  function calcularEstadisticas(gs, ts) {
    const stats = ts.filter(t => t.rol !== 'admin').map(t => ({
      nombre: t.nombre,
      normal: gs.filter(g => g.tecnico_id === t.id && g.tipo === 'normal').length,
      festivo: gs.filter(g => g.tecnico_id === t.id && g.tipo === 'festivo').length,
      navidad: gs.filter(g => g.tecnico_id === t.id && g.tipo?.startsWith('navidad')).length,
      total: gs.filter(g => g.tecnico_id === t.id).length,
    }))
    setEstadisticas(stats.sort((a, b) => b.total - a.total))
  }

  async function generarGuardias() {
    if (!window.confirm(`¿Generar guardias para ${anio}? Se crearán todas las semanas del año.`)) return
    setGenerando(true); setMsg(null)
    try {
      const { data: festivosDB } = await supabase.from('festivos').select('*').eq('anio', anio)
      const { data: tecnicosDB } = await supabase.from('tecnicos').select('*').eq('activo', true).order('orden_rueda_normal')
      if (!tecnicosDB?.filter(t => t.rol !== 'admin').length) throw new Error('No hay técnicos activos')

      let semanas = getLunesDelAnio(anio)
      semanas = marcarFestivos(semanas, festivosDB || [])
      const { semanas: asignadas } = asignarGuardias(semanas, tecnicosDB)

      const rows = asignadas.map(s => ({
        lunes_inicio: s.lunes_inicio,
        lunes_fin: s.lunes_fin,
        tecnico_id: s.tecnico_asignado?.id || null,
        tipo: s.tipo || 'normal',
        estado: 'pendiente',
        anio: s.anio,
        semana_iso: s.semana_iso,
        tiene_festivo: s.tiene_festivo || false,
        festivo_nombre: s.festivos_en_semana?.join(', ') || null,
      }))

      const { error } = await supabase.from('semanas_guardia').insert(rows)
      if (error) throw error
      setMsg({ tipo: 'success', texto: `✓ ${rows.length} semanas generadas para ${anio}` })
      cargar()
    } catch (err) {
      setMsg({ tipo: 'danger', texto: err.message })
    } finally {
      setGenerando(false)
    }
  }

  async function eliminarAnio() {
    if (!window.confirm(`¿Eliminar TODAS las guardias de ${anio}? Esta acción no se puede deshacer.`)) return
    await supabase.from('semanas_guardia').delete().eq('anio', anio)
    setMsg({ tipo: 'warning', texto: `Guardias de ${anio} eliminadas` })
    cargar()
  }

  async function guardarEdicion() {
    const { error } = await supabase
      .from('semanas_guardia')
      .update({ tecnico_id: tecnicoEdit || null, notas: notasEdit, estado: 'modificada' })
      .eq('id', modalEditar.id)
    if (error) { setMsg({ tipo: 'danger', texto: error.message }); return }
    setModalEditar(null)
    cargar()
  }

  /**
   * Recalcula todas las semanas SIGUIENTES a la semana editada.
   * 
   * Lógica:
   * 1. La semana editada se respeta tal cual (tecnico_id actual)
   * 2. Determinamos en qué posición de la rueda queda ese técnico
   *    (el siguiente en la rueda normal/festivo parte desde él)
   * 3. Recalculamos y actualizamos en BD solo las semanas posteriores
   */
  async function recalcularDesde(semanaEditada) {
    if (!window.confirm(
      `¿Recalcular todas las semanas siguientes a partir del ${formatFecha(semanaEditada.lunes_fin)}?\n\nEsto reasignará automáticamente todas las semanas posteriores respetando la rueda.`
    )) return

    setRecalculando(true); setMsg(null)
    try {
      const { data: festivosDB } = await supabase.from('festivos').select('*').eq('anio', anio)
      const { data: tecnicosDB } = await supabase.from('tecnicos').select('*').eq('activo', true)

      // Todas las semanas del año ordenadas
      const { data: todasSemanas } = await supabase
        .from('semanas_guardia')
        .select('*, tecnicos(nombre)')
        .eq('anio', anio)
        .order('lunes_inicio')

      if (!todasSemanas?.length) throw new Error('No hay semanas generadas')

      // Separar: semanas hasta la editada (inclusive) y semanas siguientes
      const idxEditada = todasSemanas.findIndex(s => s.id === semanaEditada.id)
      if (idxEditada < 0) throw new Error('No se encontró la semana editada')

      const semanasAnteriores = todasSemanas.slice(0, idxEditada + 1) // incluye la editada
      const semanasASiguientes = todasSemanas.slice(idxEditada + 1)   // las que recalculamos

      if (!semanasASiguientes.length) {
        setMsg({ tipo: 'warning', texto: 'Esta es la última semana del año, no hay nada que recalcular.' })
        setRecalculando(false)
        return
      }

      // Calcular punteros de rueda normal y festivo contando las semanas anteriores
      const activos = tecnicosDB
        .filter(t => t.activo && t.rol !== 'admin')
        .sort((a, b) => a.orden_rueda_normal - b.orden_rueda_normal)
      const activosFestivo = tecnicosDB
        .filter(t => t.activo && t.rol !== 'admin')
        .sort((a, b) => (a.orden_rueda_festivo ?? a.orden_rueda_normal) - (b.orden_rueda_festivo ?? b.orden_rueda_normal))

      if (!activos.length) throw new Error('No hay técnicos activos')

      const n = activos.length
      const nF = activosFestivo.length

      // Contar cuántas normales y cuántas festivos hay en las semanas anteriores (incluida la editada)
      // para saber en qué posición de la rueda estamos
      let cuentaNormal = 0
      let cuentaFestivo = 0
      for (const s of semanasAnteriores) {
        if (s.tipo === 'normal') cuentaNormal++
        else if (s.tipo === 'festivo') cuentaFestivo++
        // navidad no consume rueda normal ni festivo
      }

      // El técnico asignado en la semana editada ya fue contado arriba.
      // El siguiente puntero parte desde cuentaNormal y cuentaFestivo.
      let idxNormal = cuentaNormal
      let idxFestivo = cuentaFestivo

      // Recalcular las semanas siguientes
      const updates = []
      for (const semana of semanasASiguientes) {
        if (semana.tipo?.startsWith('navidad')) {
          // Navidad no se toca
          continue
        }

        let tecnicoId
        if (semana.tiene_festivo) {
          tecnicoId = activosFestivo[idxFestivo % nF]?.id || null
          idxFestivo++
        } else {
          tecnicoId = activos[idxNormal % n]?.id || null
          idxNormal++
        }

        updates.push({ id: semana.id, tecnico_id: tecnicoId, estado: 'pendiente' })
      }

      // Actualizar en BD en lotes
      for (const u of updates) {
        await supabase
          .from('semanas_guardia')
          .update({ tecnico_id: u.tecnico_id, estado: u.estado })
          .eq('id', u.id)
      }

      setMsg({ tipo: 'success', texto: `✓ ${updates.length} semanas recalculadas correctamente` })
      cargar()
    } catch (err) {
      setMsg({ tipo: 'danger', texto: err.message })
    } finally {
      setRecalculando(false)
    }
  }

  function exportarExcel() {
    const data = guardias.map((g, i) => ({
      '#': i + 1,
      'Inicio': formatFecha(g.lunes_inicio),
      'Fin': formatFecha(g.lunes_fin),
      'Técnico': g.tecnicos?.nombre || 'Sin asignar',
      'Tipo': g.tipo,
      'Festivo': g.festivo_nombre || '',
      'Estado': g.estado,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `Guardias ${anio}`)
    XLSX.writeFile(wb, `guardias_${anio}.xlsx`)
  }

  function exportarPDF() {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text(`Rueda de Guardias ${anio}`, 14, 16)
    doc.setFontSize(9)
    doc.setTextColor(120)
    doc.text(`Generado el ${format(new Date(), "d 'de' MMMM yyyy", { locale: es })}`, 14, 23)
    autoTable(doc, {
      startY: 28,
      head: [['#', 'Inicio', 'Fin', 'Técnico', 'Tipo', 'Festivo']],
      body: guardias.map((g, i) => [
        i + 1,
        formatFecha(g.lunes_inicio),
        formatFecha(g.lunes_fin),
        g.tecnicos?.nombre || 'Sin asignar',
        g.tipo,
        g.festivo_nombre || ''
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [27, 58, 107] },
      didParseCell: (data) => {
        const tipo = guardias[data.row.index]?.tipo
        if (tipo === 'festivo') data.cell.styles.fillColor = [255, 251, 235]
        if (tipo?.startsWith('navidad')) data.cell.styles.fillColor = [240, 255, 244]
      }
    })
    doc.save(`guardias_${anio}.pdf`)
  }

  const tipoLabel = {
    normal: 'Normal',
    festivo: '🏖 Festivo',
    navidad_nochebuena: '🎄 Nochebuena',
    navidad_navidad: '🎅 Navidad',
    navidad_reyes: '👑 Reyes'
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Gestión de Rueda</h2>
          <p>Generación y administración de guardias</p>
        </div>
        <div className="flex gap-2">
          <select className="form-control" style={{ width: 'auto' }} value={anio} onChange={e => setAnio(+e.target.value)}>
            {[2025, 2026, 2027].map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div className="page-body">
        {msg && <div className={`alert alert-${msg.tipo}`}>{msg.texto}</div>}
        {recalculando && (
          <div className="alert alert-info">
            <span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />
            Recalculando semanas... un momento.
          </div>
        )}

        {/* Acciones */}
        <div className="card mb-4">
          <div className="card-header">Acciones</div>
          <div className="card-body flex gap-2" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={generarGuardias} disabled={generando || guardias.length > 0}>
              {generando ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Generando...</> : '⚡ Generar guardias'}
            </button>
            {guardias.length > 0 && (
              <>
                <button className="btn btn-outline" onClick={exportarExcel}>📊 Exportar Excel</button>
                <button className="btn btn-outline" onClick={exportarPDF}>📄 Exportar PDF</button>
                <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={eliminarAnio}>🗑 Eliminar año</button>
              </>
            )}
          </div>
          {guardias.length > 0 && (
            <div className="card-body" style={{ borderTop: '1px solid var(--gris-3)', paddingTop: 12 }}>
              <span className="text-sm text-muted">✓ {guardias.length} semanas generadas para {anio}. Para regenerar desde cero, elimina primero el año.</span>
            </div>
          )}
        </div>

        {/* Estadísticas */}
        {estadisticas.length > 0 && (
          <div className="card mb-4">
            <div className="card-header">Distribución por técnico</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Técnico</th>
                    <th>Normales</th>
                    <th>Festivos</th>
                    <th>Navidad</th>
                    <th>Total</th>
                    <th>Distribución</th>
                  </tr>
                </thead>
                <tbody>
                  {estadisticas.map(s => {
                    const maxTotal = Math.max(...estadisticas.map(x => x.total))
                    const pct = maxTotal ? Math.round((s.total / maxTotal) * 100) : 0
                    return (
                      <tr key={s.nombre}>
                        <td><strong>{s.nombre}</strong></td>
                        <td className="font-mono">{s.normal}</td>
                        <td className="font-mono">{s.festivo}</td>
                        <td className="font-mono">{s.navidad}</td>
                        <td className="font-mono"><strong>{s.total}</strong></td>
                        <td style={{ width: 160 }}>
                          <div style={{ background: 'var(--gris-2)', borderRadius: 4, height: 8 }}>
                            <div style={{ background: 'var(--azul)', width: `${pct}%`, height: 8, borderRadius: 4 }} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tabla completa */}
        {loading ? (
          <div className="loading-center"><div className="spinner" /><span>Cargando guardias...</span></div>
        ) : guardias.length === 0 ? (
          <div className="alert alert-info">No hay guardias para {anio}. Usa el botón "Generar guardias" para crear la rueda del año.</div>
        ) : (
          <div className="card">
            <div className="card-header">
              Todas las semanas — {anio}
              <span className="text-sm text-muted" style={{ fontWeight: 400 }}>
                Edita un técnico y usa ↺ para recalcular el resto del año desde esa semana
              </span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Inicio</th>
                    <th>Fin</th>
                    <th>Técnico</th>
                    <th>Tipo</th>
                    <th>Festivo</th>
                    <th>Estado</th>
                    <th>Editar</th>
                    <th>Recalcular</th>
                  </tr>
                </thead>
                <tbody>
                  {guardias.map((g, i) => (
                    <tr key={g.id} className={g.tipo === 'festivo' ? 'row-festivo' : g.tipo?.startsWith('navidad') ? 'row-navidad' : ''}>
                      <td className="font-mono text-muted text-sm">{i + 1}</td>
                      <td className="text-sm">{formatFecha(g.lunes_inicio)}</td>
                      <td className="text-sm">{formatFecha(g.lunes_fin)}</td>
                      <td><strong>{g.tecnicos?.nombre || <span className="text-muted">Sin asignar</span>}</strong></td>
                      <td>{tipoLabel[g.tipo] || g.tipo}</td>
                      <td className="text-sm text-muted">{g.festivo_nombre || '—'}</td>
                      <td>
                        <span className={`badge ${g.estado === 'modificada' ? 'badge-pendiente' : 'badge-normal'}`}>{g.estado}</span>
                      </td>
                      <td>
                        <button
                          className="btn btn-outline btn-icon btn-sm"
                          title="Editar técnico"
                          onClick={() => { setModalEditar(g); setTecnicoEdit(g.tecnico_id || ''); setNotasEdit(g.notas || '') }}
                        >✏️</button>
                      </td>
                      <td>
                        {/* Solo mostrar recalcular si no es la última semana y no es navidad */}
                        {!g.tipo?.startsWith('navidad') && i < guardias.length - 1 && (
                          <button
                            className="btn btn-warning btn-icon btn-sm"
                            title="Recalcular semanas siguientes desde aquí"
                            disabled={recalculando}
                            onClick={() => recalcularDesde(g)}
                          >↺</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal editar guardia */}
      {modalEditar && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalEditar(null)}>
          <div className="modal">
            <div className="modal-header">
              <span>Editar guardia</span>
              <button className="btn btn-outline btn-icon btn-sm" onClick={() => setModalEditar(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="alert alert-info mb-3">
                <strong>Semana:</strong> {formatFecha(modalEditar.lunes_inicio)} → {formatFecha(modalEditar.lunes_fin)}
              </div>
              <div className="alert alert-warning mb-3" style={{ fontSize: 12 }}>
                Tras guardar, usa el botón <strong>↺</strong> en esa fila para recalcular el resto del año desde esta semana.
              </div>
              <div className="form-group">
                <label className="form-label">Técnico asignado</label>
                <select className="form-control" value={tecnicoEdit} onChange={e => setTecnicoEdit(e.target.value)}>
                  <option value="">— Sin asignar —</option>
                  {tecnicos.filter(t => t.rol !== 'admin').map(t => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Notas</label>
                <textarea className="form-control" rows={2} value={notasEdit} onChange={e => setNotasEdit(e.target.value)} placeholder="Notas opcionales..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModalEditar(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarEdicion}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
