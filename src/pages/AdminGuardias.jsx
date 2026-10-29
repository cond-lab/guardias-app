import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useConfirmar } from '../components/Confirmar'
import SelectorAnio, { ANIO_ACTUAL } from '../components/SelectorAnio'
import { getLunesDelAnio, marcarFestivos, asignarGuardias, ultimosDeRueda, calcularSaldoNormal, tecnicoOriginal, puedeHacerGuardias } from '../utils/asignacion'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { TecnicoChip } from '../components/Avatar'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

function formatFecha(f) { return format(parseISO(f), "d MMM yyyy", { locale: es }) }


// Semanas ya asignadas antes de una fecha (de cualquier año), para continuar las ruedas
async function historialAntesDe(fecha) {
  const { data, error } = await supabase
    .from('semanas_guardia')
    .select('lunes_inicio, tipo, tecnico_id, tecnico_original_id, anio')
    .lt('lunes_inicio', fecha)
    .order('lunes_inicio', { ascending: false })
    .limit(70)
  if (error) throw error
  return data || []
}

export default function AdminGuardias() {
  const confirmar = useConfirmar()
  const [anio, setAnio] = useState(ANIO_ACTUAL)
  const [guardias, setGuardias] = useState([])
  const [tecnicos, setTecnicos] = useState([])
  const [estadisticas, setEstadisticas] = useState([])
  const [loading, setLoading] = useState(true)
  const [generando, setGenerando] = useState(false)
  const [recalculando, setRecalculando] = useState(false)
  const [msg, setMsg] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [modalEditar, setModalEditar] = useState(null)
  const [tecnicoEdit, setTecnicoEdit] = useState('')
  const [notasEdit, setNotasEdit] = useState('')
  const [modalGenerar, setModalGenerar] = useState(null)

  useEffect(() => { cargar() }, [anio])

  async function cargar() {
    setLoading(true)
    // Vaciar al cambiar de año para no mostrar un momento los datos del año anterior
    setGuardias([]); setEstadisticas([])
    const [{ data: g, error: errG }, { data: t }] = await Promise.all([
      supabase.from('semanas_guardia').select('*, tecnicos!tecnico_id(nombre)').eq('anio', anio).order('lunes_inicio'),
      supabase.from('tecnicos').select('*').order('orden_rueda_normal')
    ])
    // Si falla la carga no se muestra "sin guardias" (dejaría generar el año otra vez)
    setErrorCarga(errG ? errG.message : null)
    setGuardias(g || [])
    setTecnicos((t || []).filter(x => x.activo))
    if (g?.length) calcularEstadisticas(g, t || [])
    else setEstadisticas([])
    setLoading(false)
  }

  function calcularEstadisticas(gs, ts) {
    // Cuentan las que le tocaron a cada uno; las hechas como reserva van aparte.
    // Los de baja o fuera de guardias salen solo si tienen semanas ese año.
    const tieneSemanas = t => gs.some(g => g.tecnico_id === t.id || tecnicoOriginal(g) === t.id)
    const stats = ts.filter(t => t.rol !== 'admin' && (puedeHacerGuardias(t) || tieneSemanas(t))).map(t => {
      const suyas = gs.filter(g => tecnicoOriginal(g) === t.id)
      return {
        id: t.id,
        nombre: t.nombre,
        estado: !t.activo ? 'Baja' : t.hace_guardias === false ? 'Fuera de guardias' : null,
        normal: suyas.filter(g => g.tipo === 'normal').length,
        festivo: suyas.filter(g => g.tipo === 'festivo').length,
        navidad: suyas.filter(g => g.tipo?.startsWith('navidad')).length,
        total: suyas.length,
        reserva: gs.filter(g => g.tecnico_id === t.id && tecnicoOriginal(g) !== t.id).length,
      }
    })
    setEstadisticas(stats.sort((a, b) => !!a.estado - !!b.estado || b.total - a.total))
  }

  async function generarGuardias() {
    setGenerando(true); setMsg(null)
    try {
      const { count, error: errC } = await supabase.from('semanas_guardia').select('id', { count: 'exact', head: true }).eq('anio', anio)
      if (errC) throw errC
      if (count > 0) throw new Error(`${anio} ya tiene ${count} semanas generadas. Recarga la página.`)

      let semanas = getLunesDelAnio(anio)
      const desde = semanas[0].lunes_inicio
      const hasta = semanas[semanas.length - 1].lunes_fin

      // Festivos por fecha (no por la columna anio: Reyes del año siguiente suele estar guardado en el anterior)
      const { data: festivosDB, error: errF } = await supabase.from('festivos').select('*').gte('fecha', desde).lt('fecha', hasta)
      if (errF) throw errF
      // Todos los técnicos (también inactivos) para situar a los últimos de cada rueda
      const { data: tecnicosDB, error: errT } = await supabase.from('tecnicos').select('*')
      if (errT) throw errT
      if (!tecnicosDB?.some(t => t.activo && t.rol !== 'admin' && t.hace_guardias !== false)) throw new Error('No hay técnicos activos')

      const historial = await historialAntesDe(desde)
      const ultimos = ultimosDeRueda(historial)
      const saldo = calcularSaldoNormal(historial.filter(s => s.anio === anio - 1), tecnicosDB)

      // La compensación calculada se puede ajustar a mano antes de generar
      // (extra > 0: semanas normales de más; extra < 0: turnos que se salta)
      const filas = tecnicosDB.filter(puedeHacerGuardias)
        .sort((a, b) => (a.orden_rueda_normal ?? 0) - (b.orden_rueda_normal ?? 0) || a.nombre.localeCompare(b.nombre))
        .map(t => ({ id: t.id, nombre: t.nombre, calculado: -(saldo[t.id] || 0), extra: -(saldo[t.id] || 0) }))
      setModalGenerar({ anio, semanas, festivosDB: festivosDB || [], tecnicosDB, ultimos, filas })
    } catch (err) {
      setMsg({ tipo: 'danger', texto: err.message })
    } finally {
      setGenerando(false)
    }
  }

  async function confirmarGeneracion() {
    const { anio, festivosDB, tecnicosDB, ultimos, filas } = modalGenerar
    setGenerando(true); setMsg(null)
    try {
      const saldoNormal = Object.fromEntries(filas.filter(f => f.extra).map(f => [f.id, -f.extra]))
      const semanas = marcarFestivos(getLunesDelAnio(anio), festivosDB)
      const { semanas: asignadas } = asignarGuardias(semanas, tecnicosDB, { ultimos, saldoNormal })

      const rows = asignadas.map(s => ({
        lunes_inicio: s.lunes_inicio,
        lunes_fin: s.lunes_fin,
        tecnico_id: s.tecnico_asignado?.id || null,
        tecnico_original_id: s.tecnico_asignado?.id || null,
        tipo: s.tipo || 'normal',
        estado: 'pendiente',
        anio: s.anio,
        semana_iso: s.semana_iso,
        tiene_festivo: s.tiene_festivo || false,
        festivo_nombre: s.festivos_en_semana?.join(', ') || null,
      }))

      const { count, error: errC } = await supabase.from('semanas_guardia').select('id', { count: 'exact', head: true }).eq('anio', anio)
      if (errC) throw errC
      if (count > 0) throw new Error(`${anio} ya tiene ${count} semanas generadas. Recarga la página.`)

      const { error } = await supabase.from('semanas_guardia').insert(rows)
      if (error) throw error
      setModalGenerar(null)
      setMsg({ tipo: 'success', texto: `✓ ${rows.length} semanas generadas para ${anio}` })
      cargar()
    } catch (err) {
      setMsg({ tipo: 'danger', texto: err.message })
    } finally {
      setGenerando(false)
    }
  }

  async function eliminarAnio() {
    if (!(await confirmar(`Se borrarán TODAS las guardias de ${anio}. Esta acción no se puede deshacer.`, { titulo: `Eliminar ${anio}`, boton: `Eliminar ${anio}`, peligro: true }))) return
    await supabase.from('semanas_guardia').delete().eq('anio', anio)
    setMsg({ tipo: 'warning', texto: `Guardias de ${anio} eliminadas` })
    cargar()
  }

  async function guardarEdicion() {
    const { error } = await supabase
      .from('semanas_guardia')
      // Cambio a mano del admin = reasignación: cuenta para el nuevo técnico
      .update({ tecnico_id: tecnicoEdit || null, tecnico_original_id: tecnicoEdit || null, notas: notasEdit, estado: 'modificada' })
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
   * 2. Cada rueda (normal/festivo) continúa tras el último que la tuvo
   *    hasta esa semana, incluida (también del año anterior)
   * 3. Recalculamos y actualizamos en BD solo las semanas posteriores
   */
  async function recalcularDesde(semanaEditada) {
    if (!(await confirmar(
      `¿Recalcular todas las semanas siguientes a partir del ${formatFecha(semanaEditada.lunes_fin)}?\n\nEsto reasignará automáticamente todas las semanas posteriores respetando la rueda.`,
      { titulo: 'Recalcular semanas', boton: 'Recalcular' }
    ))) return

    setRecalculando(true); setMsg(null)
    try {
      const { data: tecnicosDB } = await supabase.from('tecnicos').select('*')

      // Todas las semanas del año ordenadas
      const { data: todasSemanas } = await supabase
        .from('semanas_guardia')
        .select('*, tecnicos!tecnico_id(nombre)')
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

      if (!tecnicosDB?.some(t => t.activo && t.rol !== 'admin' && t.hace_guardias !== false)) throw new Error('No hay técnicos activos')

      // Las ruedas continúan tras el último de cada una hasta la semana editada (incluida)
      const historial = [...await historialAntesDe(todasSemanas[0].lunes_inicio), ...semanasAnteriores]
      const ultimos = ultimosDeRueda(historial)

      // Navidad no se toca (va fija, para que nadie quede pegado a ella);
      // el resto se reasigna con el mismo motor que al generar
      const aRecalcular = semanasASiguientes.map(s => ({
        ...s,
        es_navidad: false,
        tecnico_fijo: s.tipo?.startsWith('navidad') ? (s.tecnico_id || 'sin-asignar') : null,
      }))
      const { semanas: asignadas } = asignarGuardias(aRecalcular, tecnicosDB, { ultimos })

      const updates = asignadas
        .filter(s => !s.tecnico_fijo)
        .map(s => ({ id: s.id, tecnico_id: s.tecnico_asignado?.id || null }))
      for (const u of updates) {
        const { error } = await supabase
          .from('semanas_guardia')
          .update({ tecnico_id: u.tecnico_id, tecnico_original_id: u.tecnico_id, estado: 'pendiente' })
          .eq('id', u.id)
        if (error) throw error
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
    navidad_reyes: '👑 Reyes',
    navidad_anionuevo: '🥂 Año Nuevo'
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Gestión de Rueda</h2>
          <p>Generación y administración de guardias</p>
        </div>
        <div className="flex gap-2">
          <SelectorAnio value={anio} onChange={setAnio} />
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
            <button className="btn btn-primary" onClick={generarGuardias} disabled={generando || loading || !!errorCarga || guardias.length > 0}>
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
            <div className="card-header">
              <div>
                Distribución por técnico
                <div className="text-sm text-muted" style={{ fontWeight: 500, marginTop: 2 }}>
                  Cuentan las guardias que le tocaron; las hechas por otro como reserva van aparte
                </div>
              </div>
              <div className="reparto-leyenda">
                <span><i style={{ background: 'var(--normal)' }} />Normal</span>
                <span><i style={{ background: 'var(--festivo)' }} />Festivo</span>
                <span><i style={{ background: 'var(--navidad)' }} />Navidad</span>
                <span><i style={{ background: 'var(--reserva)' }} />Reserva</span>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Técnico</th>
                    <th>Normales</th>
                    <th>Festivos</th>
                    <th>Navidad</th>
                    <th>Total</th>
                    <th>Hechas como reserva</th>
                    <th>Distribución</th>
                  </tr>
                </thead>
                <tbody>
                  {estadisticas.map(s => {
                    // Barras apiladas en la misma escala para todos: normal, festivo, Navidad y reserva
                    const maxTotal = Math.max(...estadisticas.map(x => x.total + x.reserva), 1)
                    const ancho = n => `${(n / maxTotal) * 100}%`
                    return (
                      <tr key={s.id} style={s.estado ? { opacity: 0.6 } : undefined}>
                        <td>
                          <TecnicoChip id={s.id} nombre={s.nombre}>
                            {s.estado && <span className="badge badge-rechazada">{s.estado}</span>}
                          </TecnicoChip>
                        </td>
                        <td className="font-mono">{s.normal}</td>
                        <td className="font-mono">{s.festivo}</td>
                        <td className="font-mono">{s.navidad}</td>
                        <td className="font-mono"><strong>{s.total}</strong></td>
                        <td className="font-mono text-muted">{s.reserva}</td>
                        <td style={{ width: 220 }}>
                          <div className="reparto-barra" title={`${s.normal} normales · ${s.festivo} festivos · ${s.navidad} Navidad · ${s.reserva} como reserva`}>
                            <span style={{ width: ancho(s.normal), background: 'var(--normal)' }} />
                            <span style={{ width: ancho(s.festivo), background: 'var(--festivo)' }} />
                            <span style={{ width: ancho(s.navidad), background: 'var(--navidad)' }} />
                            <span style={{ width: ancho(s.reserva), background: 'var(--reserva)' }} />
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
        ) : errorCarga ? (
          <div className="alert alert-danger">No se han podido cargar las guardias de {anio}: {errorCarga}</div>
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
                      <td><strong><TecnicoChip id={g.tecnico_id} nombre={g.tecnicos?.nombre} size={24} /></strong></td>
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

      {/* Modal generar año */}
      {modalGenerar && (() => {
        const nombre = id => modalGenerar.tecnicosDB.find(t => t.id === id)?.nombre || '—'
        const cambiar = (id, extra) => setModalGenerar(m => ({ ...m, filas: m.filas.map(f => f.id === id ? { ...f, extra } : f) }))
        return (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !generando && setModalGenerar(null)}>
            <div className="modal" style={{ maxWidth: 560 }}>
              <div className="modal-header">
                <span>Generar guardias {modalGenerar.anio}</span>
                <button className="btn btn-outline btn-icon btn-sm" onClick={() => setModalGenerar(null)} disabled={generando}>✕</button>
              </div>
              <div className="modal-body">
                <div className="alert alert-info mb-3">
                  Se crearán todas las semanas de {modalGenerar.anio}. Las ruedas continúan tras:
                  <strong> Normal</strong> {nombre(modalGenerar.ultimos.normal)} ·
                  <strong> Festivo</strong> {nombre(modalGenerar.ultimos.festivo)} ·
                  <strong> Navidad</strong> {nombre(modalGenerar.ultimos.navidad)}
                </div>
                <div className="form-label">Compensación de guardias normales de {modalGenerar.anio - 1}</div>
                <div className="text-sm text-muted mb-3">
                  <strong>+1</strong> = una semana normal más al principio del año · <strong>−1</strong> = se salta un turno · <strong>0</strong> = nada.
                  Viene calculado según las que le tocaron en {modalGenerar.anio - 1}; puedes cambiarlo.
                </div>
                <div className="table-wrap mb-3">
                  <table>
                    <thead><tr><th>Técnico</th><th>Calculado</th><th>Aplicar</th></tr></thead>
                    <tbody>
                      {modalGenerar.filas.map(f => (
                        <tr key={f.id}>
                          <td><strong><TecnicoChip id={f.id} nombre={f.nombre} size={24} /></strong></td>
                          <td className="font-mono text-muted">{f.calculado > 0 ? `+${f.calculado}` : f.calculado < 0 ? `−${-f.calculado}` : '0'}</td>
                          <td>
                            <div className="flex gap-2" style={{ alignItems: 'center' }}>
                              <button type="button" className="btn btn-outline btn-icon btn-sm" aria-label={`Restar a ${f.nombre}`} onClick={() => cambiar(f.id, Math.max(-5, f.extra - 1))}>−</button>
                              <span className="font-mono" style={{ minWidth: 28, textAlign: 'center', fontWeight: 600, color: f.extra > 0 ? 'var(--ok)' : f.extra < 0 ? 'var(--festivo)' : 'var(--texto-2)' }}>
                                {f.extra > 0 ? `+${f.extra}` : f.extra < 0 ? `−${-f.extra}` : '0'}
                              </span>
                              <button type="button" className="btn btn-outline btn-icon btn-sm" aria-label={`Sumar a ${f.nombre}`} onClick={() => cambiar(f.id, Math.min(5, f.extra + 1))}>+</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline" onClick={() => setModalGenerar(null)} disabled={generando}>Cancelar</button>
                <button className="btn btn-primary" onClick={confirmarGeneracion} disabled={generando}>
                  {generando ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Generando...</> : `⚡ Generar ${modalGenerar.anio}`}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

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
