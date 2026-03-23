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
 * Rueda normal y festivo son INDEPENDIENTES.
 * Rueda navidad separada (Nochebuena/Navidad/Reyes).
 */
export function asignarGuardias(semanas, tecnicos) {
  const activos = tecnicos
    .filter(t => t.activo && t.rol !== 'admin' && t.hace_guardias !== false)
    .sort((a, b) => a.orden_rueda_normal - b.orden_rueda_normal)

  const activosFestivo = tecnicos
    .filter(t => t.activo && t.rol !== 'admin' && t.hace_guardias !== false)
    .sort((a, b) => (a.orden_rueda_festivo ?? a.orden_rueda_normal) - (b.orden_rueda_festivo ?? b.orden_rueda_normal))

  const navidad = tecnicos
    .filter(t => t.activo && t.rol !== 'admin' && t.hace_guardias !== false)
    .sort((a, b) => a.orden_rueda_navidad - b.orden_rueda_navidad)

  if (!activos.length) return { semanas, estadisticas: {} }

  const semanasNormales = semanas.filter(s => !s.es_navidad)
  const semanasNavidad = semanas.filter(s => s.es_navidad)

  // Navidad
  const tiposNavidad = ['navidad_nochebuena', 'navidad_navidad', 'navidad_reyes']
  semanasNavidad.forEach(semana => {
    const idx = tiposNavidad.indexOf(semana.tipo_navidad)
    if (idx >= 0 && navidad.length > 0) {
      semana.tecnico_asignado = navidad[idx % navidad.length]
      semana.tipo = semana.tipo_navidad
    }
  })

  // Normal y Festivo independientes
  const n = activos.length
  const nF = activosFestivo.length
  let idxNormal = 0
  let idxFestivo = 0
  const contadores = {}
  activos.forEach(t => { contadores[t.id] = { normal: 0, festivo: 0, total: 0 } })

  for (const semana of semanasNormales) {
    if (semana.tiene_festivo) {
      const tecnico = activosFestivo[idxFestivo % nF]
      semana.tecnico_asignado = tecnico
      semana.tipo = 'festivo'
      if (contadores[tecnico.id]) { contadores[tecnico.id].festivo++; contadores[tecnico.id].total++ }
      idxFestivo++
    } else {
      const tecnico = activos[idxNormal % n]
      semana.tecnico_asignado = tecnico
      semana.tipo = 'normal'
      if (contadores[tecnico.id]) { contadores[tecnico.id].normal++; contadores[tecnico.id].total++ }
      idxNormal++
    }
  }

  const todas = [...semanasNormales, ...semanasNavidad]
    .sort((a, b) => a.lunes_inicio.localeCompare(b.lunes_inicio))

  return { semanas: todas, estadisticas: contadores }
}

/**
 * Obtiene el técnico que le toca en la rueda de sustitución
 */
export function getTecnicoSustitucion(tecnicos, puntero) {
  const activos = tecnicos
    .filter(t => t.activo && t.rol !== 'admin' && t.hace_guardias !== false)
    .sort((a, b) => (a.orden_rueda_sustitucion ?? a.orden_rueda_normal) - (b.orden_rueda_sustitucion ?? b.orden_rueda_normal))
  if (!activos.length) return null
  return activos[puntero % activos.length]
}
