import { useState, useEffect } from 'react';
import supabase from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';

export default function DashboardPrestamista() {
    const { user, perfil } = useAuth();
    const navigate = useNavigate();

    const getFechaLocal = () => new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
    const hoyStr = getFechaLocal();

    const [morosos, setMorosos] = useState(() => {
        try {
            const guardado = sessionStorage.getItem('anubis_morosos');
            return guardado ? JSON.parse(guardado) : [];
        } catch { return []; }
    });

    const [cargando, setCargando] = useState(() => {
        try {
            const guardado = sessionStorage.getItem('anubis_morosos');
            return !guardado || JSON.parse(guardado).length === 0;
        } catch { return true; }
    });

    useEffect(() => {
        if (user?.id) cargarDatosDashboard();
    }, [user]);

    const cargarDatosDashboard = async () => {
        const { data, error } = await supabase
            .from('historial_pagos')
            .select(`
                id, fecha_cobro,
                prestamos!inner ( id, valor_cuota, estado, clientes ( id, nombre ) )
            `)
            .eq('prestamos.estado', 'activo')
            .in('estado_cobro', ['pendiente', 'no_pago'])
            .lt('fecha_cobro', hoyStr)
            .order('fecha_cobro', { ascending: true });

        if (!error && data) {
            const mapaClientes = {};
            data.forEach(pago => {
                const cliente = pago.prestamos.clientes;
                if (!mapaClientes[cliente.id]) {
                    mapaClientes[cliente.id] = {
                        id: cliente.id,
                        prestamo_id: pago.prestamos.id,
                        nombre: cliente.nombre,
                        fecha_mas_antigua: pago.fecha_cobro,
                        deuda_total: Number(pago.prestamos.valor_cuota),
                        cuotas_caidas: 1
                    };
                } else {
                    mapaClientes[cliente.id].deuda_total += Number(pago.prestamos.valor_cuota);
                    mapaClientes[cliente.id].cuotas_caidas += 1;
                }
            });
            const resultado = Object.values(mapaClientes);
            setMorosos(resultado);
            sessionStorage.setItem('anubis_morosos', JSON.stringify(resultado));
        }
        setCargando(false);
    };

    const handleLogout = async () => {
        sessionStorage.clear();
        await supabase.auth.signOut();
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-20 md:pb-8 overflow-x-hidden w-full font-sans">
            <div className="bg-white p-5 text-neutral-900 shadow-sm rounded-b-3xl mb-6 flex justify-between items-center border-b border-gray-100">
                <div>
                    <p className="text-[10px] text-amber-600 font-bold uppercase tracking-widest">Bienvenido a Anubis</p>
                    <h1 className="text-2xl font-black truncate max-w-[220px] text-neutral-900">
                        {perfil?.nombre_negocio || 'Mi Negocio'}
                    </h1>
                </div>
                <button
                    onClick={handleLogout}
                    className="bg-gray-100 text-neutral-700 p-2.5 rounded-xl hover:bg-gray-200 hover:text-amber-600 transition shadow-sm"
                    title="Cerrar Sesión"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                </button>
            </div>

            <div className="px-4 mx-auto max-w-3xl space-y-6">
                <div className="grid grid-cols-3 gap-3 md:gap-5">
                    <Link to="/prestamos" className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 text-center active:scale-95 transition block hover:border-amber-300 group">
                        <svg className="w-7 h-7 mx-auto mb-2 text-neutral-400 group-hover:text-amber-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-800">Cartera</span>
                    </Link>
                    <Link to="/clientes" className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 text-center active:scale-95 transition block hover:border-amber-300 group">
                        <svg className="w-7 h-7 mx-auto mb-2 text-neutral-400 group-hover:text-amber-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        </svg>
                        <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-800">Clientes</span>
                    </Link>
                    <Link to="/nuevo-prestamo" className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 text-center active:scale-95 transition block hover:border-amber-300 group">
                        <svg className="w-7 h-7 mx-auto mb-2 text-neutral-400 group-hover:text-amber-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-800">Préstamo</span>
                    </Link>
                </div>

                <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-red-100 flex flex-col max-h-80">
                    <div className="bg-red-50/50 p-4 border-b border-red-100 flex items-center justify-between z-10 sticky top-0">
                        <h2 className="font-bold text-red-700 flex items-center gap-2 text-sm uppercase tracking-wider">
                            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            Prioridad: Atrasos
                        </h2>
                        <span className="bg-red-100 text-red-800 text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest">
                            {morosos.length} Clientes
                        </span>
                    </div>

                    <div className="overflow-y-auto flex-1 p-2">
                        {cargando ? (
                            <div className="flex justify-center py-6">
                                <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        ) : morosos.length === 0 ? (
                            <p className="text-center text-sm text-gray-400 py-6 font-medium">¡Excelente! Tu cartera está al día.</p>
                        ) : (
                            <ul className="space-y-2">
                                {morosos.map((m) => (
                                    <li key={m.id} className="p-3 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition flex justify-between items-center">
                                        <div>
                                            <p className="font-bold text-neutral-800 text-sm truncate max-w-[150px]">{m.nombre}</p>
                                            <p className="text-[10px] font-bold text-red-400 uppercase">Desde: {m.fecha_mas_antigua}</p>
                                        </div>
                                        <div className="text-right flex items-center gap-3">
                                            <div className="text-right">
                                                <p className="font-black text-red-600 text-base leading-none">${m.deuda_total.toFixed(2)}</p>
                                                <span className="text-[9px] text-gray-400 font-bold uppercase">{m.cuotas_caidas} cuotas</span>
                                            </div>
                                            <Link to="/prestamos" state={{ abrirPrestamoId: m.prestamo_id }} className="bg-red-50 text-red-600 p-2 rounded-lg hover:bg-red-100 transition">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </Link>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                {/* NUEVA SECCIÓN DIVIDIDA EN 2 COLUMNAS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Tarjeta 1: Ruta Diaria */}
                    <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100 p-5 text-center flex flex-col justify-between h-full">
                        <div>
                            <div className="w-10 h-10 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-2">
                                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <h2 className="font-black text-neutral-900 text-base tracking-wider uppercase mb-1">Ruta Diaria</h2>
                            <p className="text-[11px] text-gray-500 mb-4 font-medium px-2">Abre tu cartulina digital y registra los pagos diarios en la calle.</p>
                        </div>
                        <Link
                            to="/calendario"
                            className="inline-block w-full bg-amber-500 text-neutral-950 font-black uppercase tracking-widest px-4 py-3 rounded-xl hover:bg-amber-600 hover:text-white transition shadow-sm text-xs"
                        >
                            Iniciar Ruta
                        </Link>
                    </div>

                    {/* Tarjeta 2: Cobros Periódicos */}
                    <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100 p-5 text-center flex flex-col justify-between h-full">
                        <div>
                            <div className="w-10 h-10 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-2">
                                <svg className="w-5 h-5 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                </svg>
                            </div>
                            <h2 className="font-black text-neutral-900 text-base tracking-wider uppercase mb-1">Periódicos</h2>
                            <p className="text-[11px] text-gray-500 mb-4 font-medium px-2">Listado inteligente de cobros Semanales, Quincenales y Mensuales.</p>
                        </div>
                        <Link
                            to="/cobros-periodicos"
                            className="inline-block w-full bg-neutral-900 text-white font-black uppercase tracking-widest px-4 py-3 rounded-xl hover:bg-neutral-800 transition shadow-sm text-xs border border-neutral-900"
                        >
                            Ver Pendientes
                        </Link>
                    </div>
                </div>

            </div>
        </div>
    );
}