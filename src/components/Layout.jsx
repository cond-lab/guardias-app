import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const { user, logout, isAdmin } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
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
          <button className="btn-logout" onClick={handleLogout}>Cerrar sesión</button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
