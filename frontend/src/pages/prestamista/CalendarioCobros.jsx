import { useState, useEffect, useMemo } from 'react';
import supabase from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { generarReporteRutaPDF } from '../../utils/generarPDF';
import CartulinaModal from '../../components/CartulinaModal';
import LibretaMensualModal from '../../components/LibretaMensualModal';

export default function CalendarioCobros() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const getFechaLocal = (f = new Date()) => {
        return new Date(f.getTime() - f.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    };

    const hoyStr = getFechaLocal();
    const [fecha, setFecha] = useState(hoyStr);
    const [cobradorActivo, setCobradorActivo] = useState('todos');

    const [pagos, setPagos] = useState(() => {
        try {
            const cache = JSON.parse(sessionStorage.getItem('anubis_ruta_diaria_v3'));
            if (cache && cache.fecha === hoyStr) return cache.datos;
            return [];
        } catch { return []; }
    });

    const [cargando, setCargando] = useState(pagos.length === 0);
    const [prestamoSeleccionado, setPrestamoSeleccionado] = useState(null);

    useEffect(() => {
        if (user?.id) fetchPagos();
    }, [user, fecha]);

    const fetchPagos = async () => {
        if (pagos.length === 0) setCargando(true);

        const { data } = await supabase
            .from('historial_pagos')
            .select(`
                id, fecha_cobro, estado_cobro, monto_recibido, notas, fecha_pago_real,
                prestamos!inner (
                    id, valor_cuota, prestamista_id, estado, monto_total, monto_capital, frecuencia, fecha_inicio, cobrador, tipo_prestamo, 
                    clientes ( id, nombre, telefono )
                )
            `)
            .eq('prestamos.prestamista_id', user.id)
            .eq('prestamos.estado', 'activo')
            .eq('prestamos.frecuencia', 'diario')
            .or(`fecha_cobro.eq.${fecha},fecha_pago_real.eq.${fecha}`);

        if (data) {
            const mapa = {};

            data.forEach(cuota => {
                const pId = cuota.prestamos.id;

                if (!mapa[pId]) {
                    mapa[pId] = {
                        prestamo: cuota.prestamos,
                        montoIngresadoFisicamenteHoy: 0,
                        cuotasPagadasHoy: 0,
                        tieneCuotaProgramadaHoy: false,
                        estadoDisplay: 'pendiente'
                    };
                }

                // Si la cuota tocaba pagar hoy
                if (cuota.fecha_cobro === fecha) {
                    mapa[pId].tieneCuotaProgramadaHoy = true;
                    mapa[pId].estadoDisplay = cuota.estado_cobro; // Puede venir como 'pendiente', 'pagado' o 'no_pago'
                }

                // Si la cuota se pagó físicamente hoy (sin importar de qué día era)
                if (cuota.fecha_pago_real === fecha && cuota.estado_cobro === 'pagado') {
                    mapa[pId].montoIngresadoFisicamenteHoy += Number(cuota.monto_recibido || cuota.prestamos.valor_cuota);
                    mapa[pId].cuotasPagadasHoy += 1;
                }
            });

            // Lógica exacta de visualización
            Object.values(mapa).forEach(item => {
                if (item.montoIngresadoFisicamenteHoy > 0) {
                    // Si entró dinero físico hoy, es un pago del día
                    item.estadoDisplay = 'pagado';
                } else if (item.tieneCuotaProgramadaHoy && item.estadoDisplay === 'pagado') {
                    // Si NO entró dinero hoy, pero su cuota de hoy ya estaba pagada (por adelantado)
                    item.estadoDisplay = 'al_dia';
                }
            });

            const datosAgrupados = Object.values(mapa);
            setPagos(datosAgrupados);
            sessionStorage.setItem('anubis_ruta_diaria_v3', JSON.stringify({ fecha: fecha, datos: datosAgrupados }));
        }
        setCargando(false);
    };

    const pagosFiltrados = useMemo(() => {
        const filtrados = pagos.filter(item => {
            const cobradorReal = item?.prestamo?.cobrador || 'principal';
            return cobradorActivo === 'todos' || cobradorReal === cobradorActivo;
        });

        return filtrados.sort((a, b) => {
            // Orden jerárquico: 1. Atrasados, 2. Pendientes, 3. Al Día, 4. Pagados
            const orden = { 'no_pago': 1, 'pendiente': 2, 'al_dia': 3, 'pagado': 4 };
            const pesoA = orden[a.estadoDisplay] || 2;
            const pesoB = orden[b.estadoDisplay] || 2;

            if (pesoA !== pesoB) return pesoA - pesoB;
            return a.prestamo.clientes.nombre.localeCompare(b.prestamo.clientes.nombre);
        });
    }, [pagos, cobradorActivo]);

    const totalEsperado = pagosFiltrados.reduce((sum, item) => sum + (item.tieneCuotaProgramadaHoy ? Number(item.prestamo.valor_cuota) : 0), 0);
    const totalCobrado = pagosFiltrados.reduce((sum, item) => sum + item.montoIngresadoFisicamenteHoy, 0);

    const descargarPDF = () => {
        const tituloSecundario = cobradorActivo === 'todos' ? 'Global' : cobradorActivo === 'ayudante' ? 'Ayudante' : 'Mis Cobros';

        const datosParaPDF = pagosFiltrados.map(item => ({
            prestamos: item.prestamo,
            estado_cobro: item.estadoDisplay,
            monto_recibido: item.montoIngresadoFisicamenteHoy || item.prestamo.valor_cuota
        }));
        generarReporteRutaPDF(datosParaPDF, `${fecha} (DIARIO - ${tituloSecundario})`, totalEsperado, totalCobrado);
    };

    const abrirCartulina = (itemAgrupado) => {
        const pInfo = itemAgrupado.prestamo;
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

    const renovarPrestamo = (clienteId, prestamoId) => {
        navigate('/nuevo-prestamo', { state: { preselectClienteId: clienteId, prestamoARenovar: prestamoId } });
    };

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
                        <select
                            value={cobradorActivo}
                            onChange={(e) => setCobradorActivo(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl p-3 outline-none font-bold text-sm focus:border-amber-500 transition"
                        >
                            <option value="todos">Ver Ruta Completa (Yo + Ayudante)</option>
                            <option value="principal">Solo Mis Cobros</option>
                            <option value="ayudante">Solo Cobros del Ayudante</option>
                        </select>

                        <div className="flex gap-2">
                            <input
                                type="date"
                                value={fecha}
                                onChange={(e) => setFecha(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl p-3 outline-none font-bold focus:border-amber-500 transition"
                            />
                            <button
                                onClick={descargarPDF}
                                className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 rounded-xl font-bold flex items-center justify-center transition-colors shadow-sm gap-2"
                            >
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

                <div className="space-y-3">
                    {cargando ? (
                        <div className="flex justify-center py-8"><div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div></div>
                    ) : pagosFiltrados.length === 0 ? (
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center">
                            <p className="text-gray-400 font-medium">No hay cobros diarios para esta fecha.</p>
                        </div>
                    ) : (
                        pagosFiltrados.map((item) => (
                            <div key={item.prestamo.id} className={`bg-white p-4 rounded-2xl shadow-sm border-l-4 transition-all hover:shadow-md ${item.estadoDisplay === 'pagado' ? 'border-l-green-500 opacity-75' :
                                item.estadoDisplay === 'no_pago' ? 'border-l-red-500' :
                                    item.estadoDisplay === 'al_dia' ? 'border-l-blue-400 opacity-80' :
                                        'border-l-amber-400'
                                }`}>
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h2 className="font-bold text-gray-800 text-lg">{item.prestamo.clientes.nombre}</h2>
                                        <p className="text-xs font-bold text-gray-400 mb-2 flex items-center gap-1">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                            {item.prestamo.clientes.telefono || 'Sin número'}
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md ${item.estadoDisplay === 'pagado' ? 'bg-green-50 text-green-600 border border-green-200' :
                                                item.estadoDisplay === 'no_pago' ? 'bg-red-50 text-red-600 border border-red-200' :
                                                    item.estadoDisplay === 'al_dia' ? 'bg-blue-50 text-blue-600 border border-blue-200' :
                                                        'bg-amber-50 text-amber-600 border border-amber-200'
                                                }`}>
                                                {item.estadoDisplay === 'pagado' ? '✓ Cobrado' :
                                                    item.estadoDisplay === 'no_pago' ? '✗ Atrasado' :
                                                        item.estadoDisplay === 'al_dia' ? 'Al Día' :
                                                            'Pendiente'}
                                            </span>
                                            {item.prestamo.cobrador === 'ayudante' && (
                                                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded bg-neutral-100 text-neutral-500 border border-neutral-200">
                                                    Ayudante
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="text-right flex flex-col items-end">
                                        {item.estadoDisplay === 'pagado' ? (
                                            <>
                                                <p className="font-black text-green-600 text-2xl">
                                                    ${item.montoIngresadoFisicamenteHoy > 0 ? item.montoIngresadoFisicamenteHoy.toFixed(2) : Number(item.prestamo.valor_cuota).toFixed(2)}
                                                </p>
                                                {item.cuotasPagadasHoy > 1 && (
                                                    <p className="text-[9px] font-black text-green-700 bg-green-100 px-2 py-0.5 rounded-full mt-1 uppercase tracking-wider">
                                                        {item.cuotasPagadasHoy} cuotas
                                                    </p>
                                                )}
                                            </>
                                        ) : (
                                            <p className="font-black text-gray-800 text-2xl">${item.prestamo.valor_cuota}</p>
                                        )}

                                        <button
                                            onClick={() => abrirCartulina(item)}
                                            className="mt-2 bg-amber-50 text-amber-700 hover:bg-amber-100 font-black tracking-widest uppercase text-[9px] px-4 py-2 rounded-lg transition-colors border border-amber-200 shadow-sm"
                                        >
                                            Cartulina
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {prestamoSeleccionado && (
                prestamoSeleccionado.tipo_prestamo === 'mensual_interes' ? (
                    <LibretaMensualModal
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