import { useState, useEffect } from 'react';
import supabase from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();
    const { user, perfil } = useAuth();

    useEffect(() => {
        if (user && perfil) {
            if (perfil.rol === 'admin') navigate('/admin');
            else navigate('/dashboard');
        }
    }, [user, perfil, navigate]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const { error: authError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (authError) {
            setError('Correo o contraseña incorrectos.');
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 font-sans relative overflow-hidden">
            {/* Elementos decorativos sutiles Anubis */}
            <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-amber-100 rounded-full blur-3xl pointer-events-none opacity-50"></div>

            <div className="w-full max-w-md rounded-2xl bg-white p-10 shadow-xl border border-gray-100 relative z-10">

                <div className="text-center mb-10">
                    <h2 className="text-4xl font-black text-gray-900 tracking-[0.2em] uppercase">
                        Anub<span className="text-amber-500">i</span>s
                    </h2>
                </div>

                {error && (
                    <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600 text-center font-bold">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">
                            Correo Electrónico
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-gray-800 outline-none focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all font-medium"
                            placeholder="admin@ejemplo.com"
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">
                            Contraseña
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-gray-800 outline-none focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all font-medium"
                            placeholder="••••••••"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-xl bg-amber-500 p-4 font-black text-white shadow-lg shadow-amber-500/30 transition-all hover:bg-amber-600 hover:shadow-amber-500/50 disabled:opacity-50 disabled:hover:scale-100 uppercase tracking-widest text-sm mt-4"
                    >
                        {loading ? 'Verificando...' : 'Acceder'}
                    </button>
                </form>
            </div>
        </div>
    );
}