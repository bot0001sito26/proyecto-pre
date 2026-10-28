import { useState, useEffect, useMemo } from 'react';
import supabase from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import CartulinaModal from '../../components/CartulinaModal';
import LibretaMensualModal from '../../components/LibretaMensualModal';
import ClienteAcordeon from '../../components/ClienteAcordeon';
import { generarReporteCarteraPDF } from '../../utils/generarPDF';

const ACORDEONES_POR_PAGINA = 15;

export default function ListaPrestamos() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const hoy = new Date();
    const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
    const hoyStr = hoy.toISOString().split('T')[0];

    const [fechaDesde, setFechaDesde] = useState(primerDiaMes);
    const [fechaHasta, setFechaHasta] = useState(hoyStr);
    const [busqueda, setBusqueda] = useState('');
    const [pagina, setPagina] = useState(1);

    // NUEVO ESTADO: Privacidad (Ojito)
    const [mostrarValores, setMostrarValores] = useState(false);

    const [prestamos, setPrestamos] = useState(() => {
        try { return JSON.parse(sessionStorage.getItem('anubis_prestamos')) || []; } catch { return []; }
    });
    const [pagosRango, setPagosRango] = useState(() => {
        try { return JSON.parse(sessionStorage.getItem('anubis_pagos_rango')) || []; } catch { return []; }
    });
    const [movimientosRango, setMovimientosRango] = useState(() => {
        try { return JSON.parse(sessionStorage.getItem('anubis_movimientos_rango')) || []; } catch { return []; }
    });

    const [cargando, setCargando] = useState(true);
    const [prestamoSeleccionado, setPrestamoSeleccionado] = useState(null);

    useEffect(() => {
        if (!cargando && location.state?.abrirPrestamoId && prestamos.length > 0) {
            const prestamoParaAbrir = prestamos.find(p => p.id === location.state.abrirPrestamoId);
            if (prestamoParaAbrir) {
                setPrestamoSeleccionado(prestamoParaAbrir);
                navigate(location.pathname, { replace: true, state: {} });
            }
        }
    }, [cargando, prestamos, location.state, navigate, location.pathname]);

    useEffect(() => {
        setPagina(1);
    }, [busqueda, fechaDesde, fechaHasta]);

    useEffect(() => {
        if (user?.id) fetchDatosDashboard();
    }, [user, fechaDesde, fechaHasta]);

    const fetchDatosDashboard = async () => {
        setCargando(true);

        const { data: dataPrestamos } = await supabase
            .from('prestamos')
            .select(`
                id, monto_capital, interes_total, monto_total, saldo_pendiente, 
                frecuencia, valor_cuota, fecha_inicio, estado, cliente_id, tipo_prestamo, cobrador,
                clientes ( id, nombre, telefono )
            `)
            .eq('prestamista_id', user.id)
            .order('fecha_registro', { ascending: false });

        const { data: dataPagos } = await supabase
            .from('historial_pagos')
            .select(`monto_recibido, estado_cobro, prestamos!inner ( id, interes_total, monto_total, prestamista_id, estado )`)
            .eq('prestamos.prestamista_id', user.id)
            .in('estado_cobro', ['pagado', 'renovado'])
            .gte('fecha_cobro', fechaDesde)
            .lte('fecha_cobro', fechaHasta);

        const { data: dataMovimientos } = await supabase
            .from('movimientos_mensuales')
            .select(`monto, prestamos!inner ( prestamista_id )`)
            .eq('prestamos.prestamista_id', user.id)
            .eq('tipo', 'pago_interes')
            .gte('fecha', fechaDesde)
            .lte('fecha', fechaHasta);

        if (dataPrestamos) {
            setPrestamos(dataPrestamos);
            sessionStorage.setItem('anubis_prestamos', JSON.stringify(dataPrestamos));
        }
        if (dataPagos) {
            setPagosRango(dataPagos);
            sessionStorage.setItem('anubis_pagos_rango', JSON.stringify(dataPagos));
        }
        if (dataMovimientos) {
            setMovimientosRango(dataMovimientos);
            sessionStorage.setItem('anubis_movimientos_rango', JSON.stringify(dataMovimientos));
        }
        setCargando(false);
    };

    const prestamosEnRango = useMemo(() => {
        return prestamos.filter(p => p.fecha_inicio >= fechaDesde && p.fecha_inicio <= fechaHasta);
    }, [prestamos, fechaDesde, fechaHasta]);

    const todosLosActivos = useMemo(() => {
        return prestamos.filter(p => p.estado === 'activo');
    }, [prestamos]);

    const capitalActivoTotal = useMemo(() => {
        return todosLosActivos.reduce((sum, p) => sum + Number(p.monto_capital), 0);
    }, [todosLosActivos]);

    const interesGanadoRango = useMemo(() => {
        const prestamosContabilizados = new Set();
        let ganancia = 0;

        pagosRango.forEach(pago => {
            const prestamo = pago.prestamos;
            if (prestamo.estado === 'completado' || prestamo.estado === 'renovado') {
                if (!prestamosContabilizados.has(prestamo.id)) {
                    prestamosContabilizados.add(prestamo.id);
                    ganancia += Number(prestamo.interes_total);
                }
            }
        });

        movimientosRango.forEach(mov => {
            ganancia += Number(mov.monto);
        });

        return ganancia;
    }, [pagosRango, movimientosRango]);

    const clientesAgrupados = useMemo(() => {
        const mapa = {};
        prestamos.forEach(p => {
            const clienteId = p.clientes.id;
            if (!mapa[clienteId]) mapa[clienteId] = { ...p.clientes, prestamos: [] };
            mapa[clienteId].prestamos.push(p);
        });
        return Object.values(mapa).filter(c => c.nombre.toLowerCase().includes(busqueda.toLowerCase()));
    }, [prestamos, busqueda]);

    const totalPaginas = Math.ceil(clientesAgrupados.length / ACORDEONES_POR_PAGINA);
    const clientesPaginados = clientesAgrupados.slice((pagina - 1) * ACORDEONES_POR_PAGINA, pagina * ACORDEONES_POR_PAGINA);

    const renovarPrestamo = (clienteId, prestamoId) => {
        navigate('/nuevo-prestamo', { state: { preselectClienteId: clienteId, prestamoARenovar: prestamoId } });
    };

    const finalizarPrestamo = async () => {
        await supabase.from('prestamos').update({ estado: 'completado', saldo_pendiente: 0 }).eq('id', prestamoSeleccionado.id);

        if (prestamoSeleccionado.tipo_prestamo === 'cuota_fija') {
            await supabase.from('historial_pagos').update({ estado_cobro: 'pagado', monto_recibido: prestamoSeleccionado.valor_cuota, fecha_cobro: hoyStr })
                .eq('prestamo_id', prestamoSeleccionado.id).in('estado_cobro', ['pendiente', 'no_pago']);
        }
        setPrestamoSeleccionado(null);
        fetchDatosDashboard();
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4 pb-20 overflow-x-hidden w-full font-sans">
            <div className="max-w-3xl mx-auto space-y-4">
                <div className="flex items-center justify-between mb-2">
                    <Link to="/dashboard" className="text-neutral-400 hover:text-amber-600 transition flex items-center gap-1 font-bold text-xs uppercase tracking-widest">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Volver
                    </Link>
                    <h1 className="text-xl font-black text-neutral-900 tracking-widest uppercase">Cartera</h1>
                </div>

                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-amber-500"></div>

                    <div className="flex justify-between items-center mb-4">
                        <h2 className="font-black text-neutral-800 text-xs uppercase tracking-widest flex items-center gap-2">
                            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                            Filtro de Rendimiento
                        </h2>

                        {/* BOTÓN DEL OJITO */}
                        <button
                            onClick={() => setMostrarValores(!mostrarValores)}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-500 p-2 rounded-xl transition"
                            title={mostrarValores ? "Ocultar Valores" : "Mostrar Valores"}
                        >
                            {mostrarValores ? (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0a10.05 10.05 0 015.71-1.29c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0l-3.29-3.29" /></svg>
                            ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            )}
                        </button>
                    </div>

                    <div className="flex flex-col md:flex-row items-end gap-3 mb-6">
                        <div className="w-full">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Desde</label>
                            <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-bold text-gray-800 outline-none focus:border-amber-500 transition" />
                        </div>
                        <div className="w-full">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Hasta</label>
                            <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-bold text-gray-800 outline-none focus:border-amber-500 transition" />
                        </div>

                        <button onClick={() => generarReporteCarteraPDF(prestamosEnRango, fechaDesde, fechaHasta)} className="w-full md:w-auto bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-5 py-3 rounded-xl font-bold flex items-center justify-center transition-colors shadow-sm gap-2 whitespace-nowrap h-[46px] text-xs">
                            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            PDF Fechas
                        </button>
                        <button onClick={() => generarReporteCarteraPDF(todosLosActivos, 'INICIO', 'ACTUALIDAD')} className="w-full md:w-auto bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 px-5 py-3 rounded-xl font-bold flex items-center justify-center transition-colors shadow-sm gap-2 whitespace-nowrap h-[46px] text-xs">
                            <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            Todos Activos
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-center">
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 transition-all">
                            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Capital Total Activo</p>
                            <p className={`text-xl font-black ${mostrarValores ? 'text-neutral-800' : 'text-gray-400'}`}>
                                {mostrarValores ? `$${capitalActivoTotal.toFixed(2)}` : '$ ***.**'}
                            </p>
                        </div>
                        <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 shadow-sm transition-all">
                            <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-1">Ganancia en Fechas</p>
                            <p className={`text-xl font-black ${mostrarValores ? 'text-amber-600' : 'text-amber-300'}`}>
                                {mostrarValores ? `$${interesGanadoRango.toFixed(2)}` : '$ ***.**'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="mt-6 mb-2 relative">
                    <svg className="w-5 h-5 absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <input type="text" placeholder="Buscar cliente..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-full pl-11 p-3 bg-white rounded-xl shadow-sm border border-gray-200 outline-none focus:border-amber-500 font-medium text-sm text-gray-700 transition" />
                </div>

                <div className="space-y-3">
                    {cargando ? (
                        <div className="flex justify-center py-8"><div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div></div>
                    ) : clientesPaginados.length === 0 ? (
                        <div className="bg-white p-6 rounded-2xl shadow-sm text-center border border-gray-100">
                            <p className="text-gray-400 font-medium text-sm">No se encontraron clientes.</p>
                        </div>
                    ) : (
                        clientesPaginados.map((cliente) => (
                            <ClienteAcordeon key={cliente.id} cliente={cliente} setPrestamoSeleccionado={setPrestamoSeleccionado} />
                        ))
                    )}
                </div>

                {totalPaginas > 1 && (
                    <div className="flex items-center justify-between bg-white p-3 rounded-2xl shadow-sm border border-gray-100 mt-4">
                        <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1} className="text-[10px] font-black uppercase tracking-widest px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition">
                            Anterior
                        </button>
                        <span className="text-xs font-bold text-gray-500">Página {pagina} de {totalPaginas}</span>
                        <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas} className="text-[10px] font-black uppercase tracking-widest px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition">
                            Siguiente
                        </button>
                    </div>
                )}
            </div>

            {prestamoSeleccionado && (
                prestamoSeleccionado.tipo_prestamo === 'mensual_interes' ? (
                    <LibretaMensualModal
                        prestamo={prestamoSeleccionado}
                        onClose={() => setPrestamoSeleccionado(null)}
                        onFinalizar={finalizarPrestamo}
                        onUpdate={fetchDatosDashboard}
                    />
                ) : (
                    <CartulinaModal
                        prestamo={prestamoSeleccionado}
                        onClose={() => setPrestamoSeleccionado(null)}
                        onRenovar={renovarPrestamo}
                        onFinalizar={finalizarPrestamo}
                        onUpdate={fetchDatosDashboard}
                    />
                )
            )}
        </div>
    );
}