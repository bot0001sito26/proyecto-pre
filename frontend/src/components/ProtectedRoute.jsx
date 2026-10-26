import { useEffect } from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import supabase from '../supabaseClient';

export const ProtectedRoute = () => {
    const { user, perfil, loading } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (!user) return;

        let timeoutId;

        const resetTimer = () => {
            clearTimeout(timeoutId);

            timeoutId = setTimeout(async () => {
                await supabase.auth.signOut();
                navigate('/login', { replace: true });
            }, 300000);
        };


        const events = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];
        events.forEach(event => window.addEventListener(event, resetTimer));


        resetTimer();

        return () => {
            clearTimeout(timeoutId);
            events.forEach(event => window.removeEventListener(event, resetTimer));
        };
    }, [user, navigate]);

    if (loading) return <div className="min-h-screen flex items-center justify-center text-amber-500 font-bold">Cargando...</div>;
    if (!user) return <Navigate to="/login" replace />;


    if (perfil?.estado === 'suspendido') return <Navigate to="/suspendido" replace />;

    return <Outlet />;
};