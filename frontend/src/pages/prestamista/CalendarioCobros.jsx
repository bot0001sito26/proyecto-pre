import { useState, useEffect, useMemo } from 'react';
import supabase from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { generarReporteRutaPDF } from '../../utils/generarPDF';
import CartulinaModal from '../../components/CartulinaModal';
import LibretaMensualModal from '../../components/LibretaMensualModal'; // <-- IMPORTAMOS LA NUEVA LIBRETA

export default function CalendarioCobros() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const getFechaLocal = (f = new Date()) => {
        return new Date(f.getTime() - f.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    };

    const hoyStr = getFechaLocal();
    const [fecha, setFecha] = useState(hoyStr);
    const [modalidadActiva, setModalidadActiva] = useState('diario');
    const [cobradorActivo, setCobradorActivo] = useState('todos');

    const [pagos, setPagos] = useState(() => {
        try {
            const cache = JSON.parse(sessionStorage.getItem('anubis_ruta'));
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
            id, fecha_cobro, estado_cobro, monto_recibido, notas,
            prestamos!inner (
                id, valor_cuota, prestamista_id, estado, monto_total, frecuencia, fecha_inicio, cobrador, tipo_prestamo, 
                clientes ( id, nombre, telefono )
            )
        `) // <--- AGREGAMOS tipo_prestamo AQUÍ
            .eq('prestamos.prestamista_id', user.id)
            .eq('prestamos.estado', 'activo')
            .eq('fecha_cobro', fecha)
            .order('id', { ascending: true });

        if (data) {
            setPagos(data);
            sessionStorage.setItem('anubis_ruta', JSON.stringify({ fecha: fecha, datos: data }));
        }
        setCargando(false);
    };

    const pagosFiltrados = useMemo(() => {
        const filtrados = pagos.filter(p => {
            const coincideModalidad = p.prestamos.frecuencia === modalidadActiva;
            const cobradorReal = p.prestamos.cobrador || 'principal';
            const coincideCobrador = cobradorActivo === 'todos' || cobradorReal === cobradorActivo;
            return coincideModalidad && coincideCobrador;
        });

        return filtrados.sort((a, b) => {
            if (a.estado_cobro === 'pagado' && b.estado_cobro !== 'pagado') return 1;
            if (a.estado_cobro !== 'pagado' && b.estado_cobro === 'pagado') return -1;
            return 0;
        });
    }, [pagos, modalidadActiva, cobradorActivo]);

    const totalEsperado = pagosFiltrados.reduce((sum, p) => sum + Number(p.prestamos.valor_cuota), 0);
    const totalCobrado = pagosFiltrados.reduce((sum, p) => sum + Number(p.monto_recibido), 0);

    const descargarPDF = () => {
        const tituloSecundario = cobradorActivo === 'todos' ? 'Global' : cobradorActivo === 'ayudante' ? 'Ayudante' : 'Mis Cobros';
        generarReporteRutaPDF(pagosFiltrados, `${fecha} (${modalidadActiva.toUpperCase()} - ${tituloSecundario})`, totalEsperado, totalCobrado);
    };

    const abrirCartulina = (pagoDelDia) => {
        const prestamoFormateado = {
            id: pagoDelDia.prestamos.id,
            monto_total: pagoDelDia.prestamos.monto_total,
            monto_capital: pagoDelDia.prestamos.monto_total, // Útil para la libreta mensual
            frecuencia: pagoDelDia.prestamos.frecuencia,
            fecha_inicio: pagoDelDia.prestamos.fecha_inicio,
            estado: pagoDelDia.prestamos.estado,
            valor_cuota: pagoDelDia.prestamos.valor_cuota,
            cliente_id: pagoDelDia.prestamos.clientes.id,
            clientes: pagoDelDia.prestamos.clientes,
            cobrador: pagoDelDia.prestamos.cobrador,
            tipo_prestamo: pagoDelDia.prestamos.tipo_prestamo // <--- LÍNEA VITAL QUE FALTABA
        };
        setPrestamoSeleccionado(prestamoFormateado);
    };

    const renovarPrestamo = (clienteId, prestamoId) => {
        navigate('/nuevo-prestamo', { state: { preselectClienteId: clienteId, prestamoARenovar: prestamoId } });
    };

    const finalizarPrestamo = async () => {
        await supabase.from('prestamos').update({ estado: 'completado', saldo_pendiente: 0 }).eq('id', prestamoSeleccionado.id);
        await supabase.from('historial_pagos').update({ estado_cobro: 'pagado', monto_recibido: prestamoSeleccionado.valor_cuota, fecha_cobro: hoyStr })
            .eq('prestamo_id', prestamoSeleccionado.id).in('estado_cobro', ['pendiente', 'no_pago']);

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
                    <h1 className="text-xl font-black text-neutral-900 tracking-widest uppercase">Anubis Ruta</h1>
                </div>

                <div className="grid grid-cols-4 gap-1 bg-gray-200 p-1 rounded-xl">
                    {[
                        { id: 'diario', label: 'Diario' },
                        { id: 'semanal', label: 'Semanal' },
                        { id: 'quincenal', label: 'Quincenal' },
                        { id: 'mensual', label: 'Mensual' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setModalidadActiva(tab.id)}
                            className={`py-2 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-lg transition-all ${modalidadActiva === tab.id
                                ? 'bg-neutral-900 text-amber-500 shadow-sm'
                                : 'text-gray-600 hover:text-neutral-900'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
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
                                title="Descargar Reporte PDF"
                            >
                                <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                PDF
                            </button>
                        </div>
                    </div>

                    <div className="flex justify-between text-sm border-t border-gray-100 pt-4">
                        <div>
                            <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Esperado ({modalidadActiva})</p>
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
                            <p className="text-gray-400 font-medium">No hay cobros para este filtro.</p>
                        </div>
                    ) : (
                        pagosFiltrados.map((p) => (
                            <div key={p.id} className={`bg-white p-4 rounded-2xl shadow-sm border-l-4 transition-all hover:shadow-md ${p.estado_cobro === 'pagado' ? 'border-l-green-500 opacity-75' :
                                p.estado_cobro === 'no_pago' ? 'border-l-red-500' : 'border-l-amber-400'
                                }`}>
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h2 className="font-bold text-gray-800 text-lg">{p.prestamos.clientes.nombre}</h2>
                                        <p className="text-xs font-bold text-gray-400 mb-2 flex items-center gap-1">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                            {p.prestamos.clientes.telefono || 'Sin número'}
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md ${p.estado_cobro === 'pagado' ? 'bg-green-50 text-green-600 border border-green-200' : p.estado_cobro === 'no_pago' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-amber-50 text-amber-600 border border-amber-200'}`}>
                                                {p.estado_cobro === 'pagado' ? '✓ Cobrado' : p.estado_cobro === 'no_pago' ? '✗ Atrasado' : 'Pendiente'}
                                            </span>
                                            {p.prestamos.cobrador === 'ayudante' && (
                                                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded bg-neutral-100 text-neutral-500 border border-neutral-200">
                                                    Ayudante
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right flex flex-col items-end">
                                        <p className="font-black text-gray-800 text-2xl">${p.prestamos.valor_cuota}</p>
                                        <button
                                            onClick={() => abrirCartulina(p)}
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
                    />
                )
            )}
        </div>
    );
}