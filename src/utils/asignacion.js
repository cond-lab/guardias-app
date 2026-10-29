import { addDays, getISOWeek, getYear, format, parseISO } from 'date-fns'

export function getLunesDelAnio(anio) {
  const semanas = []
  let d = new Date(anio, 0, 1)
  while (d.getDay() !== 1) d = addDays(d, 1)
  while (true) {
    const lunes = new Date(d)
    const lunesFin = addDays(lunes, 7)
    const anioSemana = getYear(lunes)
    if (anioSemana > anio) break
    semanas.push({
      lunes_inicio: format(lunes, 'yyyy-MM-dd'),
      lunes_fin: format(lunesFin, 'yyyy-MM-dd'),
      semana_iso: getISOWeek(lunes),
      anio: anioSemana,
      tiene_festivo: false,
      festivos_en_semana: [],
      es_navidad: false,
      tipo_navidad: null,
    })
    d = addDays(d, 7)
  }
  return semanas
}

export function marcarFestivos(semanas, festivos) {
  for (const semana of semanas) {
    const inicio = parseISO(semana.lunes_inicio)
    const fin = parseISO(semana.lunes_fin)
    for (const f of festivos) {
      const fechaF = parseISO(f.fecha)
      if (fechaF >= inicio && fechaF < fin) {
        if (f.tipo === 'navidad') {
          semana.es_navidad = true
          semana.festivos_en_semana.push(f.nombre)
          const mes = fechaF.getMonth() + 1
          const dia = fechaF.getDate()
          if (mes === 12 && dia === 24) semana.tipo_navidad = 'navidad_nochebuena'
          else if (mes === 1 && dia === 6) semana.tipo_navidad = 'navidad_reyes'
          else if ((mes === 12 && dia === 31) || (mes === 1 && dia === 1)) semana.tipo_navidad = 'navidad_anionuevo'
          else semana.tipo_navidad = 'navidad_navidad'
        } else {
          semana.tiene_festivo = true
          semana.festivos_en_semana.push(f.nombre)
        }
      }
    }
  }
  return semanas
}

// A quién le tocó la semana (no quién la hizo como reserva)
export const tecnicoOriginal = s => s.tecnico_original_id || s.tecnico_id

const esNavidad = tipo => tipo?.startsWith('navidad')

/**
 * Rueda que continúa tras `ultimoId` en el orden de `campo`.
 * Se ordena con todos los técnicos (también inactivos) para poder situar
 * al último aunque ya no esté, y solo devuelve los que pueden hacer guardias.
 */
function crearRueda(tecnicos, campo, ultimoId) {
  const orden = t => t[campo] ?? t.orden_rueda_normal ?? 0
  const todos = tecnicos
    .filter(t => t.rol !== 'admin')
    .sort((a, b) => orden(a) - orden(b) || a.nombre.localeCompare(b.nombre))
  let pos = todos.findIndex(t => t.id === ultimoId)
  const elegibles = todos.filter(puedeHacerGuardias).length
  // Los que no pudieron coger su turno por tener guardia la semana de al lado:
  // cogen el siguiente turno de esta rueda, no lo pierden
  const aplazados = []
  return {
    elegibles,
    siguiente() {
      if (!elegibles) return null
      do { pos = (pos + 1) % todos.length } while (!puedeHacerGuardias(todos[pos]))
      return todos[pos]
    },
    // `evitar`: ids con guardia la semana anterior o la siguiente
    // `saltar(t)`: true si a t le toca saltarse este turno (compensación)
    elegir(evitar, saltar = () => false) {
      if (!elegibles) return null
      const i = aplazados.findIndex(t => !evitar.has(t.id))
      if (i >= 0) return aplazados.splice(i, 1)[0]
      for (let intentos = 0; intentos < todos.length * 3; intentos++) {
        const t = this.siguiente()
        if (saltar(t)) continue
        if (evitar.has(t.id) && elegibles > evitar.size) { aplazados.push(t); continue }
        return t
      }
      return aplazados.shift() || this.siguiente()
    }
  }
}

/**
 * Lee el historial ya asignado (semanas anteriores, de cualquier año) para que
 * las ruedas continúen donde se quedaron en vez de empezar siempre por el primero.
 */
export function ultimosDeRueda(historial) {
  const ordenadas = [...historial].sort((a, b) => a.lunes_inicio.localeCompare(b.lunes_inicio))
  const ultimo = filtro => tecnicoOriginal([...ordenadas].reverse().find(filtro) || {}) || null
  return {
    normal: ultimo(s => s.tipo === 'normal'),
    festivo: ultimo(s => s.tipo === 'festivo'),
    navidad: ultimo(s => esNavidad(s.tipo)),
    // Quién hace la última semana (para no darle también la siguiente)
    semana: ordenadas.at(-1)?.tecnico_id || null,
  }
}

/**
 * Compensación de guardias normales del año anterior (solo las que le tocaron).
 * La referencia es el número más repetido entre los técnicos de la rueda:
 * saldo < 0 → le faltan (se le dan primero), saldo > 0 → le sobran (se salta su turno).
 * Quien no tuvo ninguna (entró nuevo o no estaba) no se compensa.
 */
