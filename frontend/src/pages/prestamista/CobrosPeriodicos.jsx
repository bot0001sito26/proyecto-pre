import { useState, useEffect, useMemo } from 'react';
import supabase from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import CartulinaModal from '../../components/CartulinaModal';
import LibretaMensualModal from '../../components/LibretaMensualModal';

export default function CobrosPeriodicos() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const hoyStr = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];

    const [modalidadActiva, setModalidadActiva] = useState('mensual');
    const [cobradorActivo, setCobradorActivo] = useState('todos');
    const [busqueda, setBusqueda] = useState('');

    const [prestamos, setPrestamos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [prestamoSeleccionado, setPrestamoSeleccionado] = useState(null);

    useEffect(() => {
        if (user?.id) fetchPrestamosPeriodicos();
    }, [user, modalidadActiva]);

    const fetchPrestamosPeriodicos = async () => {
        setCargando(true);
        const { data, error } = await supabase
            .from('prestamos')
            .select(`
                id, monto_total, monto_capital, frecuencia, fecha_inicio, estado, valor_cuota, cobrador, tipo_prestamo,
                clientes ( id, nombre, telefono ),
                historial_pagos ( id, fecha_cobro, estado_cobro, monto_recibido ),
                movimientos_mensuales ( tipo, monto, fecha )
            `)
            .eq('prestamista_id', user.id)
            .eq('estado', 'activo')
            .eq('frecuencia', modalidadActiva);

        if (!error && data) {
            const procesados = data.map(p => {
                let fechaVencimiento = 'Sin fecha';
                let atrasado = false;
                let mensajeAtraso = ''; // <-- NUEVA VARIABLE

                if (p.tipo_prestamo === 'mensual_interes') {
                    const [anioIni, mesIni, diaIni] = p.fecha_inicio.split('-').map(Number);
                    const [anioHoy, mesHoy, diaHoy] = hoyStr.split('-').map(Number);

                    let generado = 0;
                    let mesCorte = mesIni + 1;
                    let anioCorte = anioIni;
                    let mesesTranscurridos = 0;
                    const capitalOriginal = parseFloat(p.monto_total);

                    while (anioCorte < anioHoy || (anioCorte === anioHoy && mesCorte < mesHoy) || (anioCorte === anioHoy && mesCorte === mesHoy && diaIni <= diaHoy)) {
                        mesesTranscurridos++;
                        const fechaCorteFija = new Date(anioCorte, mesCorte - 1, diaIni);
                        const abonos = (p.movimientos_mensuales || [])
                            .filter(m => m.tipo === 'abono_capital')
                            .reduce((sum, m) => {
                                const [mA, mM, mD] = m.fecha.split('-').map(Number);
                                const fechaM = new Date(mA, mM - 1, mD);
                                return fechaM <= fechaCorteFija ? sum + parseFloat(m.monto) : sum;
                            }, 0);

                        const capitalBase = Math.max(0, capitalOriginal - abonos);
                        generado += (capitalBase * 0.20);

                        mesCorte++;
                        if (mesCorte > 12) { mesCorte = 1; anioCorte++; }
                    }

                    const pagado = (p.movimientos_mensuales || [])
                        .filter(m => m.tipo === 'pago_interes')
                        .reduce((sum, m) => sum + parseFloat(m.monto), 0);

                    const pendiente = generado - pagado;

                    const proximoMesCorte = mesIni + mesesTranscurridos + 1;
                    const proxCorteDate = new Date(anioIni, proximoMesCorte - 1, diaIni);
                    fechaVencimiento = `${proxCorteDate.getFullYear()}-${String(proxCorteDate.getMonth() + 1).padStart(2, '0')}-${String(proxCorteDate.getDate()).padStart(2, '0')}`;

                    // LÓGICA DE ATRASO MENSUAL
                    if (pendiente > 0.01) {
                        atrasado = true;
                        mensajeAtraso = `Deuda: $${pendiente.toFixed(2)}`;
                    }

                } else {
                    const pendientes = (p.historial_pagos || [])
                        .filter(pago => pago.estado_cobro === 'pendiente' || pago.estado_cobro === 'no_pago')
                        .sort((a, b) => a.fecha_cobro.localeCompare(b.fecha_cobro));

                    if (pendientes.length > 0) {
                        fechaVencimiento = pendientes[0].fecha_cobro;
                        atrasado = fechaVencimiento < hoyStr;
                        // LÓGICA DE ATRASO CUOTA FIJA
                        if (atrasado) {
                            mensajeAtraso = `${pendientes.length} cuota(s) vencida(s)`;
                        }
                    } else {
                        fechaVencimiento = p.fecha_inicio;
                    }
                }

                return { ...p, fechaVencimiento, atrasado, mensajeAtraso };
            });
            setPrestamos(procesados);
        } else {
            setPrestamos([]);
        }
        setCargando(false);
    };

    const prestamosFiltrados = useMemo(() => {
        const filtrados = prestamos.filter(p => {
            const cobradorReal = p.cobrador || 'principal';
            const coincideCobrador = cobradorActivo === 'todos' || cobradorReal === cobradorActivo;
            const termino = busqueda.toLowerCase().trim();
            const coincideTexto = p.clientes?.nombre.toLowerCase().includes(termino);
            return coincideCobrador && coincideTexto;
        });

        return filtrados.sort((a, b) => {
            if (a.atrasado && !b.atrasado) return -1;
            if (!a.atrasado && b.atrasado) return 1;
            return a.fechaVencimiento.localeCompare(b.fechaVencimiento);
        });
    }, [prestamos, cobradorActivo, busqueda]);

    const abrirModal = (prestamo) => setPrestamoSeleccionado(prestamo);
    const renovarPrestamo = (clienteId, prestamoId) => navigate('/nuevo-prestamo', { state: { preselectClienteId: clienteId, prestamoARenovar: prestamoId } });

    // ESTA ES LA FUNCIÓN QUE VAMOS A MODIFICAR LUEGO PARA LA LIQUIDACIÓN
    const finalizarPrestamo = async (datosLiquidacion = null) => {
        // Por ahora mantengo tu lógica original, pero la prepararemos para la liquidación.
        await supabase.from('prestamos').update({ estado: 'completado', saldo_pendiente: 0 }).eq('id', prestamoSeleccionado.id);
        if (prestamoSeleccionado.tipo_prestamo === 'cuota_fija') {
            await supabase.from('historial_pagos').update({ estado_cobro: 'pagado', monto_recibido: prestamoSeleccionado.valor_cuota, fecha_cobro: hoyStr })
                .eq('prestamo_id', prestamoSeleccionado.id).in('estado_cobro', ['pendiente', 'no_pago']);
        }
        setPrestamoSeleccionado(null);
        fetchPrestamosPeriodicos();
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4 pb-20 overflow-x-hidden w-full font-sans">
            <div className="max-w-2xl mx-auto space-y-4">

                <div className="flex items-center justify-between mb-2">
                    <Link to="/dashboard" className="text-neutral-400 hover:text-amber-600 transition flex items-center gap-1 font-bold text-xs uppercase tracking-widest">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Volver
                    </Link>
                    <h1 className="text-xl font-black text-neutral-900 tracking-widest uppercase">Periódicos</h1>
                </div>

                <div className="grid grid-cols-3 gap-1 bg-gray-200 p-1 rounded-xl">
                    {[
                        { id: 'semanal', label: 'Semanal' },
                        { id: 'quincenal', label: 'Quincenal' },
                        { id: 'mensual', label: 'Mensual' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => { setModalidadActiva(tab.id); setBusqueda(''); }}
                            className={`py-3 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${modalidadActiva === tab.id ? 'bg-neutral-900 text-amber-500 shadow-sm' : 'text-gray-600 hover:text-neutral-900'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-3 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
                    <div className="flex-1 relative">
                        <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        <input
                            type="text"
                            placeholder="Buscar cliente..."
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl pl-10 pr-3 py-3 outline-none font-bold text-sm focus:border-amber-500 transition"
                        />
                    </div>
                    <select
                        value={cobradorActivo}
                        onChange={(e) => setCobradorActivo(e.target.value)}
                        className="w-full md:w-1/3 bg-gray-50 border border-gray-200 text-gray-800 rounded-xl p-3 outline-none font-bold text-sm focus:border-amber-500 transition"
                    >
                        <option value="todos">Todos (Cobradores)</option>
                        <option value="principal">Solo Míos</option>
                        <option value="ayudante">Ayudante</option>
                    </select>
                </div>

                <div className="space-y-3">
                    {cargando ? (
                        <div className="flex justify-center py-8"><div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div></div>
                    ) : prestamosFiltrados.length === 0 ? (
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center">
                            <p className="text-gray-400 font-medium">{busqueda ? 'No se encontraron clientes con ese nombre.' : 'No hay créditos activos en esta modalidad.'}</p>
                        </div>
                    ) : (
                        prestamosFiltrados.map((p) => (
                            <div key={p.id} className={`bg-white p-4 rounded-2xl shadow-sm border-l-4 transition-all hover:shadow-md ${p.atrasado ? 'border-l-red-500 bg-red-50/20' : 'border-l-amber-400'}`}>
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h2 className="font-bold text-gray-800 text-lg">{p.clientes.nombre}</h2>
                                        <p className="text-xs font-bold text-gray-400 mb-1 flex items-center gap-1">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                            {p.clientes.telefono || 'Sin número'}
                                        </p>

                                        {/* TEXTO DE ATRASO MEJORADO */}
                                        <div className={`text-[11px] font-black mb-2 flex flex-col ${p.atrasado ? 'text-red-600' : 'text-neutral-600'}`}>
                                            {p.atrasado ? (
                                                <>
                                                    <span className="flex items-center gap-1">
                                                        {p.mensajeAtraso}
                                                    </span>
                                                    <span className="text-[9px] text-red-400 mt-0.5">Proximo corte: {p.fechaVencimiento}</span>
                                                </>
                                            ) : (
                                                `🗓️ Próximo Pago: ${p.fechaVencimiento}`
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {p.tipo_prestamo === 'mensual_interes' && (
                                                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded bg-purple-100 text-purple-800 border border-purple-200">Interés Abierto</span>
                                            )}
                                            {p.cobrador === 'ayudante' && (
                                                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded bg-neutral-100 text-neutral-500 border border-neutral-200">Ayudante</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right flex flex-col items-end">
                                        <p className="font-black text-gray-800 text-xl">${p.tipo_prestamo === 'mensual_interes' ? (parseFloat(p.monto_capital) * 0.20).toFixed(2) : p.valor_cuota}</p>
                                        <button onClick={() => abrirModal(p)} className="mt-2 bg-amber-50 text-amber-700 hover:bg-amber-100 font-black tracking-widest uppercase text-[9px] px-4 py-2 rounded-lg transition-colors border border-amber-200 shadow-sm">
                                            {p.tipo_prestamo === 'mensual_interes' ? 'Abrir Libreta' : 'Abrir Cartulina'}
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
                    <LibretaMensualModal prestamo={prestamoSeleccionado} onClose={() => setPrestamoSeleccionado(null)} onFinalizar={finalizarPrestamo} onUpdate={fetchPrestamosPeriodicos} />
                ) : (
                    <CartulinaModal prestamo={prestamoSeleccionado} onClose={() => setPrestamoSeleccionado(null)} onRenovar={renovarPrestamo} onFinalizar={finalizarPrestamo} onUpdate={fetchPrestamosPeriodicos} />
                )
            )}
        </div>
    );
}