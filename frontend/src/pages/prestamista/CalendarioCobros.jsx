import { useState, useEffect, useMemo } from 'react';
import supabase from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { generarReporteRutaPDF } from '../../utils/generarPDF';
import CartulinaModal from '../../components/CartulinaModal';
import LibretaInteresAbiertoModal from '../../components/LibretaInteresAbiertoModal';

export default function CalendarioCobros() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const getFechaLocal = (f = new Date()) => {
        return new Date(f.getTime() - f.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    };

    const hoyStr = getFechaLocal();
    const [fecha, setFecha] = useState(hoyStr);
    const [cobradorActivo, setCobradorActivo] = useState('todos');

    const [clientesAgrupados, setClientesAgrupados] = useState(() => {
        try {
            // Actualizado a v7 para limpiar caché y que aparezcan las horas
            const cache = JSON.parse(sessionStorage.getItem('anubis_ruta_diaria_v7'));
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
                    id, valor_cuota, prestamista_id, estado, monto_total, monto_capital, frecuencia, fecha_inicio, cobrador, tipo_prestamo, 
                    clientes ( id, nombre, telefono )
                )
            `)
            .eq('prestamos.prestamista_id', user.id)
            .eq('prestamos.estado', 'activo')
            .eq('prestamos.frecuencia', 'diario')
            .or(`fecha_cobro.eq.${fecha},fecha_pago_real.eq.${fecha}`);

        if (error) console.error("Error al cargar la ruta diaria:", error);

        if (data) {
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

                        // Guardar la hora máxima para ordenar al cliente general
                        if (!mapaClientes[cId].ultimaHoraPago || horaCuota > mapaClientes[cId].ultimaHoraPago) {
                            mapaClientes[cId].ultimaHoraPago = horaCuota;
                        }

                        // Guardar la hora formateada para mostrarla en la UI del préstamo
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
                    if (p.montoIngresadoFisicamenteHoy > 0) p.estadoDisplay = 'pagado';
                    else if (p.tieneCuotaProgramadaHoy && p.estadoDisplay === 'pagado') p.estadoDisplay = 'al_dia';
                });

                const estados = prestamosDelCliente.map(p => p.estadoDisplay);
                let estadoGlobal = 'pendiente';
                if (estados.includes('no_pago')) estadoGlobal = 'no_pago';
                else if (estados.includes('pendiente')) estadoGlobal = 'pendiente';
                else if (estados.every(e => e === 'pagado')) estadoGlobal = 'pagado';
                else if (estados.every(e => e === 'al_dia' || e === 'pagado')) estadoGlobal = 'al_dia';

                return {
                    cliente: clienteData.cliente,
                    listaPrestamos: prestamosDelCliente,
                    estadoGlobal: estadoGlobal,
                    ultimaHoraPago: clienteData.ultimaHoraPago
                };
            });

            setClientesAgrupados(arrayClientes);
            sessionStorage.setItem('anubis_ruta_diaria_v7', JSON.stringify({ fecha: fecha, datos: arrayClientes }));
        }
        setCargando(false);
    };

    const clientesFiltrados = useMemo(() => {
        const filtrados = clientesAgrupados.filter(c => {
            return cobradorActivo === 'todos' || c.listaPrestamos.some(p => (p.prestamoInfo.cobrador || 'principal') === cobradorActivo);
        });

        return filtrados.sort((a, b) => {
            const orden = { 'no_pago': 1, 'pendiente': 2, 'al_dia': 3, 'pagado': 4 };
            const pesoA = orden[a.estadoGlobal] || 2;
            const pesoB = orden[b.estadoGlobal] || 2;

            // 1. Agrupar por estado (Pendientes arriba, Pagados abajo)
            if (pesoA !== pesoB) return pesoA - pesoB;

            // 2. Orden Cronológico para los pagados (el último que pagó se pone arriba del bloque de pagados)
            if (pesoA === 4 && a.ultimaHoraPago && b.ultimaHoraPago) {
                return b.ultimaHoraPago - a.ultimaHoraPago;
            }

            // 3. Orden alfabético
            return a.cliente.nombre.localeCompare(b.cliente.nombre);
        });
    }, [clientesAgrupados, cobradorActivo]);

    let totalEsperado = 0;
    let totalCobrado = 0;
    clientesFiltrados.forEach(c => {
        c.listaPrestamos.forEach(p => {
            if (p.tieneCuotaProgramadaHoy) totalEsperado += Number(p.prestamoInfo.valor_cuota);
            totalCobrado += p.montoIngresadoFisicamenteHoy;
        });
    });

    const descargarPDF = () => {
        const tituloSecundario = cobradorActivo === 'todos' ? 'Global' : cobradorActivo === 'ayudante' ? 'Ayudante' : 'Mis Cobros';

        const datosParaPDF = [];
        clientesFiltrados.forEach(c => {
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
            frecuencia: pInfo.frecuencia,
            fecha_inicio: pInfo.fecha_inicio,
            estado: pInfo.estado,
            valor_cuota: pInfo.valor_cuota,
            cliente_id: pInfo.clientes.id,
            clientes: pInfo.clientes,
            cobrador: pInfo.cobrador,
            tipo_prestamo: pInfo.tipo_prestamo
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

                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>

                    <div className="flex flex-col gap-3 mb-4">
                        <select value={cobradorActivo} onChange={(e) => setCobradorActivo(e.target.value)} className="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl p-3 outline-none font-bold text-sm focus:border-amber-500 transition">
                            <option value="todos">Ver Ruta Completa (Yo + Ayudante)</option>
                            <option value="principal">Solo Mis Cobros</option>
                            <option value="ayudante">Solo Cobros del Ayudante</option>
                        </select>

                        <div className="flex gap-2">
                            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl p-3 outline-none font-bold focus:border-amber-500 transition" />
                            <button onClick={descargarPDF} className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 rounded-xl font-bold flex items-center justify-center transition-colors shadow-sm gap-2">
                                <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                PDF
                            </button>
                        </div>
                    </div>

                    <div className="flex justify-between text-sm border-t border-gray-100 pt-4">
                        <div>
                            <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Esperado Hoy</p>
                            <p className="font-black text-xl text-neutral-800">${totalEsperado.toFixed(2)}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-amber-500 font-bold uppercase text-[10px] tracking-widest">Cobrado Hoy</p>
                            <p className="font-black text-xl text-amber-500">${totalCobrado.toFixed(2)}</p>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    {cargando ? (
                        <div className="flex justify-center py-8"><div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div></div>
                    ) : clientesFiltrados.length === 0 ? (
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center">
                            <p className="text-gray-400 font-medium">No hay cobros diarios para esta fecha.</p>
                        </div>
                    ) : (
                        clientesFiltrados.map((item) => (
                            <div key={item.cliente.id} className={`bg-white p-4 rounded-2xl shadow-sm border-l-4 transition-all hover:shadow-md ${item.estadoGlobal === 'pagado' ? 'border-l-green-500 opacity-80' :
                                item.estadoGlobal === 'no_pago' ? 'border-l-red-500' :
                                    item.estadoGlobal === 'al_dia' ? 'border-l-blue-400 opacity-90' : 'border-l-amber-400'
                                }`}>
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <h2 className="font-bold text-gray-800 text-lg leading-tight">{item.cliente.nombre}</h2>
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
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] font-bold text-gray-500">
                                                        Cuota: ${p.prestamoInfo.valor_cuota}
                                                    </span>
                                                    {p.prestamoInfo.cobrador === 'ayudante' && (
                                                        <span className="text-[8px] font-black uppercase bg-neutral-200 text-neutral-600 px-1.5 py-0.5 rounded">Ayud.</span>
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