export function calcularSaldoNormal(semanasAnioAnterior, tecnicos) {
  const cuenta = {}
  tecnicos.filter(puedeHacerGuardias).forEach(t => { cuenta[t.id] = 0 })
  for (const s of semanasAnioAnterior) {
    const id = tecnicoOriginal(s)
    if (s.tipo === 'normal' && id in cuenta) cuenta[id]++
  }
  const valores = Object.values(cuenta).filter(v => v > 0)
  if (!valores.length) return {}
  const frecuencia = {}
  valores.forEach(v => { frecuencia[v] = (frecuencia[v] || 0) + 1 })
  const maxFrec = Math.max(...Object.values(frecuencia))
  const referencia = Math.min(...Object.keys(frecuencia).filter(v => frecuencia[v] === maxFrec).map(Number))
  const saldo = {}
  for (const [id, v] of Object.entries(cuenta)) {
    if (v > 0 && v !== referencia) saldo[id] = v - referencia
  }
  return saldo
}

/**
 * Asigna técnicos a las semanas.
 * Rueda normal, festivo y navidad son INDEPENDIENTES y continúan tras el último
 * que hizo cada una (`ultimos`). `saldoNormal` compensa el año anterior.
 * Nadie hace dos semanas seguidas: si le toca, se aplaza a su siguiente turno
 * de esa rueda y entra el siguiente.
 * Las semanas con `tecnico_fijo` no se tocan (p. ej. Navidad al recalcular).
 */
export function asignarGuardias(semanas, tecnicos, { ultimos = {}, saldoNormal = {} } = {}) {
  if (!tecnicos.some(puedeHacerGuardias)) return { semanas, estadisticas: {} }

  const ruedaNormal = crearRueda(tecnicos, 'orden_rueda_normal', ultimos.normal)
  const ruedaFestivo = crearRueda(tecnicos, 'orden_rueda_festivo', ultimos.festivo)
  const ruedaNavidad = crearRueda(tecnicos, 'orden_rueda_navidad', ultimos.navidad)
  const saldo = { ...saldoNormal }

  // Primero los que les faltan guardias (el que más le falte, y si empatan, por orden de rueda)
  const ordenNormal = tecnicos.filter(puedeHacerGuardias)
    .sort((a, b) => (a.orden_rueda_normal ?? 0) - (b.orden_rueda_normal ?? 0) || a.nombre.localeCompare(b.nombre))
  const siguienteNormal = (evitar) => {
    const pendiente = ordenNormal
      .filter(t => saldo[t.id] < 0 && !evitar.has(t.id))
      .sort((a, b) => saldo[a.id] - saldo[b.id])[0]
    if (pendiente) { saldo[pendiente.id]++; return pendiente }
    return ruedaNormal.elegir(evitar, t => {
      if (saldo[t.id] > 0) { saldo[t.id]--; return true }
      return false
    })
  }

  const contadores = {}
  tecnicos.filter(puedeHacerGuardias).forEach(t => { contadores[t.id] = { normal: 0, festivo: 0, navidad: 0, total: 0 } })

  const ordenadas = [...semanas].sort((a, b) => a.lunes_inicio.localeCompare(b.lunes_inicio))
  let anterior = ultimos.semana || null
  ordenadas.forEach((semana, i) => {
    if (semana.tecnico_fijo) {
      semana.tecnico_asignado = { id: semana.tecnico_fijo }
      anterior = semana.tecnico_fijo
      return
    }
    const evitar = new Set([anterior, ordenadas[i + 1]?.tecnico_fijo].filter(Boolean))
    let tecnico
    if (semana.es_navidad) {
      tecnico = ruedaNavidad.elegir(evitar)
      semana.tipo = semana.tipo_navidad
      if (contadores[tecnico.id]) contadores[tecnico.id].navidad++
    } else if (semana.tiene_festivo) {
      tecnico = ruedaFestivo.elegir(evitar)
      semana.tipo = 'festivo'
      if (contadores[tecnico.id]) contadores[tecnico.id].festivo++
    } else {
      tecnico = siguienteNormal(evitar)
      semana.tipo = 'normal'
      if (contadores[tecnico.id]) contadores[tecnico.id].normal++
    }
    semana.tecnico_asignado = tecnico
    if (contadores[tecnico.id]) contadores[tecnico.id].total++
    anterior = tecnico.id
  })

  return { semanas: ordenadas, estadisticas: contadores }
}

/**
 * Rueda de reserva (sustitución)
 * Se guarda quién hizo la última reserva (rueda_punteros.ultimo_tecnico_id).
 * El siguiente es el que va detrás de él en orden_rueda_sustitucion,
 * saltando a los inactivos, a los que no hacen guardias y a quien solicita.
 */
const ordenSustitucion = t => t.orden_rueda_sustitucion ?? t.orden_rueda_normal ?? 0

export const puedeHacerGuardias = t => t.activo && t.rol !== 'admin' && t.hace_guardias !== false

// Todos los técnicos (también inactivos) en orden de la rueda de reserva
function ruedaSustitucionCompleta(tecnicos) {
  return tecnicos
    .filter(t => t.rol !== 'admin')
    .sort((a, b) => ordenSustitucion(a) - ordenSustitucion(b) || a.nombre.localeCompare(b.nombre))
}

/**
 * Técnicos que pueden hacer la reserva, empezando por el que le toca.
 * excluirId: el técnico que pide el cambio.
 */
export function ruedaReservaDesde(tecnicos, ultimoId, excluirId) {
  const todos = ruedaSustitucionCompleta(tecnicos)
  const inicio = todos.findIndex(t => t.id === ultimoId)
  const lista = []
  for (let k = 1; k <= todos.length; k++) {
    const t = todos[(inicio + k + todos.length) % todos.length]
    if (puedeHacerGuardias(t) && t.id !== excluirId) lista.push(t)
  }
  return lista
}

export function getSiguienteReserva(tecnicos, ultimoId, excluirId) {
  return ruedaReservaDesde(tecnicos, ultimoId, excluirId)[0] || null
}
