import { useState, useEffect, useMemo } from 'react';
import supabase from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { generarReporteRutaPDF } from '../../utils/generarReporteRutaPDF';
import CartulinaModal from '../../components/CartulinaModal';
import LibretaInteresAbiertoModal from '../../components/LibretaInteresAbiertoModal';
import { desglosarPagosCuotaFija } from '../../utils/finanzasCalculos';

export default function CalendarioCobros() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const getFechaLocal = (f = new Date()) => {
        return new Date(f.getTime() - f.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    };

    const hoyStr = getFechaLocal();
    const [fecha, setFecha] = useState(hoyStr);
    const [cobradorActivo, setCobradorActivo] = useState('todos');
    const [busqueda, setBusqueda] = useState('');

    const [clientesAgrupados, setClientesAgrupados] = useState(() => {
        try {
            const cache = JSON.parse(sessionStorage.getItem('anubis_ruta_diaria_v9'));
            if (cache && cache.fecha === hoyStr) return cache.datos;
            return [];
        } catch { return []; }
    });

    const [cargando, setCargando] = useState(clientesAgrupados.length === 0);
    const [prestamoSeleccionado, setPrestamoSeleccionado] = useState(null);

    useEffect(() => {
        if (user?.id) fetchPagos();
    }, [user, fecha]);

    const fetchPagos = async () => {
        if (clientesAgrupados.length === 0) setCargando(true);

        const { data, error } = await supabase
            .from('historial_pagos')
            .select(`
                id, fecha_cobro, estado_cobro, monto_recibido, notas, fecha_pago_real, fecha_registro,
                prestamos!inner (
                    id, valor_cuota, prestamista_id, estado, monto_total, monto_capital, interes_total, frecuencia, fecha_inicio, cobrador, tipo_prestamo, es_capital_ajeno,
                    clientes ( id, nombre, telefono )
                )
            `)
            .eq('prestamos.prestamista_id', user.id)
            .eq('prestamos.estado', 'activo')
            .eq('prestamos.frecuencia', 'diario')
            .or(`fecha_cobro.eq.${fecha},fecha_pago_real.eq.${fecha}`);

        if (error) console.error("Error al cargar la ruta diaria:", error);

        if (data) {
            // Obtener el historial liquidado completo de los préstamos en ruta para separar Caja vs Ganancia con exactitud
            const prestamoIds = [...new Set(data.map(c => c.prestamos.id))];
            const historialPorPrestamo = {};

            if (prestamoIds.length > 0) {
                const { data: cuotasLiquidadas } = await supabase
                    .from('historial_pagos')
                    .select('id, prestamo_id, fecha_cobro, fecha_pago_real, monto_recibido, estado_cobro')
                    .in('prestamo_id', prestamoIds)
                    .in('estado_cobro', ['pagado', 'renovado'])
                    .range(0, 9999);

                if (cuotasLiquidadas) {
                    cuotasLiquidadas.forEach(c => {
                        if (!historialPorPrestamo[c.prestamo_id]) historialPorPrestamo[c.prestamo_id] = [];
                        historialPorPrestamo[c.prestamo_id].push(c);
                    });
                }
            }

            const mapaClientes = {};

            data.forEach(cuota => {
                const cliente = cuota.prestamos.clientes;
                const cId = cliente.id;
                const pId = cuota.prestamos.id;

                if (!mapaClientes[cId]) {
                    mapaClientes[cId] = {
                        cliente: cliente,
                        prestamosMap: {},
                        ultimaHoraPago: null
                    };
                }

                if (!mapaClientes[cId].prestamosMap[pId]) {
                    mapaClientes[cId].prestamosMap[pId] = {
                        prestamoInfo: cuota.prestamos,
                        montoIngresadoFisicamenteHoy: 0,
                        cajaHoy: 0,
                        gananciaHoy: 0,
                        cuotasPagadasHoy: 0,
                        tieneCuotaProgramadaHoy: false,
                        estadoDisplay: 'pendiente',
                        horaFormateada: null,
                        horaPagoMs: 0
                    };
                }

                const itemPrestamo = mapaClientes[cId].prestamosMap[pId];

                if (cuota.fecha_cobro === fecha) {
                    itemPrestamo.tieneCuotaProgramadaHoy = true;
                    itemPrestamo.estadoDisplay = cuota.estado_cobro;
                }

                if (cuota.fecha_pago_real === fecha && cuota.estado_cobro === 'pagado') {
                    itemPrestamo.montoIngresadoFisicamenteHoy += Number(cuota.monto_recibido || cuota.prestamos.valor_cuota);
                    itemPrestamo.cuotasPagadasHoy += 1;

                    if (cuota.fecha_registro) {
                        const fechaObj = new Date(cuota.fecha_registro);
                        const horaCuota = fechaObj.getTime();

                        if (!mapaClientes[cId].ultimaHoraPago || horaCuota > mapaClientes[cId].ultimaHoraPago) {
                            mapaClientes[cId].ultimaHoraPago = horaCuota;
                        }

                        if (horaCuota > itemPrestamo.horaPagoMs) {
                            itemPrestamo.horaPagoMs = horaCuota;
                            itemPrestamo.horaFormateada = fechaObj.toLocaleTimeString('es-EC', { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', hour12: true });
                        }
                    }
                }
            });

            const arrayClientes = Object.values(mapaClientes).map(clienteData => {
                const prestamosDelCliente = Object.values(clienteData.prestamosMap);

                prestamosDelCliente.forEach(p => {
                    if (p.montoIngresadoFisicamenteHoy > 0) {
                        p.estadoDisplay = 'pagado';

                        if (!p.prestamoInfo.es_capital_ajeno) {
                            const historialCompleto = historialPorPrestamo[p.prestamoInfo.id] || [];
                            const desglose = desglosarPagosCuotaFija(p.prestamoInfo, historialCompleto);
                            const movimientosHoy = desglose.filter(d => d.fecha === fecha && !d.esRenovacion);

                            p.cajaHoy = movimientosHoy.reduce((sum, d) => sum + d.parteCapital, 0);
                            p.gananciaHoy = movimientosHoy.reduce((sum, d) => sum + d.parteGanancia, 0);
                        }
                    } else if (p.tieneCuotaProgramadaHoy && p.estadoDisplay === 'pagado') {
                        p.estadoDisplay = 'al_dia';
                    }
                });

                const estados = prestamosDelCliente.map(p => p.estadoDisplay);
                let estadoGlobal = 'pendiente';
                if (estados.includes('no_pago')) estadoGlobal = 'no_pago';
                else if (estados.includes('pendiente')) estadoGlobal = 'pendiente';
                else if (estados.every(e => e === 'pagado')) estadoGlobal = 'pagado';
                else if (estados.every(e => e === 'al_dia' || e === 'pagado')) estadoGlobal = 'al_dia';

                const tieneCapitalAjeno = prestamosDelCliente.some(p => p.prestamoInfo.es_capital_ajeno);

                return {
                    cliente: clienteData.cliente,
                    listaPrestamos: prestamosDelCliente,
                    estadoGlobal: estadoGlobal,
                    ultimaHoraPago: clienteData.ultimaHoraPago,
                    tieneCapitalAjeno: tieneCapitalAjeno
                };
            });

            setClientesAgrupados(arrayClientes);
            sessionStorage.setItem('anubis_ruta_diaria_v9', JSON.stringify({ fecha: fecha, datos: arrayClientes }));
        }
        setCargando(false);
    };

    const normalizarTexto = (txt = '') =>
        txt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    const clientesPorCobrador = useMemo(() => {
        return clientesAgrupados.filter(c => {
            return cobradorActivo === 'todos' || c.listaPrestamos.some(p => (p.prestamoInfo.cobrador || 'principal') === cobradorActivo);
        });
    }, [clientesAgrupados, cobradorActivo]);

    const clientesFiltrados = useMemo(() => {
        const termino = normalizarTexto(busqueda);

        const filtrados = termino
            ? clientesPorCobrador.filter(c =>
                normalizarTexto(c.cliente.nombre).includes(termino) ||
                (c.cliente.telefono && c.cliente.telefono.includes(termino))
            )
            : clientesPorCobrador;

        return [...filtrados].sort((a, b) => {
            const orden = { 'no_pago': 1, 'pendiente': 2, 'al_dia': 3, 'pagado': 4 };
            const pesoA = orden[a.estadoGlobal] || 2;
            const pesoB = orden[b.estadoGlobal] || 2;

            if (pesoA !== pesoB) return pesoA - pesoB;

            if (pesoA === 4 && a.ultimaHoraPago && b.ultimaHoraPago) {
                return b.ultimaHoraPago - a.ultimaHoraPago;
            }

            return a.cliente.nombre.localeCompare(b.cliente.nombre);
        });
    }, [clientesPorCobrador, busqueda]);

    // Totales de la ruta del cobrador seleccionado: Esperado, Cobrado, Caja (Capital) y Ganancia
    const { totalEsperado, totalCobrado, totalCajaHoy, totalGananciaHoy } = useMemo(() => {
        let esperado = 0;
        let cobrado = 0;
        let caja = 0;
        let ganancia = 0;

        clientesPorCobrador.forEach(c => {
            c.listaPrestamos.forEach(p => {
                if (cobradorActivo !== 'todos' && (p.prestamoInfo.cobrador || 'principal') !== cobradorActivo) {
                    return;
                }
                if (p.tieneCuotaProgramadaHoy) esperado += Number(p.prestamoInfo.valor_cuota);
                cobrado += p.montoIngresadoFisicamenteHoy;
                caja += Number(p.cajaHoy || 0);
                ganancia += Number(p.gananciaHoy || 0);
            });
        });

        return {
            totalEsperado: esperado,
            totalCobrado: cobrado,
            totalCajaHoy: caja,
            totalGananciaHoy: ganancia
        };
    }, [clientesPorCobrador, cobradorActivo]);

    const descargarPDF = () => {
        const tituloSecundario = cobradorActivo === 'todos' ? 'Global' : cobradorActivo === 'ayudante' ? 'Ayudante' : 'Mis Cobros';

        const datosParaPDF = [];
        clientesPorCobrador.forEach(c => {
            c.listaPrestamos.forEach(p => {
                datosParaPDF.push({
                    prestamos: p.prestamoInfo,
                    estado_cobro: p.estadoDisplay,
                    monto_recibido: p.montoIngresadoFisicamenteHoy || p.prestamoInfo.valor_cuota
                });
            });
        });

        generarReporteRutaPDF(datosParaPDF, `${fecha} (DIARIO - ${tituloSecundario})`, totalEsperado, totalCobrado);
    };

    const abrirCartulina = (pInfo) => {
        const prestamoFormateado = {
            id: pInfo.id,
            monto_total: pInfo.monto_total,
            monto_capital: pInfo.monto_capital || pInfo.monto_total,
            interes_total: pInfo.interes_total || 0,
            frecuencia: pInfo.frecuencia,
            fecha_inicio: pInfo.fecha_inicio,
            estado: pInfo.estado,
            valor_cuota: pInfo.valor_cuota,
            cliente_id: pInfo.clientes.id,
            clientes: pInfo.clientes,
            cobrador: pInfo.cobrador,
            tipo_prestamo: pInfo.tipo_prestamo,
            es_capital_ajeno: pInfo.es_capital_ajeno
        };
        setPrestamoSeleccionado(prestamoFormateado);
    };

    const renovarPrestamo = (clienteId, prestamoId) => navigate('/nuevo-prestamo', { state: { preselectClienteId: clienteId, prestamoARenovar: prestamoId } });

    const finalizarPrestamo = async () => {
        await supabase.from('prestamos').update({ estado: 'completado', saldo_pendiente: 0, fecha_cierre: fecha }).eq('id', prestamoSeleccionado.id);

        await supabase.from('historial_pagos').update({
            estado_cobro: 'pagado',
            monto_recibido: prestamoSeleccionado.valor_cuota,
            fecha_pago_real: fecha
        }).eq('prestamo_id', prestamoSeleccionado.id).in('estado_cobro', ['pendiente', 'no_pago']);

        setPrestamoSeleccionado(null);
        fetchPagos();
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4 pb-20 overflow-x-hidden w-full font-sans">
            <div className="max-w-2xl mx-auto space-y-4">

                <div className="flex items-center justify-between mb-2">
                    <Link to="/dashboard" className="text-neutral-400 hover:text-amber-600 transition flex items-center gap-1 font-bold text-xs uppercase tracking-widest">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Volver
                    </Link>
                    <h1 className="text-xl font-black text-neutral-900 tracking-widest uppercase">Ruta Diaria</h1>
                </div>

                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>

                    <div className="flex flex-col gap-2.5 mb-3">
                        <select value={cobradorActivo} onChange={(e) => setCobradorActivo(e.target.value)} className="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl px-3 py-2.5 outline-none font-bold text-sm focus:border-amber-500 transition">
                            <option value="todos">Ver Ruta Completa (Yo + Ayudante)</option>
                            <option value="principal">Solo Mis Cobros</option>
                            <option value="ayudante">Solo Cobros del Ayudante</option>
                        </select>

                        <div className="flex gap-2">
                            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl px-3 py-2.5 outline-none font-bold text-sm focus:border-amber-500 transition" />
                            <button onClick={descargarPDF} className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 rounded-xl font-bold text-sm flex items-center justify-center transition-colors shadow-sm gap-1.5">
                                <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                PDF
                            </button>
                        </div>

                        <div className="relative">
                            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                            </svg>
                            <input
                                type="text"
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                                placeholder="Buscar cliente en la ruta..."
                                className="w-full bg-gray-50/80 border border-gray-200/80 text-gray-800 placeholder-gray-400 rounded-xl pl-9 pr-8 py-2 text-xs font-semibold outline-none focus:bg-white focus:border-amber-500 transition"
                            />
                            {busqueda && (
                                <button
                                    type="button"
                                    onClick={() => setBusqueda('')}
                                    aria-label="Limpiar búsqueda"
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-xs font-black p-1"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-between text-sm border-t border-gray-100 pt-3">
                        <div>
                            <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Esperado Hoy</p>
                            <p className="font-black text-xl text-neutral-800">${totalEsperado.toFixed(2)}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-amber-500 font-bold uppercase text-[10px] tracking-widest">Cobrado Hoy</p>
                            <p className="font-black text-xl text-amber-500">${totalCobrado.toFixed(2)}</p>
                        </div>
                    </div>

                    {/* Desglose automático de lo cobrado hoy: Caja (Capital) vs Ganancia */}
                    <div className="grid grid-cols-2 gap-2.5 mt-3 pt-3 border-t border-gray-100">
                        <div className="bg-blue-50/80 border border-blue-200/80 rounded-xl p-2.5 flex items-center justify-between">
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-widest text-blue-700">Para Caja</p>
                                <span className="block text-[9px] font-semibold text-blue-600/80">Capital recuperado</span>
                            </div>
                            <p className="font-black text-base text-blue-900">${totalCajaHoy.toFixed(2)}</p>
                        </div>

                        <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-xl p-2.5 flex items-center justify-between">
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Para Ganancia</p>
                                <span className="block text-[9px] font-semibold text-emerald-600/80">Utilidad libre</span>
                            </div>
                            <p className="font-black text-base text-emerald-700">+${totalGananciaHoy.toFixed(2)}</p>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    {cargando ? (
                        <div className="flex justify-center py-8"><div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div></div>
                    ) : clientesFiltrados.length === 0 ? (
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center">
                            <p className="text-gray-400 font-medium">
                                {busqueda ? `No se encontró ningún cliente para "${busqueda}".` : 'No hay cobros diarios para esta fecha.'}
                            </p>
                        </div>
                    ) : (
                        clientesFiltrados.map((item) => (
                            <div key={item.cliente.id} className={`bg-white p-4 rounded-2xl shadow-sm border-l-4 transition-all hover:shadow-md ${item.estadoGlobal === 'pagado' ? 'border-l-green-500 opacity-80' :
                                item.estadoGlobal === 'no_pago' ? 'border-l-red-500' :
                                    item.estadoGlobal === 'al_dia' ? 'border-l-blue-400 opacity-90' : 'border-l-amber-400'
                                }`}>
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <h2 className={`font-bold text-lg leading-tight ${item.tieneCapitalAjeno ? 'text-purple-800' : 'text-gray-800'}`}>
                                            {item.cliente.nombre}
                                        </h2>
                                        <p className="text-[11px] font-bold text-gray-400 flex items-center gap-1 mt-1">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                            {item.cliente.telefono || 'Sin número'}
                                        </p>
                                    </div>
                                    <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md ${item.estadoGlobal === 'pagado' ? 'bg-green-50 text-green-600 border border-green-200' :
                                        item.estadoGlobal === 'no_pago' ? 'bg-red-50 text-red-600 border border-red-200' :
                                            item.estadoGlobal === 'al_dia' ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-amber-50 text-amber-600 border border-amber-200'
                                        }`}>
                                        {item.estadoGlobal === 'pagado' ? '✓ Cobrado' : item.estadoGlobal === 'no_pago' ? '✗ Atrasado' : item.estadoGlobal === 'al_dia' ? 'Al Día' : 'Pendiente'}
                                    </span>
                                </div>

                                <div className="space-y-2 border-t border-gray-100 pt-3">
                                    {item.listaPrestamos.map(p => (
                                        <div key={p.prestamoInfo.id} className="flex justify-between items-center bg-gray-50/70 p-2.5 rounded-lg border border-gray-100">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black text-gray-700">Crédito ${p.prestamoInfo.monto_total}</span>
                                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                    <span className="text-[10px] font-bold text-gray-500">
                                                        Cuota: ${p.prestamoInfo.valor_cuota}
                                                    </span>
                                                    {p.prestamoInfo.cobrador === 'ayudante' && (
                                                        <span className="text-[8px] font-black uppercase bg-neutral-200 text-neutral-600 px-1.5 py-0.5 rounded">Ayud.</span>
                                                    )}
                                                    {p.prestamoInfo.es_capital_ajeno && (
                                                        <span className="text-[8px] font-black uppercase bg-purple-100 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded shadow-sm">A</span>
                                                    )}
                                                    {!p.prestamoInfo.es_capital_ajeno && p.montoIngresadoFisicamenteHoy > 0 && (
                                                        <>
                                                            {p.cajaHoy > 0 && (
                                                                <span className="text-[8px] font-black uppercase bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                                                                    Caja: ${p.cajaHoy.toFixed(2)}
                                                                </span>
                                                            )}
                                                            {p.gananciaHoy > 0 && (
                                                                <span className="text-[8px] font-black uppercase bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                                                                    Ganancia: +${p.gananciaHoy.toFixed(2)}
                                                                </span>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                {p.estadoDisplay === 'pagado' && (
                                                    <div className="text-right flex flex-col items-end">
                                                        <span className="font-black text-green-600 text-sm">
                                                            ${p.montoIngresadoFisicamenteHoy > 0 ? p.montoIngresadoFisicamenteHoy.toFixed(2) : Number(p.prestamoInfo.valor_cuota).toFixed(2)}
                                                        </span>
                                                        {p.horaFormateada && (
                                                            <span className="text-[8px] font-bold text-gray-400 mt-0.5 flex items-center gap-0.5">
                                                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                                {p.horaFormateada}
                                                            </span>
                                                        )}
                                                        {p.cuotasPagadasHoy > 1 && <span className="block text-[8px] font-black text-green-700 uppercase mt-0.5">{p.cuotasPagadasHoy} cuotas</span>}
                                                    </div>
                                                )}
                                                <button
                                                    onClick={() => abrirCartulina(p.prestamoInfo)}
                                                    className="bg-white text-amber-700 hover:bg-amber-50 font-black tracking-widest uppercase text-[9px] px-3 py-1.5 rounded transition-colors border border-amber-200 shadow-sm"
                                                >
                                                    Abrir
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {prestamoSeleccionado && (
                prestamoSeleccionado.tipo_prestamo === 'mensual_interes' ? (
                    <LibretaInteresAbiertoModal
                        prestamo={prestamoSeleccionado}
                        onClose={() => setPrestamoSeleccionado(null)}
                        onRenovar={renovarPrestamo}
                        onFinalizar={finalizarPrestamo}
                        onUpdate={fetchPagos}
                    />
                ) : (
                    <CartulinaModal
                        prestamo={prestamoSeleccionado}
                        onClose={() => setPrestamoSeleccionado(null)}
                        onRenovar={renovarPrestamo}
                        onFinalizar={finalizarPrestamo}
                        onUpdate={fetchPagos}
                        fechaRuta={fecha}
                    />
                )
            )}
        </div>
    );
}