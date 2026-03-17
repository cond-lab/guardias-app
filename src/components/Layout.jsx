import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const { user, logout, isAdmin, cambiarPin } = useAuth()
  const navigate = useNavigate()
  const [modalPin, setModalPin] = useState(false)
  const [pinNuevo, setPinNuevo] = useState('')
  const [pinNuevo2, setPinNuevo2] = useState('')
  const [pinMsg, setPinMsg] = useState(null)
  const [guardando, setGuardando] = useState(false)

  function handleLogout() { logout(); navigate('/login') }

  async function handleCambiarPin(e) {
    e.preventDefault()
    if (!pinNuevo.trim()) { setPinMsg({ tipo: 'danger', texto: 'El PIN no puede estar vacío' }); return }
    if (pinNuevo !== pinNuevo2) { setPinMsg({ tipo: 'danger', texto: 'Los PINs no coinciden' }); return }
    if (pinNuevo === '0000') { setPinMsg({ tipo: 'danger', texto: 'No puedes usar el PIN por defecto' }); return }
    if (pinNuevo.length < 4) { setPinMsg({ tipo: 'danger', texto: 'Mínimo 4 caracteres' }); return }
    setGuardando(true); setPinMsg(null)
    try {
      await cambiarPin(user.id, pinNuevo)
      setPinMsg({ tipo: 'success', texto: 'PIN actualizado correctamente' })
      setTimeout(() => { setModalPin(false); setPinNuevo(''); setPinNuevo2(''); setPinMsg(null) }, 1500)
    } catch (err) {
      setPinMsg({ tipo: 'danger', texto: err.message })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>🗓 Guardias</h1>
          <p>Sistema de Rueda</p>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section">General</div>
          <NavLink to="/" end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <span className="icon">⚡</span> Conductivos
          </NavLink>
          <NavLink to="/calendario" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <span className="icon">📅</span> Calendario
          </NavLink>
          <NavLink to="/mis-guardias" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <span className="icon">👤</span> Mis Guardias
          </NavLink>
          <NavLink to="/solicitudes" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <span className="icon">🔄</span> Solicitudes
          </NavLink>
          {isAdmin && (
            <>
              <div className="nav-section">Administración</div>
              <NavLink to="/admin/guardias" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                <span className="icon">⚙️</span> Gestión Rueda
              </NavLink>
              <NavLink to="/admin/tecnicos" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                <span className="icon">👥</span> Técnicos
              </NavLink>
              <NavLink to="/admin/festivos" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                <span className="icon">🏖️</span> Festivos
              </NavLink>
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="user-name">{user?.nombre}</div>
          <div className="user-rol">{user?.rol === 'admin' ? 'Administrador' : 'Técnico'}</div>
          <button className="btn-logout" style={{ marginTop: 6 }} onClick={() => { setModalPin(true); setPinMsg(null); setPinNuevo(''); setPinNuevo2('') }}>
            🔑 Cambiar PIN
          </button>
          <button className="btn-logout" onClick={handleLogout}>Cerrar sesión</button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>

      {modalPin && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalPin(false)}>
          <div className="modal">
            <div className="modal-header">
              <span>Cambiar PIN</span>
              <button className="btn btn-outline btn-icon btn-sm" onClick={() => setModalPin(false)}>✕</button>
            </div>
            <form onSubmit={handleCambiarPin}>
              <div className="modal-body">
                {pinMsg && <div className={`alert alert-${pinMsg.tipo}`}>{pinMsg.texto}</div>}
                <div className="form-group">
                  <label className="form-label">Nuevo PIN</label>
                  <input className="form-control font-mono" type="password" value={pinNuevo} onChange={e => setPinNuevo(e.target.value)} placeholder="Mínimo 4 caracteres" maxLength={10} autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Repite el nuevo PIN</label>
                  <input className="form-control font-mono" type="password" value={pinNuevo2} onChange={e => setPinNuevo2(e.target.value)} placeholder="Repite el PIN" maxLength={10} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setModalPin(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={guardando}>
                  {guardando ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Guardando...</> : 'Guardar PIN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
