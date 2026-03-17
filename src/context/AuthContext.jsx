import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../services/supabase'

const AuthContext = createContext(null)
const PIN_DEFAULT = '0000'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('guardias_user')
    if (stored) setUser(JSON.parse(stored))
    setLoading(false)
  }, [])

  async function login(email, pin) {
    const { data, error } = await supabase
      .from('tecnicos')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('pin', pin)
      .eq('activo', true)
      .single()

    if (error || !data) throw new Error('Email o PIN incorrectos')

    const primerLogin = pin === PIN_DEFAULT

    if (!primerLogin) {
      // Login normal: guardar sesión
      const u = { id: data.id, nombre: data.nombre, rol: data.rol, email: data.email }
      setUser(u)
      localStorage.setItem('guardias_user', JSON.stringify(u))
    }

    return {
      user: data,
      primerLogin
    }
  }

  async function cambiarPin(tecnicoId, nuevoPin) {
    const { data, error } = await supabase
      .from('tecnicos')
      .update({ pin: nuevoPin })
      .eq('id', tecnicoId)
      .select()
      .single()

    if (error) throw new Error('Error al cambiar el PIN')

    const u = { id: data.id, nombre: data.nombre, rol: data.rol, email: data.email }
    setUser(u)
    localStorage.setItem('guardias_user', JSON.stringify(u))
    return u
  }

  function logout() {
    setUser(null)
    localStorage.removeItem('guardias_user')
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, cambiarPin, loading, isAdmin: user?.rol === 'admin' }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
