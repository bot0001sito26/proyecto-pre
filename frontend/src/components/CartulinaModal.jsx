import { useState, useEffect } from 'react';
import supabase from '../supabaseClient';
import ConfirmModal from './ConfirmModal';
import { generarCartulinaPDF } from '../utils/generarPDF';

export default function CartulinaModal({ prestamo, onClose, onRenovar, onFinalizar, onUpdate, fechaRuta }) {
    const [cuotas, setCuotas] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [cuotaParaNota, setCuotaParaNota] = useState(null);

    const [cobradorLocal, setCobradorLocal] = useState(prestamo?.cobrador || 'principal');
    const [modalConf, setModalConf] = useState({ isOpen: false, titulo: '', mensaje: '', accion: null });

    const getFechaLocal = () => new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
    const hoyStr = getFechaLocal();

    useEffect(() => {
        if (prestamo?.id) {
            fetchCuotas();
            setCobradorLocal(prestamo.cobrador || 'principal');
        }
    }, [prestamo?.id]);

    const handleCambiarCobrador = async (nuevoCobrador) => {
        setCobradorLocal(nuevoCobrador);
        const { error } = await supabase
            .from('prestamos')
            .update({ cobrador: nuevoCobrador })
            .eq('id', prestamo.id);

        if (!error) {
            if (onUpdate) onUpdate();
        } else {
            setCobradorLocal(prestamo.cobrador || 'principal');
            alert("Error al reasignar el cobrador.");
        }
    };

    const fetchCuotas = async () => {
        setCargando(true);
        const { data } = await supabase
            .from('historial_pagos')
            .select('*')
            .eq('prestamo_id', prestamo.id)
            .order('fecha_cobro', { ascending: true });
        if (data) setCuotas(data);
        setCargando(false);
    };

    // 1. Prepara el nuevo estado y pide confirmación
    const cambiarEstadoCuota = (cuota) => {
        if (cuota.estado_cobro === 'renovado' || prestamo.estado !== 'activo') return;

        let nuevoEstado = 'pagado';
        let textoAccion = 'PAGADA';

        if (cuota.estado_cobro === 'pagado') {
            nuevoEstado = cuota.fecha_cobro < hoyStr ? 'no_pago' : 'pendiente';
            textoAccion = nuevoEstado === 'no_pago' ? 'NO PAGO (Atrasada)' : 'PENDIENTE';
        }

        const dia = cuota.fecha_cobro.split('-')[2];

        setModalConf({
            isOpen: true,
            titulo: 'Confirmar Cuota',
            mensaje: `¿Estás seguro de marcar la cuota del día ${dia} como ${textoAccion}?`,
            accion: () => ejecutarCambioEstado(cuota, nuevoEstado)
        });
    };

    // 2. Ejecuta el cambio visual y en BD tras confirmar
    const ejecutarCambioEstado = async (cuota, nuevoEstado) => {
        setModalConf({ isOpen: false, accion: null }); // Cierra el modal

        // Si no nos pasan fechaRuta, usamos hoy
        const fechaOperacion = fechaRuta || hoyStr;

        const monto = nuevoEstado === 'pagado' ? prestamo.valor_cuota : 0;
        // La magia ocurre aquí: guardamos EL DÍA REAL EN QUE SE HIZO EL COBRO
        const fechaPagoReal = nuevoEstado === 'pagado' ? fechaOperacion : null;

        // Actualización optimista (cambia el color instantáneamente en pantalla)
        setCuotas(prev => prev.map(c => c.id === cuota.id ? { ...c, estado_cobro: nuevoEstado, monto_recibido: monto, fecha_pago_real: fechaPagoReal } : c));

        // Guardado en la base de datos en segundo plano
        const { error } = await supabase.from('historial_pagos').update({
            estado_cobro: nuevoEstado,
            monto_recibido: monto,
            fecha_pago_real: fechaPagoReal // <-- Lo inyectamos a Supabase
        }).eq('id', cuota.id);

        if (!error && onUpdate) {
            onUpdate();
        } else if (error) {
            fetchCuotas();
        }
    };

    const guardarNota = async (cuotaId, nuevaNota) => {
        const { error } = await supabase.from('historial_pagos').update({ notas: nuevaNota }).eq('id', cuotaId);
        if (error) { alert('Error al guardar la nota'); return; }

        setCuotas(prev => prev.map(c => c.id === cuotaId ? { ...c, notas: nuevaNota } : c));
        setCuotaParaNota(prev => prev?.id === cuotaId ? { ...prev, notas: nuevaNota } : prev);
    };

    const pedirConfirmacionFinalizar = () => {
        setModalConf({
            isOpen: true,
            titulo: 'Finalizar Crédito',
            mensaje: '¿Seguro que deseas FINALIZAR este crédito? Las cuotas pendientes se marcarán como pagadas hoy y sumarán a tu Ganancia Real.',
            accion: () => { onFinalizar(); setModalConf({ isOpen: false }); }
        });
    };

    const pedirConfirmacionRenovar = () => {
        setModalConf({
            isOpen: true,
            titulo: 'Renovar Crédito',
            mensaje: '¿Estás seguro de renovar este crédito? Serás redirigido al formulario de nuevo préstamo.',
            accion: () => { onRenovar(prestamo.cliente_id, prestamo.id); setModalConf({ isOpen: false }); }
        });
    };

    const cuotasConNotas = cuotas.filter(c => c.notas && c.notas.trim() !== '');

    return (
        <>
            <div className="fixed inset-0 bg-neutral-950/70 flex items-end md:items-center justify-center p-0 md:p-4 z-50 backdrop-blur-sm transition-opacity">
                <div className="bg-white w-full max-w-lg rounded-t-2xl md:rounded-2xl h-[90vh] md:h-auto max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">

                    <div className="p-4 bg-neutral-900 text-white flex justify-between items-center border-b border-amber-500/30">
                        <span className="text-xs font-black uppercase tracking-widest text-amber-500 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                            Cartulina Anubis
                        </span>
                        <div className="flex items-center gap-2">
                            <button onClick={() => generarCartulinaPDF(prestamo, cuotas)} className="text-amber-500 hover:text-white transition p-1 flex items-center gap-1 font-black uppercase text-[10px] bg-amber-500/10 hover:bg-amber-500/30 px-2 rounded-md border border-amber-500/30">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                PDF
                            </button>
                            <button onClick={onClose} className="text-neutral-400 hover:text-white transition p-1">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    </div>

                    <div className="p-4 md:p-6 overflow-y-auto flex-1 bg-amber-50/20 select-none space-y-4">
                        <div className="border-2 border-neutral-900 bg-white shadow-sm p-4 font-mono relative">
                            <div className="absolute top-0 left-0 w-full h-1 bg-amber-500"></div>
                            <h2 className="text-center font-black text-xl uppercase border-b-2 border-neutral-200 pb-2 mb-3 tracking-widest text-neutral-800">
                                Control de Pago
                            </h2>

                            <div className="mb-4 text-sm font-bold leading-relaxed text-neutral-700">
                                <div className="flex border-b border-neutral-200 border-dashed pb-1 mb-1">
                                    <span className="w-20 text-neutral-400">Valor:</span>
                                    <span>${prestamo.monto_total} ({prestamo.frecuencia})</span>
                                </div>
                                <div className="flex border-b border-neutral-200 border-dashed pb-1 mb-1">
                                    <span className="w-20 text-neutral-400">Cliente:</span>
                                    <span className="truncate">{prestamo.clientes?.nombre}</span>
                                </div>
                                <div className="flex border-b border-neutral-200 border-dashed pb-1 mb-1">
                                    <span className="w-20 text-neutral-400">Fecha:</span>
                                    <span>{prestamo.fecha_inicio || 'N/A'}</span>
                                </div>
                            </div>

                            {cargando ? (
                                <div className="flex justify-center py-8"><div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div></div>
                            ) : (
                                <div className="grid grid-cols-6 md:grid-cols-7 gap-0 border-t-2 border-l-2 border-neutral-900">
                                    {cuotas.map((c) => {
                                        let colorClase = 'bg-white text-neutral-900 hover:bg-neutral-100';
                                        if (c.estado_cobro === 'pagado') colorClase = 'bg-green-500 text-white shadow-inner hover:bg-green-600';
                                        else if (c.estado_cobro === 'no_pago' || (c.estado_cobro === 'pendiente' && c.fecha_cobro < hoyStr)) colorClase = 'bg-red-500 text-white shadow-inner hover:bg-red-600';
                                        else if (c.fecha_cobro === hoyStr && c.estado_cobro === 'pendiente') colorClase = 'bg-amber-300 text-amber-900 font-black ring-2 ring-inset ring-neutral-900 hover:bg-amber-400';
                                        else if (c.estado_cobro === 'renovado') colorClase = 'bg-neutral-200 text-neutral-400 opacity-60 line-through cursor-not-allowed';

                                        const diaDelMes = c.fecha_cobro.split('-')[2];
                                        const puedeEditar = c.estado_cobro !== 'renovado' && prestamo.estado === 'activo';
                                        const estaAbiertaParaNota = cuotaParaNota?.id === c.id;

                                        return (
                                            <div key={c.id} className="relative group">
                                                <button
                                                    onClick={() => cambiarEstadoCuota(c)}
                                                    disabled={!puedeEditar}
                                                    className={`w-full aspect-square flex items-center justify-center border-r-2 border-b-2 border-neutral-900 text-lg sm:text-xl font-black transition-transform outline-none focus:outline-none ${puedeEditar ? 'cursor-pointer active:scale-90' : ''} ${colorClase} ${estaAbiertaParaNota ? 'ring-2 ring-amber-500 z-10' : ''}`}
                                                >
                                                    {diaDelMes}
                                                </button>
                                                {puedeEditar && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setCuotaParaNota(cuotaParaNota?.id === c.id ? null : c);
                                                        }}
                                                        className={`absolute top-0.5 right-0.5 p-0.5 text-[8px] rounded transition ${estaAbiertaParaNota ? 'bg-amber-500 text-neutral-950 font-bold' : 'bg-neutral-900/10 hover:bg-neutral-900 text-neutral-700 hover:text-white'}`}
                                                        title="Añadir nota/motivo"
                                                    >
                                                        📝
                                                    </button>
                                                )}
                                                {c.notas && <span className="w-2 h-2 rounded-full bg-amber-400 absolute bottom-1 right-1 border border-black pointer-events-none"></span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {cuotaParaNota && (
                            <div key={cuotaParaNota.id} className="bg-amber-50 border border-amber-300 rounded-xl p-3 shadow-sm relative animate-fade-in">
                                <div className="flex justify-between items-center mb-1.5">
                                    <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest">
                                        Nota para el día {cuotaParaNota.fecha_cobro}:
                                    </span>
                                    <button onClick={() => setCuotaParaNota(null)} className="text-amber-800 font-bold text-xs">✕</button>
                                </div>
                                <input
                                    type="text"
                                    defaultValue={cuotaParaNota.notas || ''}
                                    onBlur={(e) => guardarNota(cuotaParaNota.id, e.target.value)}
                                    placeholder="Escribe el motivo o nota aquí..."
                                    className="w-full bg-white border border-amber-200 rounded-lg p-2 text-xs font-bold text-gray-800 outline-none focus:border-amber-500"
                                    autoFocus
                                />
                            </div>
                        )}

                        {cuotasConNotas.length > 0 && (
                            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col">
                                <h3 className="text-xs font-black text-gray-700 uppercase tracking-widest flex items-center gap-2 mb-3">
                                    <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    Historial de Motivos
                                </h3>
                                <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                                    {cuotasConNotas.map(c => (
                                        <div key={c.id} className="flex flex-col border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                                            <div className="flex justify-between items-center text-[10px] font-bold text-gray-400">
                                                <span>Fecha: {c.fecha_cobro}</span>
                                                <span className="uppercase text-amber-600">{c.estado_cobro}</span>
                                            </div>
                                            <p className="text-xs font-medium text-gray-700 bg-gray-50 p-2 rounded-md mt-1 border border-gray-100">"{c.notas}"</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col gap-2 bg-gray-50 p-3 rounded-xl border border-gray-100 mt-2">
                            <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest text-center">
                                ¿Quién cobra este crédito?
                            </span>
                            <div className="flex bg-gray-200 p-1 rounded-lg">
                                <button
                                    onClick={() => handleCambiarCobrador('principal')}
                                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-md transition-all ${cobradorLocal === 'principal' ? 'bg-neutral-900 text-amber-500 shadow-sm' : 'text-gray-500 hover:text-neutral-800'}`}
                                >
                                    Yo (Principal)
                                </button>
                                <button
                                    onClick={() => handleCambiarCobrador('ayudante')}
                                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-md transition-all ${cobradorLocal === 'ayudante' ? 'bg-neutral-900 text-amber-500 shadow-sm' : 'text-gray-500 hover:text-neutral-800'}`}
                                >
                                    Ayudante
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 border-t border-neutral-200 bg-neutral-50 flex gap-2">
                        {prestamo.estado === 'activo' && (
                            <>
                                <button onClick={pedirConfirmacionRenovar} className="flex-1 bg-neutral-900 text-amber-500 font-black uppercase tracking-wider py-3 rounded-lg hover:bg-black shadow-md text-xs flex items-center justify-center gap-2 transition">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                    Renovar
                                </button>
                                <button onClick={pedirConfirmacionFinalizar} className="flex-1 bg-amber-500 text-neutral-950 font-black uppercase tracking-wider py-3 rounded-lg hover:bg-amber-600 shadow-md text-xs flex items-center justify-center gap-2 transition">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    Finalizar
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <ConfirmModal
                isOpen={modalConf.isOpen}
                titulo={modalConf.titulo}
                mensaje={modalConf.mensaje}
                onConfirm={modalConf.accion}
                onCancel={() => setModalConf({ isOpen: false, accion: null })}
            />
        </>
    );
}