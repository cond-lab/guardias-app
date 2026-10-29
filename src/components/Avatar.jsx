import { useSyncExternalStore } from 'react'
import { supabase } from '../services/supabase'

// Color fijo por técnico según su orden de alta: cada uno se separa del anterior
// por el ángulo áureo (137,5°), así nunca quedan dos parecidos y al dar de alta
// a alguien nuevo no cambian los colores de los demás.
let posiciones = new Map()
const avisar = new Set()
let pedido = null

function cargarPosiciones() {
  if (pedido) return
  pedido = supabase.from('tecnicos').select('id').order('created_at').order('id').then(({ data }) => {
    posiciones = new Map((data || []).map((t, i) => [t.id, i]))
    avisar.forEach(fn => fn())
  })
}

function usePosiciones() {
  cargarPosiciones()
  return useSyncExternalStore(fn => { avisar.add(fn); return () => avisar.delete(fn) }, () => posiciones)
}

function colorDe(pos, id) {
  if (pos.has(id)) return `hsl(${Math.round((pos.get(id) * 137.508) % 360)} 60% 38%)`
  // Mientras carga (o si no está en la lista): color a partir del id
  let h = 2166136261
  for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  return `hsl(${h % 360} 60% 38%)`
}

export function useColorTecnico() {
  const pos = usePosiciones()
  return id => colorDe(pos, id || '')
}

export function iniciales(nombre = '') {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || '?'
}

export default function Avatar({ id, nombre, size = 28 }) {
  const color = useColorTecnico()
  return (
    <span
      className="avatar"
      title={nombre}
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4), background: color(id || nombre) }}
    >
      {iniciales(nombre)}
    </span>
  )
}

// Avatar + nombre en línea
export function TecnicoChip({ id, nombre, size = 26, children }) {
  if (!nombre) return <span className="text-muted" style={{ fontStyle: 'italic' }}>Sin asignar</span>
  return (
    <span className="tecnico-chip">
      <Avatar id={id} nombre={nombre} size={size} />
      <span className="tecnico-chip-nombre">{nombre}</span>
      {children}
    </span>
  )
}
