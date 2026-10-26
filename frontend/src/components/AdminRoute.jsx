import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const AdminRoute = () => {
    const { perfil, loading } = useAuth();

    if (loading) return <div>Cargando...</div>;

    if (perfil?.rol !== 'admin') return <Navigate to="/dashboard" replace />;

    return <Outlet />;
};