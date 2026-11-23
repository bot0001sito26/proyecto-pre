import { useState, useEffect } from 'react';
import supabase from '../supabaseClient';
import ConfirmModal from './ConfirmModal';
import { generarCartulinaPDF } from '../utils/generarCartulinaPDF';

export default function CartulinaModal({ prestamo, onClose, onRenovar, onFinalizar, onUpdate, fechaRuta }) {
    const [cuotas, setCuotas] = useState([]);
    const [retirosCapital, setRetirosCapital] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [cuotaParaNota, setCuotaParaNota] = useState(null);

    const [cobradorLocal, setCobradorLocal] = useState(prestamo?.cobrador || 'principal');
    const [capitalActivoLocal, setCapitalActivoLocal] = useState(Number(prestamo?.monto_capital || 0));
    const [modalConf, setModalConf] = useState({ isOpen: false, titulo: '', mensaje: '', accion: null });

    // Estados para visualización en Acordeones
    const [verMotivos, setVerMotivos] = useState(false);
    const [verCapital, setVerCapital] = useState(false);

    // Estados para el retiro de capital parcial
    const [montoRetiro, setMontoRetiro] = useState('');
    const [mostrandoRetiro, setMostrandoRetiro] = useState(false);

    const esActivo = prestamo?.estado === 'activo';

    const getFechaLocal = () => new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
    const hoyStr = getFechaLocal();

    // Obtener la fecha y hora local exacta en formato SQL (YYYY-MM-DD HH:MM:SS) para Ecuador
    const getTimestampLocalSQL = () => {
        const ahora = new Date();
        const offsetEcuador = -5 * 60;
        const localTime = new Date(ahora.getTime() + (ahora.getTimezoneOffset() + offsetEcuador) * 60000);
        return localTime.toISOString().slice(0, 19).replace('T', ' ');
    };

    useEffect(() => {
        if (prestamo?.id) {
            fetchDatosCartulina();
            setCobradorLocal(prestamo.cobrador || 'principal');
            setCapitalActivoLocal(Number(prestamo.monto_capital || 0));
            setMostrandoRetiro(false);
            setMontoRetiro('');
            setCuotaParaNota(null);
        }
    }, [prestamo?.id]);

    const mostrarAlerta = (titulo, mensaje) => {
        setModalConf({
            isOpen: true,
            titulo,
            mensaje,
            accion: () => setModalConf({ isOpen: false, accion: null })
        });
    };

    const handleCambiarCobrador = async (nuevoCobrador) => {
        if (!esActivo) return;
        setCobradorLocal(nuevoCobrador);
        const { error } = await supabase
            .from('prestamos')
            .update({ cobrador: nuevoCobrador })
            .eq('id', prestamo.id);

        if (!error) {
            if (onUpdate) onUpdate();
        } else {
            setCobradorLocal(prestamo.cobrador || 'principal');
            mostrarAlerta('Error', 'Hubo un error al reasignar el cobrador.');
        }
    };

    const fetchDatosCartulina = async () => {
        setCargando(true);
        const [resCuotas, resRetiros] = await Promise.all([
            supabase
                .from('historial_pagos')
                .select('*')
                .eq('prestamo_id', prestamo.id)
                .order('fecha_cobro', { ascending: true }),
            supabase
                .from('movimientos_mensuales')
                .select('id, fecha, monto, notas')
                .eq('prestamo_id', prestamo.id)
                .eq('tipo', 'retiro_capital')
                .order('fecha', { ascending: false })
        ]);

        if (resCuotas.data) setCuotas(resCuotas.data);
        if (resRetiros.data) setRetirosCapital(resRetiros.data);
        setCargando(false);
    };

    const cambiarEstadoCuota = (cuota) => {
        if (cuota.estado_cobro === 'renovado' || !esActivo) return;

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

    const ejecutarCambioEstado = async (cuota, nuevoEstado) => {
        setModalConf({ isOpen: false, accion: null });
        if (!esActivo) return;

        const fechaOperacion = fechaRuta || hoyStr;
        const monto = nuevoEstado === 'pagado' ? prestamo.valor_cuota : 0;
        const fechaPagoReal = nuevoEstado === 'pagado' ? fechaOperacion : null;
        const fechaRegistroExacta = nuevoEstado === 'pagado' ? getTimestampLocalSQL() : null;

        setCuotas(prev => prev.map(c => c.id === cuota.id ? { ...c, estado_cobro: nuevoEstado, monto_recibido: monto, fecha_pago_real: fechaPagoReal, fecha_registro: fechaRegistroExacta } : c));

        const { error } = await supabase.from('historial_pagos').update({
            estado_cobro: nuevoEstado,
            monto_recibido: monto,
            fecha_pago_real: fechaPagoReal,
            fecha_registro: fechaRegistroExacta
        }).eq('id', cuota.id);

        if (!error && onUpdate) {
            onUpdate();
        } else if (error) {
            fetchDatosCartulina();
        }
    };

    const guardarNota = async (cuotaId, nuevaNota) => {
        if (!esActivo) return;
        let notaFinal = nuevaNota.trim();

        if (notaFinal && !notaFinal.includes('(Anotado:')) {
            notaFinal = `${notaFinal} (Anotado: ${hoyStr})`;
        }

        const { error } = await supabase.from('historial_pagos').update({ notas: notaFinal }).eq('id', cuotaId);
        if (error) {
            mostrarAlerta('Error', 'Hubo un problema al guardar la nota.');
            return;
        }

        setCuotas(prev => prev.map(c => c.id === cuotaId ? { ...c, notas: notaFinal } : c));
        setCuotaParaNota(null);
    };

    const pedirConfirmacionFinalizar = () => {
        if (!esActivo) return;
        setModalConf({
            isOpen: true,
            titulo: 'Finalizar Crédito',
            mensaje: '¿Seguro que deseas FINALIZAR este crédito? Las cuotas pendientes se marcarán como pagadas hoy y sumarán a tu Ganancia Real.',
            accion: () => { onFinalizar(); setModalConf({ isOpen: false }); }
        });
    };

    const pedirConfirmacionRenovar = () => {
        if (!esActivo) return;
        setModalConf({
            isOpen: true,
            titulo: 'Renovar Crédito',
            mensaje: '¿Estás seguro de renovar este crédito? Serás redirigido al formulario de nuevo préstamo.',
            accion: () => { onRenovar(prestamo.cliente_id, prestamo.id); setModalConf({ isOpen: false }); }
        });
    };

    const confirmarRetiroCapital = () => {
        if (!esActivo) return;
        const retiroNum = parseFloat(montoRetiro);

        if (!retiroNum || retiroNum <= 0) {
            mostrarAlerta('Monto Inválido', 'El monto a retirar debe ser mayor a $0.');
            return;
        }

        if (retiroNum > capitalActivoLocal) {
            mostrarAlerta('Límite Excedido', `No puedes retirar más del capital activo ($${capitalActivoLocal.toFixed(2)}).`);
            return;
        }

        setModalConf({
            isOpen: true,
            titulo: 'Extraer Capital Vivo',
            mensaje: `Vas a retirar $${retiroNum.toFixed(2)}. Esto restará capital activo de este crédito sin afectar la deuda del cliente. ¿Continuar?`,
            accion: () => ejecutarRetiroCapital(retiroNum)
        });
    };

    const ejecutarRetiroCapital = async (monto) => {
        setModalConf({ isOpen: false, accion: null });
        if (!esActivo) return;

        const registroRetiro = {
            prestamo_id: prestamo.id,
            fecha: hoyStr,
            tipo: 'retiro_capital',
            monto: monto,
            notas: 'Retiro parcial de capital desde cartulina activa'
        };

        const { data: nuevoMov, error: errMov } = await supabase
            .from('movimientos_mensuales')
            .insert([registroRetiro])
            .select('id, fecha, monto, notas')
            .single();

        if (errMov) {
            mostrarAlerta('Error', 'Hubo un error al registrar el movimiento de retiro.');
            return;
        }

        const nuevoCapital = Math.max(0, capitalActivoLocal - monto);

        const { error } = await supabase.from('prestamos')
            .update({ monto_capital: nuevoCapital })
            .eq('id', prestamo.id);

        if (!error) {
            setMontoRetiro('');
            setMostrandoRetiro(false);
            setCapitalActivoLocal(nuevoCapital);
            prestamo.monto_capital = nuevoCapital;

            if (nuevoMov) {
                setRetirosCapital(prev => [nuevoMov, ...prev]);
            }
            if (onUpdate) onUpdate();

            mostrarAlerta('Retiro Exitoso', `$${monto.toFixed(2)} extraídos a caja. El Capital Activo de este préstamo ha bajado a $${nuevoCapital.toFixed(2)}.`);
        } else {
            mostrarAlerta('Error', 'Hubo un error al actualizar el capital del préstamo.');
        }
    };

    const cuotasConNotas = cuotas.filter(c => c.notas && c.notas.trim() !== '');
    const cuotasPagadas = cuotas.filter(c => c.estado_cobro === 'pagado').length;
    const dineroRecuperadoFisico = cuotasPagadas * prestamo.valor_cuota;

    const totalCapitalExtraido = retirosCapital.reduce((sum, r) => sum + Number(r.monto || 0), 0);
    const capitalOriginalCalculado = capitalActivoLocal + totalCapitalExtraido;

    const deshabilitarRetiro = !esActivo || capitalActivoLocal <= 0;

    return (
        <>
            <div className="fixed inset-0 bg-neutral-950/70 flex items-end md:items-center justify-center p-0 md:p-4 z-50 backdrop-blur-sm transition-opacity">
                <div className="bg-white w-full max-w-lg rounded-t-2xl md:rounded-2xl h-[90vh] md:h-auto max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">

                    <div className="p-4 bg-neutral-900 text-white flex justify-between items-center border-b border-amber-500/30">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black uppercase tracking-widest text-amber-500 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                Cartulina Anubis
                            </span>
                            {!esActivo && (
                                <span className="bg-red-500/20 text-red-300 border border-red-400/40 text-[9px] font-black uppercase px-2 py-0.5 rounded">
                                    {prestamo.estado === 'renovado' ? 'Renovado' : 'Finalizado'}
                                </span>
                            )}
                        </div>
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
                                        const puedeEditar = c.estado_cobro !== 'renovado' && esActivo;
                                        const estaAbiertaParaNota = cuotaParaNota?.id === c.id;

                                        return (
                                            <div key={c.id} className="relative group">
                                                <button
                                                    onClick={() => cambiarEstadoCuota(c)}
                                                    disabled={!puedeEditar}
                                                    className={`w-full aspect-square flex items-center justify-center border-r-2 border-b-2 border-neutral-900 text-lg sm:text-xl font-black transition-transform outline-none focus:outline-none ${puedeEditar ? 'cursor-pointer active:scale-90' : 'cursor-not-allowed'} ${colorClase} ${estaAbiertaParaNota ? 'ring-2 ring-amber-500 z-10' : ''}`}
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

                        {esActivo && cuotaParaNota && (
                            <div key={cuotaParaNota.id} className="bg-amber-50 border border-amber-300 rounded-xl p-3 shadow-sm relative animate-fade-in">
                                <div className="flex justify-between items-center mb-1.5">
                                    <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest">
                                        Nota para la cuota del {cuotaParaNota.fecha_cobro}:
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
                                <p className="text-[9px] text-amber-700 mt-1 italic">*Se guardará con la fecha de hoy automáticamente al salir.</p>
                            </div>
                        )}

                        {cuotasConNotas.length > 0 && (
                            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
                                <button
                                    onClick={() => setVerMotivos(!verMotivos)}
                                    className="w-full p-4 flex justify-between items-center bg-gray-50 hover:bg-gray-100 transition"
                                >
                                    <h3 className="text-xs font-black text-gray-700 uppercase tracking-widest flex items-center gap-2">
                                        <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                        Historial de Motivos
                                    </h3>
                                    <span className="text-gray-500 font-bold text-xs">{verMotivos ? '▲' : '▼'}</span>
                                </button>

                                {verMotivos && (
                                    <div className="p-4 border-t border-gray-100 space-y-2 max-h-40 overflow-y-auto pr-1 bg-white animate-fade-in">
                                        {cuotasConNotas.map(c => (
                                            <div key={c.id} className="flex flex-col border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                                                <div className="flex justify-between items-center text-[10px] font-bold text-gray-400">
                                                    <span>Cuota del: {c.fecha_cobro}</span>
                                                    <span className="uppercase text-amber-600">{c.estado_cobro}</span>
                                                </div>
                                                <p className="text-xs font-medium text-gray-700 bg-gray-50 p-2 rounded-md mt-1 border border-gray-100">"{c.notas}"</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="bg-blue-50 border border-blue-200 rounded-xl overflow-hidden shadow-sm">
                            <button
                                onClick={() => setVerCapital(!verCapital)}
                                className="w-full p-4 flex justify-between items-center bg-blue-100/50 hover:bg-blue-100 transition"
                            >
                                <span className="text-[10px] font-black uppercase tracking-widest text-blue-900 flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Capital & Extracción
                                    {totalCapitalExtraido > 0 && (
                                        <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded text-[9px]">
                                            Extraído: ${totalCapitalExtraido.toFixed(2)}
                                        </span>
                                    )}
                                </span>
                                <span className="text-blue-900 font-bold text-xs">{verCapital ? '▲' : '▼'}</span>
                            </button>

                            {verCapital && (
                                <div className="p-4 flex flex-col gap-3 border-t border-blue-200/50 animate-fade-in">
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="bg-white/80 p-2.5 rounded-lg border border-blue-200/60">
                                            <span className="block text-[9px] font-black uppercase tracking-wider text-blue-600">Capital Inicial</span>
                                            <span className="font-black text-blue-950 text-sm">${capitalOriginalCalculado.toFixed(2)}</span>
                                        </div>
                                        <div className="bg-white/80 p-2.5 rounded-lg border border-blue-200/60">
                                            <span className="block text-[9px] font-black uppercase tracking-wider text-blue-600">Total Recaudado</span>
                                            <span className="font-black text-blue-950 text-sm">${dineroRecuperadoFisico.toFixed(2)}</span>
                                        </div>
                                        <div className="bg-emerald-50/90 p-2.5 rounded-lg border border-emerald-200">
                                            <span className="block text-[9px] font-black uppercase tracking-wider text-emerald-700">Capital Extraído (Caja)</span>
                                            <span className="font-black text-emerald-800 text-sm">${totalCapitalExtraido.toFixed(2)}</span>
                                        </div>
                                        <div className="bg-blue-100/70 p-2.5 rounded-lg border border-blue-300">
                                            <span className="block text-[9px] font-black uppercase tracking-wider text-blue-800">Capital Activo (Calle)</span>
                                            <span className="font-black text-blue-950 text-sm">${capitalActivoLocal.toFixed(2)}</span>
                                        </div>
                                    </div>

                                    {retirosCapital.length > 0 && (
                                        <div className="bg-white rounded-lg border border-blue-200/70 p-2.5 space-y-1.5">
                                            <span className="block text-[9px] font-black uppercase tracking-widest text-blue-800">
                                                Extracciones Realizadas ({retirosCapital.length})
                                            </span>
                                            <div className="max-h-28 overflow-y-auto divide-y divide-gray-100 pr-1">
                                                {retirosCapital.map((r) => (
                                                    <div key={r.id} className="py-1.5 flex justify-between items-center text-xs first:pt-0.5 last:pb-0.5">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-gray-700 text-[11px]">{r.fecha}</span>
                                                            {r.notas && <span className="text-[9px] text-gray-400">{r.notas}</span>}
                                                        </div>
                                                        <span className="font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                                                            -${Number(r.monto).toFixed(2)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {!mostrandoRetiro || !esActivo ? (
                                        <button
                                            onClick={() => setMostrandoRetiro(true)}
                                            disabled={deshabilitarRetiro}
                                            className={`mt-1 bg-white border border-blue-300 text-blue-700 text-xs font-bold py-2.5 rounded-lg transition shadow-sm ${deshabilitarRetiro ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-100'}`}
                                        >
                                            Extraer Capital a Caja
                                        </button>
                                    ) : (
                                        <div className="flex gap-2 mt-1 animate-fade-in">
                                            <input
                                                type="number" min="0" step="0.01"
                                                value={montoRetiro}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val === '' || Number(val) >= 0) setMontoRetiro(val);
                                                }}
                                                placeholder="Monto ($)"
                                                className="flex-1 border border-blue-300 rounded-lg p-2 text-xs font-bold outline-none focus:border-blue-500 bg-white"
                                                autoFocus
                                            />
                                            <button
                                                onClick={confirmarRetiroCapital}
                                                className="bg-blue-600 text-white text-xs font-bold px-3 rounded-lg hover:bg-blue-700 transition shadow-sm"
                                            >
                                                Retirar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { setMostrandoRetiro(false); setMontoRetiro(''); }}
                                                className="bg-white border border-blue-200 text-blue-700 text-xs font-bold px-2.5 rounded-lg hover:bg-blue-50 transition"
                                                title="Cancelar"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col gap-2 bg-gray-50 p-3 rounded-xl border border-gray-100 mt-2">
                            <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest text-center">
                                {esActivo ? '¿Quién cobra este crédito?' : 'Cobrador asignado'}
                            </span>
                            <div className={`flex bg-gray-200 p-1 rounded-lg ${!esActivo ? 'opacity-70' : ''}`}>
                                <button
                                    onClick={() => handleCambiarCobrador('principal')}
                                    disabled={!esActivo}
                                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-md transition-all disabled:cursor-not-allowed ${cobradorLocal === 'principal' ? 'bg-neutral-900 text-amber-500 shadow-sm' : 'text-gray-500 hover:text-neutral-800'}`}
                                >
                                    Yo (Principal)
                                </button>
                                <button
                                    onClick={() => handleCambiarCobrador('ayudante')}
                                    disabled={!esActivo}
                                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-md transition-all disabled:cursor-not-allowed ${cobradorLocal === 'ayudante' ? 'bg-neutral-900 text-amber-500 shadow-sm' : 'text-gray-500 hover:text-neutral-800'}`}
                                >
                                    Ayudante
                                </button>
                            </div>
                        </div>
                    </div>

                    {esActivo ? (
                        <div className="p-4 border-t border-neutral-200 bg-neutral-50 flex gap-2">
                            <button onClick={pedirConfirmacionRenovar} className="flex-1 bg-neutral-900 text-amber-500 font-black uppercase tracking-wider py-3 rounded-lg hover:bg-black shadow-md text-xs flex items-center justify-center gap-2 transition">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                Renovar
                            </button>
                            <button onClick={pedirConfirmacionFinalizar} className="flex-1 bg-amber-500 text-neutral-950 font-black uppercase tracking-wider py-3 rounded-lg hover:bg-amber-600 shadow-md text-xs flex items-center justify-center gap-2 transition">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                Finalizar
                            </button>
                        </div>
                    ) : (
                        <div className="p-3 border-t border-neutral-200 bg-neutral-100 text-center">
                            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                                Crédito {prestamo.estado === 'renovado' ? 'Renovado' : 'Finalizado'} • Solo Lectura
                            </span>
                        </div>
                    )}
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