import { useState, useEffect, useMemo } from 'react';
import supabase from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import CartulinaModal from '../../components/CartulinaModal';
import LibretaInteresAbiertoModal from '../../components/LibretaInteresAbiertoModal';
import ClienteAcordeon from '../../components/ClienteAcordeon';
import { generarReporteCarteraPDF } from '../../utils/generarReporteCarteraPDF';
import { generarReporteCajaPDF } from '../../utils/generarReporteCajaPDF';
import { generarReporteGananciasPDF } from '../../utils/generarReporteGananciasPDF';
import {
    calcularEstadoCapitalCuotaFija,
    desglosarPagosCuotaFija
} from '../../utils/finanzasCalculos';

const ACORDEONES_POR_PAGINA = 15;

// Descarga todas las filas en lotes de 1000 para evitar el límite por defecto de Supabase
async function fetchAllRows(buildQuery) {
    const pageSize = 1000;
    let from = 0;
    let allData = [];

    while (true) {
        const { data, error } = await buildQuery().range(from, from + pageSize - 1);
        if (error || !data) break;
        allData = allData.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
    }

    return allData;
}

export default function ListaPrestamos() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const hoy = new Date();
    const getFechaLocal = (f = new Date()) =>
        new Date(f.getTime() - f.getTimezoneOffset() * 60000).toISOString().split('T')[0];

    const primerDiaMes = getFechaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    const hoyStr = getFechaLocal(hoy);

    const [fechaDesde, setFechaDesde] = useState(primerDiaMes);
    const [fechaHasta, setFechaHasta] = useState(hoyStr);
    const [busqueda, setBusqueda] = useState('');
    const [pagina, setPagina] = useState(1);
    const [mostrarValores, setMostrarValores] = useState(false);

    const [prestamos, setPrestamos] = useState(() => {
        try { return JSON.parse(sessionStorage.getItem('anubis_prestamos_v3')) || []; } catch { return []; }
    });
    const [pagosLiquidados, setPagosLiquidados] = useState(() => {
        try { return JSON.parse(sessionStorage.getItem('anubis_pagos_liquidados_v3')) || []; } catch { return []; }
    });
    const [movimientosLibreta, setMovimientosLibreta] = useState(() => {
        try { return JSON.parse(sessionStorage.getItem('anubis_movimientos_v3')) || []; } catch { return []; }
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
    }, [user]);

    const fetchDatosDashboard = async () => {
        setCargando(true);

        const [dataPrestamos, dataPagos, dataMovimientos] = await Promise.all([
            fetchAllRows(() =>
                supabase
                    .from('prestamos')
                    .select(`
                        id, monto_capital, interes_total, monto_total, saldo_pendiente, 
                        frecuencia, valor_cuota, fecha_inicio, estado, cliente_id, tipo_prestamo, cobrador, es_capital_ajeno,
                        clientes ( id, nombre, telefono )
                    `)
                    .eq('prestamista_id', user.id)
                    .order('fecha_registro', { ascending: false })
            ),
            fetchAllRows(() =>
                supabase
                    .from('historial_pagos')
                    .select(`
                        id, prestamo_id, fecha_cobro, fecha_pago_real, monto_recibido, estado_cobro,
                        prestamos!inner ( prestamista_id )
                    `)
                    .eq('prestamos.prestamista_id', user.id)
                    .in('estado_cobro', ['pagado', 'renovado'])
            ),
            fetchAllRows(() =>
                supabase
                    .from('movimientos_mensuales')
                    .select(`
                        id, prestamo_id, fecha, tipo, monto,
                        prestamos!inner ( prestamista_id, es_capital_ajeno )
                    `)
                    .eq('prestamos.prestamista_id', user.id)
                    .in('tipo', ['pago_interes', 'abono_capital'])
            )
        ]);

        setPrestamos(dataPrestamos);
        sessionStorage.setItem('anubis_prestamos_v3', JSON.stringify(dataPrestamos));

        setPagosLiquidados(dataPagos);
        sessionStorage.setItem('anubis_pagos_liquidados_v3', JSON.stringify(dataPagos));

        setMovimientosLibreta(dataMovimientos);
        sessionStorage.setItem('anubis_movimientos_v3', JSON.stringify(dataMovimientos));

        setCargando(false);
    };

    const pagosPorPrestamo = useMemo(() => {
        const mapa = {};
        pagosLiquidados.forEach(pago => {
            if (!mapa[pago.prestamo_id]) mapa[pago.prestamo_id] = [];
            mapa[pago.prestamo_id].push(pago);
        });
        return mapa;
    }, [pagosLiquidados]);

    const prestamosEnRango = useMemo(() => {
        return prestamos.filter(p => p.fecha_inicio >= fechaDesde && p.fecha_inicio <= fechaHasta);
    }, [prestamos, fechaDesde, fechaHasta]);

    const todosLosActivos = useMemo(() => {
        return prestamos.filter(p => p.estado === 'activo');
    }, [prestamos]);

    const resumenFinanciero = useMemo(() => {
        let capitalEnCallePropio = 0;
        let cajaDisponibleAutomatica = 0;
        let gananciaTotalRango = 0;

        prestamos.forEach(p => {
            const esAjeno = Boolean(p.es_capital_ajeno);
            if (esAjeno) return;

            if (p.tipo_prestamo === 'mensual_interes') {
                if (p.estado === 'activo') {
                    capitalEnCallePropio += Math.max(0, Number(p.monto_capital || 0));
                }
            } else {
                const cuotasDelPrestamo = pagosPorPrestamo[p.id] || [];
                const estadoCap = calcularEstadoCapitalCuotaFija(p, cuotasDelPrestamo);

                if (p.estado === 'activo') {
                    capitalEnCallePropio += estadoCap.capitalEnCalle;
                    cajaDisponibleAutomatica += estadoCap.capitalRecuperado;
                }

                const desglose = desglosarPagosCuotaFija(p, cuotasDelPrestamo);
                desglose.forEach(item => {
                    if (item.fecha >= fechaDesde && item.fecha <= fechaHasta) {
                        gananciaTotalRango += item.parteGanancia;
                    }
                });
            }
        });

        movimientosLibreta.forEach(mov => {
            const esAjeno = Boolean(mov.prestamos?.es_capital_ajeno);
            if (esAjeno) return;

            if (mov.tipo === 'pago_interes' && mov.fecha >= fechaDesde && mov.fecha <= fechaHasta) {
                gananciaTotalRango += Number(mov.monto || 0);
            }
        });

        return {
            capitalEnCallePropio,
            cajaDisponible: cajaDisponibleAutomatica,
            gananciaRango: gananciaTotalRango
        };
    }, [prestamos, pagosPorPrestamo, movimientosLibreta, fechaDesde, fechaHasta]);

    const clientesAgrupados = useMemo(() => {
        const mapa = {};
        prestamos.forEach(p => {
            if (!p.clientes) return;
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
        await supabase.from('prestamos').update({ estado: 'completado', saldo_pendiente: 0, fecha_cierre: hoyStr }).eq('id', prestamoSeleccionado.id);

        if (prestamoSeleccionado.tipo_prestamo === 'cuota_fija') {
            await supabase.from('historial_pagos').update({
                estado_cobro: 'pagado',
                monto_recibido: prestamoSeleccionado.valor_cuota,
                fecha_pago_real: hoyStr
            })
                .eq('prestamo_id', prestamoSeleccionado.id)
                .in('estado_cobro', ['pendiente', 'no_pago']);
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

                        <div className="flex flex-wrap w-full md:w-auto gap-2">
                            <button onClick={() => generarReporteCarteraPDF(prestamosEnRango.filter(p => !p.es_capital_ajeno), fechaDesde, fechaHasta)} className="flex-1 md:flex-none bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-3 rounded-xl font-bold flex items-center justify-center transition-colors shadow-sm gap-1.5 h-[46px] text-[11px]" title="Préstamos creados en estas fechas (Sin Ajeno)">
                                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                Cartera
                            </button>

                            <button onClick={() => generarReporteCajaPDF(fechaDesde, fechaHasta)} className="flex-1 md:flex-none bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 px-4 py-3 rounded-xl font-bold flex items-center justify-center transition-colors shadow-sm gap-1.5 h-[46px] text-[11px]" title="Todo el dinero físico ingresado">
                                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                                Caja
                            </button>

                            <button onClick={() => generarReporteGananciasPDF(fechaDesde, fechaHasta)} className="flex-1 md:flex-none bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 px-4 py-3 rounded-xl font-bold flex items-center justify-center transition-colors shadow-sm gap-1.5 h-[46px] text-[11px]" title="Solo el interés neto ganado">
                                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Ganancia
                            </button>

                            <button onClick={() => generarReporteCarteraPDF(todosLosActivos.filter(p => !p.es_capital_ajeno), 'INICIO', 'ACTUALIDAD')} className="flex-1 md:flex-none bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 px-4 py-3 rounded-xl font-bold flex items-center justify-center transition-colors shadow-sm gap-1.5 h-[46px] text-[11px]" title="Préstamos activos globales (Sin Ajeno)">
                                <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                                Activos
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 transition-all">
                            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Capital en Calle</p>
                            <p className={`text-xl font-black ${mostrarValores ? 'text-neutral-800' : 'text-gray-400'}`}>
                                {mostrarValores ? `$${resumenFinanciero.capitalEnCallePropio.toFixed(2)}` : '$ ***.**'}
                            </p>
                            <span className="block text-[9px] font-bold text-gray-400 mt-1">Por recuperar</span>
                        </div>

                        <div className="bg-blue-50/70 p-4 rounded-xl border border-blue-200 transition-all">
                            <p className="text-[9px] font-black text-blue-700 uppercase tracking-widest mb-1">Caja Disponible</p>
                            <p className={`text-xl font-black ${mostrarValores ? 'text-blue-900' : 'text-blue-300'}`}>
                                {mostrarValores ? `$${resumenFinanciero.cajaDisponible.toFixed(2)}` : '$ ***.**'}
                            </p>
                            <span className="block text-[9px] font-bold text-blue-600 mt-1">Capital recuperado</span>
                        </div>

                        <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 shadow-sm transition-all">
                            <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-1">Ganancia en Fechas</p>
                            <p className={`text-xl font-black ${mostrarValores ? 'text-amber-600' : 'text-amber-300'}`}>
                                {mostrarValores ? `$${resumenFinanciero.gananciaRango.toFixed(2)}` : '$ ***.**'}
                            </p>
                            <span className="block text-[9px] font-bold text-amber-600/80 mt-1">Utilidad liberada</span>
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
                    <LibretaInteresAbiertoModal
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
                        fechaDesde={fechaDesde}
                        fechaHasta={fechaHasta}
                    />
                )
            )}
        </div>
    );
}