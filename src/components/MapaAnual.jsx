import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { useColorTecnico } from './Avatar'

const COLOR_TIPO = t => t === 'festivo' ? 'var(--festivo)' : t?.startsWith('navidad') ? 'var(--navidad)' : 'var(--normal)'
const MESES = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/**
 * Tira con todas las semanas del año. Color por tipo o por técnico.
 * Al pulsar una semana se llama a onElegir(semana) (el calendario salta a ella).
 */
export default function MapaAnual({ guardias, userId, onElegir }) {
  const [modo, setModo] = useState('tipo')
  const colorTecnico = useColorTecnico()
  const hoy = new Date()

  // Etiqueta de mes encima de la primera semana de cada mes
  let mesAnterior = -1
  const etiquetas = guardias.map(g => {
    const m = parseISO(g.lunes_inicio).getMonth()
    const nueva = m !== mesAnterior
    mesAnterior = m
    return nueva ? MESES[m] : ''
  })

  const tecnicos = modo === 'tecnico'
    ? [...new Map(guardias.filter(g => g.tecnico_id).map(g => [g.tecnico_id, g.tecnicos?.nombre])).entries()]
    : []

  return (
    <div className="card mb-4">
      <div className="mapa">
        <div className="mapa-cabecera">
          <span className="mapa-titulo">El año de un vistazo</span>
          <div className="mapa-modo" role="group" aria-label="Colorear por">
            <button type="button" className={modo === 'tipo' ? 'activo' : ''} aria-pressed={modo === 'tipo'} onClick={() => setModo('tipo')}>Por tipo</button>
            <button type="button" className={modo === 'tecnico' ? 'activo' : ''} aria-pressed={modo === 'tecnico'} onClick={() => setModo('tecnico')}>Por técnico</button>
          </div>
        </div>
        <div className="mapa-meses" aria-hidden="true">
          {etiquetas.map((e, i) => <span key={i}>{e}</span>)}
        </div>
        <div className="mapa-semanas">
          {guardias.map(g => {
            const inicio = parseISO(g.lunes_inicio), fin = parseISO(g.lunes_fin)
            const esHoy = inicio <= hoy && hoy < fin
            const pasada = fin <= hoy
            const color = modo === 'tipo' ? COLOR_TIPO(g.tipo) : (g.tecnico_id ? colorTecnico(g.tecnico_id) : 'var(--linea-fuerte)')
            const texto = `${format(inicio, 'd MMM', { locale: es })} → ${format(fin, 'd MMM', { locale: es })} · ${g.tecnicos?.nombre || 'Sin asignar'}${g.festivo_nombre ? ` · ${g.festivo_nombre}` : ''}`
            return (
              <button
                key={g.id}
                type="button"
                className={`mapa-celda${esHoy ? ' hoy' : ''}${pasada ? ' pasada' : ''}${g.tecnico_id === userId ? ' mia' : ''}`}
                style={{ background: color }}
                title={texto}
                aria-label={texto}
                onClick={() => onElegir?.(g)}
              />
            )
          })}
        </div>
        <div className="mapa-leyenda">
          {modo === 'tipo' ? (
            <>
              <span><i style={{ background: 'var(--normal)' }} />Normal</span>
              <span><i style={{ background: 'var(--festivo)' }} />Festivo</span>
              <span><i style={{ background: 'var(--navidad)' }} />Navidad</span>
            </>
          ) : tecnicos.map(([id, nombre]) => (
            <span key={id}><i style={{ background: colorTecnico(id) }} />{nombre}</span>
          ))}
          <span><i style={{ background: 'var(--superficie)', boxShadow: 'inset 0 0 0 2px var(--tinta)' }} />Esta semana</span>
          {userId && <span><i style={{ background: 'var(--texto-2)', borderRadius: '50%', transform: 'scale(0.6)' }} />Tus guardias</span>}
        </div>
      </div>
    </div>
  )
}
