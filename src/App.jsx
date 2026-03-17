import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Conductivos from './pages/Conductivos'
import Calendario from './pages/Calendario'
import MisGuardias from './pages/MisGuardias'
import Solicitudes from './pages/Solicitudes'
import AdminGuardias from './pages/AdminGuardias'
import AdminTecnicos from './pages/AdminTecnicos'
import AdminFestivos from './pages/AdminFestivos'
import './index.css'

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-center"><div className="spinner" /></div>
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.rol !== 'admin') return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Conductivos />} />
        <Route path="calendario" element={<Calendario />} />
        <Route path="mis-guardias" element={<MisGuardias />} />
        <Route path="solicitudes" element={<Solicitudes />} />
        <Route path="admin/guardias" element={<ProtectedRoute adminOnly><AdminGuardias /></ProtectedRoute>} />
        <Route path="admin/tecnicos" element={<ProtectedRoute adminOnly><AdminTecnicos /></ProtectedRoute>} />
        <Route path="admin/festivos" element={<ProtectedRoute adminOnly><AdminFestivos /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter basename="/guardias-app">
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
