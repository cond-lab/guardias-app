import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../services/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('guardias_user')
    if (stored) setUser(JSON.parse(stored))
    setLoading(false)
  }, [])

  async function login(nombre, pin) {
    const { data, error } = await supabase
      .from('tecnicos')
      .select('*')
      .eq('nombre', nombre)
      .eq('pin', pin)
      .eq('activo', true)
      .single()

    if (error || !data) throw new Error('Nombre o PIN incorrectos')
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
    <AuthContext.Provider value={{ user, login, logout, loading, isAdmin: user?.rol === 'admin' }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
