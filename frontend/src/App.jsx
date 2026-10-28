import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import DashboardPrestamista from './pages/prestamista/DashboardPrestamista';
import ListaClientes from './pages/prestamista/ListaClientes';
import NuevoPrestamo from './pages/prestamista/NuevoPrestamo';
import DashboardAdmin from './pages/admin/DashboardAdmin';
import Suspendido from './pages/Suspendido';
import CalendarioCobros from './pages/prestamista/CalendarioCobros';
import ListaPrestamos from './pages/prestamista/ListaPrestamos';
import CobrosPeriodicos from './pages/prestamista/CobrosPeriodicos';

// Guardián para usuarios logueados
const ProtectedRoute = ({ children }) => {
  const { user, perfil, loading } = useAuth();
  if (loading) return <div className="p-8 text-center">Cargando sistema...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (perfil?.estado === 'suspendido') return <Navigate to="/suspendido" replace />;
  return children;
};

// Guardián estricto para el panel de Admin
const AdminRoute = ({ children }) => {
  const { perfil, loading } = useAuth();
  if (loading) return <div className="p-8 text-center">Cargando sistema...</div>;
  if (perfil?.rol !== 'admin') return <Navigate to="/dashboard" replace />;
  return children;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/suspendido" element={<Suspendido />} />

          {/* Rutas Privadas del Prestamista */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <DashboardPrestamista />
            </ProtectedRoute>
          } />

          <Route path="/clientes" element={
            <ProtectedRoute>
              <ListaClientes />
            </ProtectedRoute>
          } />

          <Route path="/nuevo-prestamo" element={
            <ProtectedRoute>
              <NuevoPrestamo />
            </ProtectedRoute>
          } />

          {/* Ruta del Dueño / Administrador */}
          <Route path="/admin" element={
            <ProtectedRoute>
              <AdminRoute>
                <DashboardAdmin />
              </AdminRoute>
            </ProtectedRoute>
          } />

          <Route path="/cobros-periodicos" element={<CobrosPeriodicos />} />

          <Route path="/calendario" element={
            <ProtectedRoute>
              <CalendarioCobros />
            </ProtectedRoute>
          } />

          <Route path="/prestamos" element={
            <ProtectedRoute>
              <ListaPrestamos />
            </ProtectedRoute>
          } />

          {/* Si escriben una ruta que no existe, los manda al login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}