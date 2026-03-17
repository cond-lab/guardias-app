import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Estado cambio de PIN
  const [fase, setFase] = useState('login') // 'login' | 'cambiar_pin'
  const [pinNuevo, setPinNuevo] = useState('')
  const [pinNuevo2, setPinNuevo2] = useState('')
  const [usuarioPendiente, setUsuarioPendiente] = useState(null)

  const { login, cambiarPin } = useAuth()
  const navigate = useNavigate()

  async function handleLogin(e) {
    e.preventDefault()
    if (!email.trim() || !pin.trim()) { setError('Introduce tu email y PIN'); return }
    setLoading(true); setError('')
    try {
      const resultado = await login(email.trim(), pin.trim())
      if (resultado.primerLogin) {
        // PIN por defecto detectado → forzar cambio
        setUsuarioPendiente(resultado.user)
        setFase('cambiar_pin')
      } else {
        navigate('/')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCambiarPin(e) {
    e.preventDefault()
    if (!pinNuevo.trim()) { setError('El nuevo PIN no puede estar vacío'); return }
    if (pinNuevo !== pinNuevo2) { setError('Los PINs no coinciden'); return }
    if (pinNuevo === '0000') { setError('El nuevo PIN no puede ser el PIN por defecto'); return }
    if (pinNuevo.length < 4) { setError('El PIN debe tener al menos 4 caracteres'); return }
    setLoading(true); setError('')
    try {
      await cambiarPin(usuarioPendiente.id, pinNuevo)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div style={{ fontSize: 40, marginBottom: 8 }}>🗓</div>
          <h1>Guardias</h1>
          <p>{fase === 'login' ? 'Sistema de Gestión de Rueda' : 'Establece tu PIN personal'}</p>
        </div>

        {fase === 'login' ? (
          <form onSubmit={handleLogin}>
            {error && <div className="alert alert-danger">{error}</div>}
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                className="form-control"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@email.com"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">PIN</label>
              <input
                className="form-control font-mono"
                type="password"
                value={pin}
                onChange={e => setPin(e.target.value)}
                placeholder="••••"
                maxLength={10}
              />
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
              disabled={loading}
            >
              {loading
                ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Entrando...</>
                : 'Entrar'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCambiarPin}>
            <div className="alert alert-warning" style={{ marginBottom: 16 }}>
              Es tu primera vez accediendo. Debes establecer un PIN personal antes de continuar.
            </div>
            {error && <div className="alert alert-danger">{error}</div>}
            <div className="form-group">
              <label className="form-label">Nuevo PIN</label>
              <input
                className="form-control font-mono"
                type="password"
                value={pinNuevo}
                onChange={e => setPinNuevo(e.target.value)}
                placeholder="Mínimo 4 caracteres"
                maxLength={10}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Repite el PIN</label>
              <input
                className="form-control font-mono"
                type="password"
                value={pinNuevo2}
                onChange={e => setPinNuevo2(e.target.value)}
                placeholder="Repite el PIN"
                maxLength={10}
              />
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
              disabled={loading}
            >
              {loading
                ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Guardando...</>
                : 'Establecer PIN y entrar'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
