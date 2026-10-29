import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'

export const ANIO_ACTUAL = new Date().getFullYear()

/**
 * Años que se pueden elegir:
 * - el año pasado, solo si tiene guardias (al acabar 2027, 2026 desaparece)
 * - el año actual
 * - el año siguiente: el admin siempre (para generarlo), los técnicos cuando ya está generado
 */
export function useAnios() {
  const { isAdmin } = useAuth()
  const [anios, setAnios] = useState(isAdmin ? [ANIO_ACTUAL, ANIO_ACTUAL + 1] : [ANIO_ACTUAL])

  useEffect(() => {
    let vivo = true
    const contar = a => supabase.from('semanas_guardia').select('id', { count: 'exact', head: true }).eq('anio', a)
    Promise.all([contar(ANIO_ACTUAL - 1), contar(ANIO_ACTUAL + 1)]).then(([{ count: pasado }, { count: siguiente }]) => {
      if (!vivo) return
      setAnios([
        ...(pasado > 0 ? [ANIO_ACTUAL - 1] : []),
        ANIO_ACTUAL,
        ...(isAdmin || siguiente > 0 ? [ANIO_ACTUAL + 1] : []),
      ])
    })
    return () => { vivo = false }
  }, [isAdmin])

  return anios
}

export default function SelectorAnio({ value, onChange }) {
  const anios = useAnios()
  return (
    <div className="selector-anio" role="group" aria-label="Año">
      {anios.map(a => (
        <button
          key={a}
          type="button"
          className={`selector-anio-btn${a === value ? ' activo' : ''}`}
          aria-pressed={a === value}
          title={a === ANIO_ACTUAL ? 'Año en curso' : undefined}
          onClick={() => onChange(a)}
        >
          {a}
          {a === ANIO_ACTUAL && <span className="selector-anio-punto" aria-hidden="true" />}
        </button>
      ))}
    </div>
  )
}
