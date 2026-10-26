import { useState, useEffect } from 'react';
import supabase from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function DashboardAdmin() {
    const [prestamistas, setPrestamistas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');
    const navigate = useNavigate();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [nombreNegocio, setNombreNegocio] = useState('');
    const [creando, setCreando] = useState(false);

    useEffect(() => {
        fetchPrestamistas();
    }, []);

    const fetchPrestamistas = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('perfiles')
            .select('*')
            .order('nombre_negocio', { ascending: true });

        if (error) {
            setError('Error al cargar los prestamistas.');
        } else {
            setPrestamistas(data);
        }
        setLoading(false);
    };

    const handleCrearPrestamista = async (e) => {
        e.preventDefault();
        setCreando(true);
        setError(null);
        setSuccessMsg('');

        try {
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
            });

            if (authError) throw authError;

            const userId = authData.user?.id;

            if (userId) {
                const { error: perfilError } = await supabase
                    .from('perfiles')
                    .insert([
                        {
                            id: userId,
                            rol: 'prestamista',
                            estado: 'activo',
                            nombre_negocio: nombreNegocio
                        }
                    ]);

                if (perfilError) throw perfilError;

                setSuccessMsg(`¡Negocio "${nombreNegocio}" registrado con éxito!`);
                setEmail('');
                setPassword('');
                setNombreNegocio('');
                fetchPrestamistas();
            }
        } catch (err) {
            setError(err.message || 'Error al registrar el prestamista.');
        }
        setCreando(false);
    };

    const toggleEstado = async (id, estadoActual) => {
        const nuevoEstado = estadoActual === 'activo' ? 'suspendido' : 'activo';

        const { error } = await supabase
            .from('perfiles')
            .update({ estado: nuevoEstado })
            .eq('id', id);

        if (error) {
            alert('No se pudo actualizar el estado.');
        } else {
            fetchPrestamistas();
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-20 md:pb-8 overflow-x-hidden w-full font-sans">

            {/* Header Anubis - Admin */}
            <div className="bg-white p-5 text-neutral-900 shadow-sm rounded-b-3xl mb-8 flex justify-between items-center border-b border-gray-100 max-w-5xl mx-auto md:mt-4 md:rounded-t-3xl">
                <div>
                    <p className="text-[10px] text-amber-600 font-bold uppercase tracking-widest">Panel de Control</p>
                    <h1 className="text-xl md:text-2xl font-black truncate text-neutral-900 flex items-center gap-2">
                        <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                        Administración Anubis
                    </h1>
                </div>
                <button
                    onClick={handleLogout}
                    className="bg-gray-100 text-neutral-700 p-2.5 rounded-xl hover:bg-red-50 hover:text-red-600 transition shadow-sm"
                    title="Cerrar Sesión"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                </button>
            </div>

            <div className="max-w-5xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* Columna Izquierda: Formulario */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-fit relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-amber-500"></div>
                    <h2 className="text-xs font-black uppercase tracking-widest text-neutral-800 mb-5 flex items-center gap-2">
                        <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                        Nuevo Prestamista
                    </h2>

                    {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-xs font-bold">{error}</div>}
                    {successMsg && <div className="mb-4 bg-green-50 border border-green-200 text-green-600 p-3 rounded-xl text-xs font-bold">{successMsg}</div>}

                    <form onSubmit={handleCrearPrestamista} className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Nombre del Negocio</label>
                            <input
                                type="text"
                                value={nombreNegocio}
                                onChange={(e) => setNombreNegocio(e.target.value)}
                                required
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none text-neutral-800 focus:border-amber-500 font-medium transition"
                                placeholder="Ej. Préstamos El Sol"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Correo Electrónico</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none text-neutral-800 focus:border-amber-500 font-medium transition"
                                placeholder="usuario@correo.com"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Contraseña Temporal</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none text-neutral-800 focus:border-amber-500 font-medium transition"
                                placeholder="••••••••"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={creando}
                            className="w-full bg-amber-500 text-neutral-950 px-6 py-3.5 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-amber-400 transition shadow-sm mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {creando ? 'Registrando...' : 'Crear'}
                        </button>
                    </form>
                </div>

                {/* Columna Derecha: Tabla de Usuarios */}
                <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                        <h2 className="text-xs font-black uppercase tracking-widest text-neutral-800 flex items-center gap-2">
                            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                            Licencias Activas
                        </h2>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div></div>
                    ) : prestamistas.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-10 font-medium">No hay prestamistas registrados.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-white border-b border-gray-100 text-[10px] text-gray-400 uppercase tracking-widest">
                                        <th className="p-4 font-bold">Negocio / ID</th>
                                        <th className="p-4 font-bold">Rol</th>
                                        <th className="p-4 font-bold">Estado</th>
                                        <th className="p-4 font-bold text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 text-sm">
                                    {prestamistas.map((p) => (
                                        <tr key={p.id} className="hover:bg-gray-50/50 transition">
                                            <td className="p-4">
                                                <p className="font-bold text-gray-800">{p.nombre_negocio || 'Sin nombre'}</p>
                                                <p className="text-[10px] text-gray-400 font-mono tracking-wider mt-0.5">{p.id.substring(0, 12)}...</p>
                                            </td>
                                            <td className="p-4">
                                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{p.rol}</span>
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border ${p.estado === 'activo' ? 'bg-green-50 text-green-600 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                                                    {p.estado}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right">
                                                {p.rol !== 'admin' && (
                                                    <button
                                                        onClick={() => toggleEstado(p.id, p.estado)}
                                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition border ${p.estado === 'activo'
                                                            ? 'bg-white border-red-200 text-red-600 hover:bg-red-50'
                                                            : 'bg-white border-green-200 text-green-600 hover:bg-green-50'
                                                            }`}
                                                    >
                                                        {p.estado === 'activo' ? 'Suspender' : 'Activar'}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}