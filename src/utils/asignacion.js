import { addDays, getISOWeek, getYear, format, parseISO } from 'date-fns'

/**
 * Genera todos los lunes del año dado
 */
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

/**
 * Marca las semanas que contienen festivos
 */
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

/**
 * Motor principal de asignación equitativa
 * 
 * Regla clave: si al técnico que le toca esta semana le toca TAMBIÉN
 * la semana siguiente (con festivo), se le adelanta el festivo y
 * su semana normal la coge el siguiente en la cola.
 */
export function asignarGuardias(semanas, tecnicos) {
  const activos = tecnicos
    .filter(t => t.activo && t.rol !== 'admin')
    .sort((a, b) => a.orden_rueda_normal - b.orden_rueda_normal)

  const navidad = tecnicos
    .filter(t => t.activo && t.rol !== 'admin')
    .sort((a, b) => a.orden_rueda_navidad - b.orden_rueda_navidad)

  if (!activos.length) return { semanas, estadisticas: {} }

  const semanasNormales = semanas.filter(s => !s.es_navidad)
  const semanasNavidad = semanas.filter(s => s.es_navidad)

  // --- Rueda Navidad ---
  const tiposNavidad = ['navidad_nochebuena', 'navidad_navidad', 'navidad_reyes']
  semanasNavidad.forEach(semana => {
    const idx = tiposNavidad.indexOf(semana.tipo_navidad)
    if (idx >= 0 && navidad.length > 0) {
      semana.tecnico_asignado = navidad[idx % navidad.length]
      semana.tipo = semana.tipo_navidad
    }
  })

  // --- Rueda Normal con priorización festivos ---
  const n = activos.length
  let idxT = 0
  const contadores = {}
  activos.forEach(t => { contadores[t.id] = { normal: 0, festivo: 0, total: 0 } })

  let i = 0
  while (i < semanasNormales.length) {
    const actual = semanasNormales[i]
    const siguiente = semanasNormales[i + 1]
    const tecnico = activos[idxT % n]

    if (actual.tiene_festivo) {
      // Semana de festivo: asignar directo
      actual.tecnico_asignado = tecnico
      actual.tipo = 'festivo'
      contadores[tecnico.id].festivo++
      contadores[tecnico.id].total++
      idxT++
      i++
    } else if (siguiente?.tiene_festivo) {
      // La siguiente es festivo: este técnico se lleva el festivo primero
      // y la normal se pospone al siguiente técnico
      siguiente.tecnico_asignado = tecnico
      siguiente.tipo = 'festivo'
      contadores[tecnico.id].festivo++
      contadores[tecnico.id].total++
      idxT++

      const tecnicoSig = activos[idxT % n]
      actual.tecnico_asignado = tecnicoSig
      actual.tipo = 'normal'
      contadores[tecnicoSig.id].normal++
      contadores[tecnicoSig.id].total++
      idxT++

      i += 2
    } else {
      actual.tecnico_asignado = tecnico
      actual.tipo = 'normal'
      contadores[tecnico.id].normal++
      contadores[tecnico.id].total++
      idxT++
      i++
    }
  }

  const todas = [...semanasNormales, ...semanasNavidad]
    .sort((a, b) => a.lunes_inicio.localeCompare(b.lunes_inicio))

  return { semanas: todas, estadisticas: contadores }
}
