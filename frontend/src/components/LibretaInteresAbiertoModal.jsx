import { useState, useEffect, useMemo } from 'react';
import supabase from '../supabaseClient';
import ConfirmModal from './ConfirmModal';
import { generarLibretaPDF } from '../utils/generarLibretaPDF';

export default function LibretaInteresAbiertoModal({ prestamo, onClose, onFinalizar, onUpdate }) {
    const [movimientos, setMovimientos] = useState([]);
    const [cargando, setCargando] = useState(true);

    // Formularios de movimientos
    const [montoAccion, setMontoAccion] = useState('');
    const [notaAccion, setNotaAccion] = useState('');
    const [tipoAccion, setTipoAccion] = useState(null);

    // Liquidación y Negociación
    const [modoLiquidacion, setModoLiquidacion] = useState(false);
    const [interesLiquidacion, setInteresLiquidacion] = useState('');
    const [mostrarNegociar, setMostrarNegociar] = useState(false);
    const [nuevoInteres, setNuevoInteres] = useState('');

    const [modalConf, setModalConf] = useState({ isOpen: false, titulo: '', mensaje: '', accion: null });

    // Edición de Parámetros (Frecuencia / Refinanciamiento original)
    const [editandoParametros, setEditandoParametros] = useState(false);
    const [nuevaFecha, setNuevaFecha] = useState('');
    const [nuevaFrecuencia, setNuevaFrecuencia] = useState('');
    const [nuevosDiasEspeciales, setNuevosDiasEspeciales] = useState('');

    // Edición independiente de la fecha de inicio (con el botón de lápiz)
    const [editandoFechaInicio, setEditandoFechaInicio] = useState(false);
    const [fechaInicioTemporal, setFechaInicioTemporal] = useState('');

    const hoyStr = useMemo(() => {
        const d = new Date();
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split('T')[0];
    }, []);

    const { id: prestamoId, fecha_inicio: fechaInicio, monto_total: montoTotal, monto_capital: montoCapital, cobrador, clientes, frecuencia, estado, prestamista_id } = prestamo || {};
    const [cobradorLocal, setCobradorLocal] = useState(cobrador || 'principal');

    // LÓGICAS DE FRECUENCIA
    const isFrecuenciaPorDias = frecuencia?.startsWith('dias_');
    const diasFrecuencia = isFrecuenciaPorDias ? parseInt(frecuencia.split('_')[1]) : 30;
    const isPersonalizado = isFrecuenciaPorDias && frecuencia !== 'dias_7' && frecuencia !== 'dias_15';

    // FRACCIONAMIENTO DEL INTERÉS MENSUAL
    const cortesPorMes = useMemo(() => {
        if (frecuencia === 'dias_7') return 4;
        if (frecuencia === 'dias_15') return 2;
        if (isFrecuenciaPorDias) return 30 / (diasFrecuencia || 30);
        return 1;
    }, [frecuencia, isFrecuenciaPorDias, diasFrecuencia]);

    // ----------------------------------------------------
    // FUNCIONES ESTRICTAS EN UTC (SINCRONIZADAS)
    // ----------------------------------------------------
    const sumarDias = (fechaBaseStr, dias) => {
        const [a, m, d] = fechaBaseStr.split('-').map(Number);
        const fecha = new Date(Date.UTC(a, m - 1, d));
        fecha.setUTCDate(fecha.getUTCDate() + dias);
        return fecha.toISOString().split('T')[0];
    };

    const sumarMesesPreservandoDia = (fechaBaseStr, mesesAMultiplicar) => {
        const [anioIni, mesIni, diaIni] = fechaBaseStr.split('-').map(Number);
        const fechaDestino = new Date(Date.UTC(anioIni, mesIni - 1 + mesesAMultiplicar, 1));
        const anioDestino = fechaDestino.getUTCFullYear();
        const mesDestino = fechaDestino.getUTCMonth();
        const ultimoDia = new Date(Date.UTC(anioDestino, mesDestino + 1, 0)).getUTCDate();
        const diaEfectivo = Math.min(diaIni, ultimoDia);
        return `${anioDestino}-${String(mesDestino + 1).padStart(2, '0')}-${String(diaEfectivo).padStart(2, '0')}`;
    };

    useEffect(() => {
        if (prestamoId) {
            setCobradorLocal(cobrador || 'principal');
            setNuevaFecha(fechaInicio || '');
            setFechaInicioTemporal(fechaInicio || '');

            if (frecuencia === 'mensual') setNuevaFrecuencia('mensual');
            else if (frecuencia === 'dias_7') setNuevaFrecuencia('dias_7');
            else if (frecuencia === 'dias_15') setNuevaFrecuencia('dias_15');
            else if (isPersonalizado) {
                setNuevaFrecuencia('dias_especial');
                setNuevosDiasEspeciales(diasFrecuencia.toString());
            }

            setModoLiquidacion(false);
            setMostrarNegociar(false);
            fetchMovimientos();
        }
    }, [prestamoId, frecuencia, fechaInicio, isPersonalizado, diasFrecuencia, cobrador]);

    const fetchMovimientos = async () => {
        setCargando(true);
        const { data } = await supabase.from('movimientos_mensuales').select('*').eq('prestamo_id', prestamoId).order('fecha', { ascending: false });
        if (data) setMovimientos(data);
        setCargando(false);
    };

    const calculos = useMemo(() => {
        if (!fechaInicio) return { cortes: 0, generado: 0, pagado: 0, ajustes: 0, pendiente: 0, proximoCorte: '', cronograma: [] };

        const capitalOriginal = parseFloat(montoTotal);
        const interesPorCorteFijo = (capitalOriginal * 0.20) / cortesPorMes;

        let generado = 0;
        let cortesTranscurridos = 0;
        let proximoCorteStr = '';
        let cronograma = [];

        if (isFrecuenciaPorDias) {
            let fechaCorteEfectiva = sumarDias(fechaInicio, diasFrecuencia);
            while (fechaCorteEfectiva <= hoyStr) {
                generado += interesPorCorteFijo;
                cortesTranscurridos++;
                cronograma.push({ numero: cortesTranscurridos, fecha: fechaCorteEfectiva, estado: 'pasado' });
                fechaCorteEfectiva = sumarDias(fechaInicio, diasFrecuencia * (cortesTranscurridos + 1));
            }
            proximoCorteStr = fechaCorteEfectiva;
            cronograma.push({ numero: cortesTranscurridos + 1, fecha: proximoCorteStr, estado: 'proximo' });
        } else {
            let i = 1;
            let fechaCorteEfectiva = sumarMesesPreservandoDia(fechaInicio, i);

            while (fechaCorteEfectiva <= hoyStr) {
                generado += interesPorCorteFijo;
                cortesTranscurridos++;
                cronograma.push({ numero: cortesTranscurridos, fecha: fechaCorteEfectiva, estado: 'pasado' });
                i++;
                fechaCorteEfectiva = sumarMesesPreservandoDia(fechaInicio, i);
            }
            proximoCorteStr = fechaCorteEfectiva;
            cronograma.push({ numero: cortesTranscurridos + 1, fecha: proximoCorteStr, estado: 'proximo' });
        }

        const pagado = movimientos.filter(m => m.tipo === 'pago_interes').reduce((sum, m) => sum + parseFloat(m.monto), 0);
        const ajustes = movimientos.filter(m => m.tipo === 'ajuste_interes').reduce((sum, m) => sum + parseFloat(m.monto), 0);
        const pendiente = generado - pagado - ajustes;

        return { cortes: cortesTranscurridos, generado, pagado, ajustes, pendiente: Math.max(0, pendiente), proximoCorte: proximoCorteStr, cronograma };
    }, [fechaInicio, montoTotal, hoyStr, isFrecuenciaPorDias, diasFrecuencia, cortesPorMes, movimientos]);

    const interesSugeridoMensual = useMemo(() => (parseFloat(montoTotal || 0) * 0.20).toFixed(2), [montoTotal]);
    const interesPorCorteSugerido = useMemo(() => (parseFloat(montoTotal || 0) * 0.20 / cortesPorMes).toFixed(2), [montoTotal, cortesPorMes]);

    const handleCambiarCobrador = async (nuevoCobrador) => {
        setCobradorLocal(nuevoCobrador);
        const { error } = await supabase.from('prestamos').update({ cobrador: nuevoCobrador }).eq('id', prestamoId);
        if (!error && onUpdate) onUpdate();
        else setCobradorLocal(cobrador || 'principal');
    };

    const ejecutarRefinanciamiento = async (frecFinal) => {
        setModalConf({ isOpen: false, accion: null });
        setCargando(true);

        const capActual = parseFloat(montoCapital);
        if (capActual <= 0) {
            alert("No se puede refinanciar un crédito sin capital pendiente.");
            setCargando(false);
            return;
        }

        await supabase.from('prestamos').update({ estado: 'renovado', fecha_cierre: hoyStr }).eq('id', prestamoId);
        const valorCuotaNuevo = (capActual * 0.20).toFixed(2);

        const { data: nuevoPrestamo, error } = await supabase.from('prestamos').insert([{
            prestamista_id: prestamista_id,
            cliente_id: clientes.id,
            monto_capital: capActual,
            interes_total: 0,
            monto_total: capActual,
            saldo_pendiente: capActual,
            frecuencia: frecFinal,
            valor_cuota: valorCuotaNuevo,
            fecha_inicio: nuevaFecha,
            cobrador: cobradorLocal,
            tipo_prestamo: 'mensual_interes'
        }]).select().single();

        if (!error && nuevoPrestamo) {
            let fechaCobroStr = '';
            if (frecFinal === 'mensual') {
                fechaCobroStr = sumarMesesPreservandoDia(nuevaFecha, 1);
            } else {
                const dExtra = parseInt(frecFinal.split('_')[1]) || 30;
                fechaCobroStr = sumarDias(nuevaFecha, dExtra);
            }

            await supabase.from('historial_pagos').insert([{
                prestamo_id: nuevoPrestamo.id,
                fecha_cobro: fechaCobroStr,
                estado_cobro: 'pendiente',
                monto_recibido: 0
            }]);

            await supabase.from('movimientos_mensuales').insert([{
                prestamo_id: nuevoPrestamo.id,
                fecha: nuevaFecha,
                tipo: 'corte_mes',
                monto: capActual,
                notas: `Refinanciamiento por cambio de frecuencia. Anterior: ${obtenerTextoFrecuenciaActual()}`
            }]);

            setEditandoParametros(false);
            onClose();
            if (onUpdate) onUpdate();
        } else {
            alert("Error al refinanciar: " + error.message);
            setCargando(false);
        }
    };

    const ejecutarCambioParametros = async () => {
        let frecFinal = nuevaFrecuencia;
        if (nuevaFrecuencia === 'dias_especial') {
            const diasInt = parseInt(nuevosDiasEspeciales) || 30;
            frecFinal = `dias_${diasInt}`;
        }

        const cambioFrecuenciaReal = (frecuencia !== frecFinal);

        if (cambioFrecuenciaReal) {
            if (calculos.pendiente > 0) {
                alert("Para cambiar la frecuencia, primero debes cobrar o negociar el interés pendiente ($" + calculos.pendiente.toFixed(2) + ").");
                return;
            }
            setModalConf({
                isOpen: true,
                titulo: 'Refinanciar Crédito',
                mensaje: `Se cerrará este préstamo y se abrirá uno nuevo ${frecFinal.replace('dias_', 'Quincenal/Semanal ')} a partir del ${nuevaFecha}. ¿Continuar?`,
                accion: () => ejecutarRefinanciamiento(frecFinal)
            });
        } else {
            setModalConf({
                isOpen: true,
                titulo: 'Corregir Fecha',
                mensaje: 'Se actualizará la fecha de inicio. Úsalo solo si te equivocaste al crear el préstamo.',
                accion: async () => {
                    setModalConf({ isOpen: false, accion: null });
                    const { error } = await supabase.from('prestamos').update({ fecha_inicio: nuevaFecha }).eq('id', prestamoId);
                    if (!error) { setEditandoParametros(false); if (onUpdate) onUpdate(); }
                    else alert("Error al corregir fecha.");
                }
            });
        }
    };

    const guardarFechaInicio = async () => {
        if (!fechaInicioTemporal) return;
        setModalConf({
            isOpen: true,
            titulo: 'Corregir Fecha de Inicio',
            mensaje: `¿Deseas actualizar la fecha de inicio a ${fechaInicioTemporal}? Se recalcularán los cortes y se actualizará el registro en el historial.`,
            accion: async () => {
                setModalConf({ isOpen: false, accion: null });
                setCargando(true);

                const { error: errPrestamo } = await supabase.from('prestamos').update({ fecha_inicio: fechaInicioTemporal }).eq('id', prestamoId);

                if (errPrestamo) {
                    alert("Error al actualizar la fecha del préstamo: " + errPrestamo.message);
                    setCargando(false);
                    return;
                }

                await supabase.from('movimientos_mensuales')
                    .update({
                        fecha: fechaInicioTemporal,
                        notas: 'Fecha de inicio corregida'
                    })
                    .eq('prestamo_id', prestamoId)
                    .eq('tipo', 'corte_mes');

                setEditandoFechaInicio(false);
                setCargando(false);
                fetchMovimientos();
                if (onUpdate) onUpdate();
            }
        });
    };

    const ejecutarGuardado = async (monto) => {
        setModalConf({ isOpen: false, accion: null });
        const { error } = await supabase.from('movimientos_mensuales').insert([{
            prestamo_id: prestamoId, fecha: hoyStr, tipo: tipoAccion, monto: monto,
            notas: notaAccion || (tipoAccion === 'abono_capital' ? 'Abono parcial al capital' : 'Pago de interés')
        }]);

        if (!error) {
            if (tipoAccion === 'abono_capital') await supabase.from('prestamos').update({ monto_capital: Math.max(0, parseFloat(montoCapital) - monto) }).eq('id', prestamoId);
            setMontoAccion(''); setNotaAccion(''); setTipoAccion(null); fetchMovimientos(); if (onUpdate) onUpdate();
        } else alert("Error al registrar el movimiento.");
    };

    const handleNegociarInteres = async (e) => {
        e.preventDefault();
        const nuevoTotal = parseFloat(nuevoInteres);
        if (isNaN(nuevoTotal) || nuevoTotal < 0) return alert("Ingrese un valor válido");

        const diferencia = calculos.pendiente - nuevoTotal;
        if (diferencia === 0) return setMostrarNegociar(false);

        setModalConf({
            isOpen: true,
            titulo: diferencia > 0 ? 'Aplicar Descuento' : 'Aplicar Recargo',
            mensaje: diferencia > 0
                ? `La deuda actual es $${calculos.pendiente.toFixed(2)}. ¿Deseas aplicar un DESCUENTO de $${diferencia.toFixed(2)} para que la deuda baje a $${nuevoTotal.toFixed(2)}?`
                : `La deuda actual es $${calculos.pendiente.toFixed(2)}. ¿Deseas aplicar un RECARGO de $${Math.abs(diferencia).toFixed(2)} para que la deuda suba a $${nuevoTotal.toFixed(2)}?`,
            accion: () => ejecutarNegociacion(diferencia, nuevoTotal)
        });
    };

    const ejecutarNegociacion = async (diferencia, nuevoTotal) => {
        setModalConf({ isOpen: false, accion: null });
        setCargando(true);
        const { error } = await supabase.from('movimientos_mensuales').insert([{
            prestamo_id: prestamoId, tipo: 'ajuste_interes', monto: diferencia, fecha: hoyStr,
            notas: diferencia > 0 ? `Negociación: Descuento aplicado para bajar deuda a $${nuevoTotal.toFixed(2)}` : `Ajuste: Recargo aplicado para subir deuda a $${nuevoTotal.toFixed(2)}`
        }]);
        if (!error) { setNuevoInteres(''); setMostrarNegociar(false); fetchMovimientos(); if (onUpdate) onUpdate(); }
        else { alert("Error al aplicar negociación"); setCargando(false); }
    };

    const ejecutarLiquidacion = async (intCobrado) => {
        setModalConf({ isOpen: false, accion: null });
        setCargando(true);
        const capPendiente = parseFloat(montoCapital) || 0;
        const movs = [];

        if (capPendiente > 0) movs.push({ prestamo_id: prestamoId, fecha: hoyStr, tipo: 'abono_capital', monto: capPendiente, notas: 'Liquidación total del capital' });
        if (intCobrado > 0) movs.push({ prestamo_id: prestamoId, fecha: hoyStr, tipo: 'pago_interes', monto: intCobrado, notas: 'Liquidación final de interés acordado' });

        const descuentoEnLiquidacion = calculos.pendiente - intCobrado;
        if (descuentoEnLiquidacion !== 0) {
            movs.push({ prestamo_id: prestamoId, fecha: hoyStr, tipo: 'ajuste_interes', monto: descuentoEnLiquidacion, notas: descuentoEnLiquidacion > 0 ? 'Descuento en Liquidación Final' : 'Recargo en Liquidación Final' });
        }

        if (movs.length > 0) await supabase.from('movimientos_mensuales').insert(movs);
        await supabase.from('prestamos').update({ monto_capital: 0, estado: 'cerrado' }).eq('id', prestamoId);
        setModoLiquidacion(false);
        if (onFinalizar) onFinalizar();
    };

    const getTipoBadge = (tipo) => {
        switch (tipo) {
            case 'corte_mes': return <span className="font-black uppercase text-[9px] px-2 py-0.5 rounded bg-blue-100 text-blue-800">Inicio</span>;
            case 'pago_interes': return <span className="font-black uppercase text-[9px] px-2 py-0.5 rounded bg-green-100 text-green-800">Pago Int.</span>;
            case 'abono_capital': return <span className="font-black uppercase text-[9px] px-2 py-0.5 rounded bg-amber-100 text-amber-800">Abono Cap.</span>;
            case 'ajuste_interes': return <span className="font-black uppercase text-[9px] px-2 py-0.5 rounded bg-purple-100 text-purple-800">Ajuste</span>;
            default: return <span className="font-black uppercase text-[9px] px-2 py-0.5 rounded bg-gray-200 text-gray-700">{tipo}</span>;
        }
    };

    const obtenerTextoFrecuenciaActual = () => {
        if (frecuencia === 'mensual') return 'Mensual (Mes a Mes)';
        if (frecuencia === 'dias_7') return 'Semanal (7 Días)';
        if (frecuencia === 'dias_15') return 'Quincenal (15 Días)';
        if (isPersonalizado) return `Especial (${diasFrecuencia} Días)`;
        return frecuencia;
    };

    return (
        <>
            <div className="fixed inset-0 bg-neutral-950/70 flex items-end md:items-center justify-center p-0 md:p-4 z-50 backdrop-blur-sm transition-opacity">
                <div className="bg-white w-full max-w-lg rounded-t-2xl md:rounded-2xl h-[90vh] md:h-auto max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                    <div className={`p-4 text-white flex justify-between items-center ${isPersonalizado ? 'bg-emerald-900 border-b border-emerald-500/30' : 'bg-neutral-900 border-b border-amber-500/30'}`}>
                        <span className={`text-xs font-black uppercase tracking-widest flex items-center gap-2 ${isPersonalizado ? 'text-emerald-400' : 'text-amber-500'}`}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                            Libreta Abierta
                        </span>

                        <div className="flex gap-4">
                            <button
                                onClick={() => generarLibretaPDF(prestamo, movimientos, calculos)}
                                disabled={cargando}
                                className="text-neutral-400 hover:text-white transition flex items-center gap-1 text-[10px] uppercase font-bold"
                                title="Descargar Estado de Cuenta"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                PDF
                            </button>

                            <button onClick={onClose} className="text-neutral-400 hover:text-white transition p-1">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    </div>

                    <div className="p-4 md:p-6 overflow-y-auto flex-1 bg-amber-50/20 select-none space-y-4">
                        <div className="border-2 border-neutral-900 bg-white shadow-sm p-4 font-mono relative">
                            <div className={`absolute top-0 left-0 w-full h-1 ${isPersonalizado ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>

                            <div className="mb-4 text-sm font-bold leading-relaxed text-neutral-700">
                                <div className="flex justify-between items-center border-b border-neutral-200 border-dashed pb-1 mb-2">
                                    <div className="flex items-center">
                                        <span className="w-24 text-neutral-400">Cliente:</span>
                                        <span className="truncate">{clientes?.nombre}</span>
                                    </div>
                                    {!editandoParametros && (
                                        <button onClick={() => setEditandoParametros(true)} className="text-[9px] bg-amber-100 text-amber-700 px-2 py-1 rounded font-black uppercase hover:bg-amber-200 border border-amber-200 flex items-center gap-1">
                                            ⚙️ Ajustes
                                        </button>
                                    )}
                                </div>

                                {editandoParametros ? (
                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 space-y-3 animate-fade-in">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] font-black uppercase text-amber-800">Fecha de Inicio / Refinanciamiento:</label>
                                            <input type="date" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} className="w-full text-xs font-black bg-white border border-amber-300 rounded p-2 outline-none focus:border-amber-500" />
                                        </div>

                                        <div className="flex flex-col gap-1 pt-2 border-t border-amber-200/50">
                                            <label className="text-[10px] font-black uppercase text-amber-800">Cambiar Frecuencia (Refinanciar):</label>
                                            <select value={nuevaFrecuencia} onChange={(e) => setNuevaFrecuencia(e.target.value)} className="w-full text-xs font-black bg-white border border-amber-300 rounded p-2 outline-none focus:border-amber-500">
                                                <option value="dias_7">Semanal (7 Días)</option>
                                                <option value="dias_15">Quincenal (15 Días)</option>
                                                <option value="mensual">Mensual (Mes a Mes)</option>
                                                <option value="dias_especial">Personalizado (Por Días)</option>
                                            </select>
                                        </div>

                                        {nuevaFrecuencia === 'dias_especial' && (
                                            <div className="flex flex-col gap-1 animate-fade-in">
                                                <label className="text-[10px] font-black uppercase text-amber-800">¿Cada cuántos días?</label>
                                                <input type="number" min="1" value={nuevosDiasEspeciales} onChange={(e) => setNuevosDiasEspeciales(e.target.value)} placeholder="Ej: 40" className="w-full text-xs font-black bg-white border border-amber-300 rounded p-2 outline-none focus:border-amber-500" />
                                            </div>
                                        )}

                                        <div className="flex gap-2 pt-2 border-t border-amber-200/50">
                                            <button onClick={() => setEditandoParametros(false)} className="flex-1 bg-white border border-gray-300 text-gray-600 font-black py-2 rounded text-[10px] uppercase tracking-wider hover:bg-gray-50">Cancelar</button>
                                            <button onClick={ejecutarCambioParametros} className="flex-1 bg-amber-500 text-white font-black py-2 rounded text-[10px] uppercase tracking-wider hover:bg-amber-600 shadow-sm">Aplicar</button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex justify-between items-center border-b border-neutral-200 border-dashed pb-1 mb-1">
                                            <div className="flex items-center gap-2">
                                                <span className="w-24 text-neutral-400">Inicio:</span>
                                                {editandoFechaInicio ? (
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            type="date"
                                                            value={fechaInicioTemporal}
                                                            onChange={(e) => setFechaInicioTemporal(e.target.value)}
                                                            className="text-xs font-black bg-amber-50 border border-amber-300 rounded px-1 py-0.5 outline-none"
                                                        />
                                                        <button onClick={guardarFechaInicio} className="text-[10px] bg-green-600 text-white px-1.5 py-0.5 rounded font-black hover:bg-green-700">✓</button>
                                                        <button onClick={() => setEditandoFechaInicio(false)} className="text-[10px] bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded font-black hover:bg-gray-300">✕</button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5">
                                                        <span>{fechaInicio}</span>
                                                        <button
                                                            onClick={() => { setFechaInicioTemporal(fechaInicio); setEditandoFechaInicio(true); }}
                                                            className="text-neutral-400 hover:text-amber-600 transition p-0.5"
                                                            title="Corregir Fecha de Inicio"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex border-b border-neutral-200 border-dashed pb-1 mb-1">
                                            <span className="w-24 text-neutral-400">Frecuencia:</span>
                                            <span className="font-black text-amber-600">{obtenerTextoFrecuenciaActual()}</span>
                                        </div>
                                    </>
                                )}

                                <div className="flex border-b border-neutral-200 border-dashed pb-1 mb-1 mt-2">
                                    <span className="w-24 text-neutral-400">Capital Actual:</span>
                                    <span className="text-neutral-900 text-base font-black">${montoCapital}</span>
                                </div>
                                <div className="flex border-b border-neutral-200 border-dashed pb-1 mb-1 text-amber-700">
                                    <span className="w-24 text-neutral-400 font-bold">Int. Mensual (20%):</span>
                                    <span className="font-black">${interesSugeridoMensual}</span>
                                </div>
                                {cortesPorMes > 1 && (
                                    <div className="flex border-b border-neutral-200 border-dashed pb-1 mb-1 text-amber-600">
                                        <span className="w-24 text-neutral-400 font-bold">Int. por Corte:</span>
                                        <span className="font-black">${interesPorCorteSugerido}</span>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-2 mb-3">
                                <div className="bg-gray-100 p-2 rounded-lg border border-gray-200 text-center">
                                    <span className="block text-[9px] font-black uppercase text-gray-500">Cortes Transcurridos</span>
                                    <span className="text-xs font-black text-gray-800">{cargando ? '...' : `${calculos.cortes} cortes`}</span>
                                </div>
                                <div className="bg-gray-100 p-2 rounded-lg border border-gray-200 text-center">
                                    <span className="block text-[9px] font-black uppercase text-gray-500">Próximo Corte</span>
                                    <span className="text-xs font-black text-gray-800">{cargando ? '...' : calculos.proximoCorte}</span>
                                </div>
                            </div>

                            {calculos.cronograma && calculos.cronograma.length > 0 && (
                                <div className="mb-4 bg-white border border-gray-200 rounded-lg p-2 max-h-32 overflow-y-auto shadow-inner">
                                    <span className="block text-[9px] font-black uppercase text-gray-400 mb-2 sticky top-0 bg-white pb-1">Cronograma de Cortes</span>
                                    <div className="space-y-1">
                                        {calculos.cronograma.map(c => (
                                            <div key={c.numero} className={`flex justify-between items-center p-1.5 rounded text-[10px] uppercase font-black tracking-wider ${c.estado === 'proximo' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'text-gray-500'}`}>
                                                <span>Corte #{c.numero}</span>
                                                <span className="flex items-center gap-1">
                                                    {c.fecha}
                                                    {c.estado === 'proximo' ? <span className="text-amber-600">(Próximo)</span> : <span className="text-green-500">✓</span>}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className={`p-3 rounded-xl border mb-4 text-center shadow-inner transition-colors duration-300 ${cargando ? 'bg-gray-50 border-gray-200' : calculos.pendiente > 0 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
                                <p className="text-[10px] font-black uppercase tracking-widest mb-1">{cargando ? 'Calculando...' : calculos.pendiente > 0 ? ' Interés Atrasado (Pendiente)' : 'Interés Pendiente'}</p>
                                <p className="text-2xl font-black">${cargando ? '0.00' : calculos.pendiente.toFixed(2)}</p>

                                {calculos.pendiente > 0 && !modoLiquidacion && (
                                    <button onClick={() => setMostrarNegociar(!mostrarNegociar)} className="mt-2 text-[9px] font-black uppercase bg-white/50 px-2 py-1 rounded border border-current hover:bg-white/80">
                                        {mostrarNegociar ? 'Cancelar Negociación' : 'Negociar Deuda'}
                                    </button>
                                )}

                                <div className="text-[9px] font-bold mt-2 flex justify-center gap-4 text-neutral-600">
                                    <span>Gen: <b className="text-neutral-900">${cargando ? '...' : calculos.generado.toFixed(2)}</b></span>
                                    <span>Pag: <b className="text-neutral-900">${cargando ? '...' : calculos.pagado.toFixed(2)}</b></span>
                                    {calculos.ajustes !== 0 && <span className="text-purple-600">Ajuste: <b>${Math.abs(calculos.ajustes).toFixed(2)}</b></span>}
                                </div>
                            </div>

                            {mostrarNegociar && (
                                <div className="bg-purple-50 p-3 rounded-xl border border-purple-200 mb-4 animate-fade-in">
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-purple-700 mb-1">Acuerdo de Pago</h3>
                                    <p className="text-[9px] text-purple-600 mb-2">Ingresa el <strong>nuevo monto total</strong> que debe pagarte de interés.</p>
                                    <form onSubmit={handleNegociarInteres} className="flex gap-2">
                                        <input type="number" step="0.01" min="0" required value={nuevoInteres} onChange={(e) => setNuevoInteres(e.target.value)} placeholder="Ej: 50.00" className="flex-1 bg-white border border-purple-300 rounded p-1.5 text-purple-900 text-xs font-bold outline-none" />
                                        <button type="submit" disabled={cargando} className="bg-purple-600 text-white px-3 rounded font-black text-[9px] uppercase tracking-wider hover:bg-purple-700">Aplicar</button>
                                    </form>
                                </div>
                            )}

                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => setTipoAccion('abono_capital')} disabled={cargando || modoLiquidacion} className={`p-3 rounded-xl font-black text-xs uppercase tracking-wider border transition-all ${tipoAccion === 'abono_capital' ? 'bg-neutral-900 text-amber-500 border-neutral-900' : 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200 disabled:opacity-50'}`}>
                                        + Abono Capital
                                    </button>
                                    <button onClick={() => { setTipoAccion('pago_interes'); if (calculos.pendiente > 0) setMontoAccion(calculos.pendiente.toFixed(2)); }} disabled={cargando || modoLiquidacion} className={`p-3 rounded-xl font-black text-xs uppercase tracking-wider border transition-all ${tipoAccion === 'pago_interes' ? 'bg-neutral-900 text-amber-500 border-neutral-900' : 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200 disabled:opacity-50'}`}>
                                        + Pago Interés
                                    </button>
                                </div>

                                {tipoAccion && (
                                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 space-y-2 animate-fade-in">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-amber-900">Registrar {tipoAccion === 'abono_capital' ? 'Abono a Capital' : 'Pago de Interés'}</span>
                                            <button onClick={() => { setTipoAccion(null); setMontoAccion(''); }} className="text-amber-800 font-bold text-xs">✕</button>
                                        </div>
                                        <div className="flex gap-2">
                                            <input type="number" step="0.01" min="0.01" placeholder="Monto ($)" value={montoAccion} onChange={(e) => setMontoAccion(e.target.value)} className="w-1/2 bg-white border border-amber-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-amber-500" autoFocus />
                                            <input type="text" placeholder="Nota opcional..." value={notaAccion} onChange={(e) => setNotaAccion(e.target.value)} className="w-1/2 bg-white border border-amber-200 rounded-lg p-2 text-xs font-medium outline-none focus:border-amber-500" />
                                        </div>
                                        <button onClick={() => setModalConf({ isOpen: true, titulo: 'Confirmar Acción', mensaje: `¿Registrar $${montoAccion}?`, accion: () => ejecutarGuardado(parseFloat(montoAccion)) })} className="w-full bg-amber-500 text-neutral-950 font-black py-2 rounded-lg text-xs uppercase tracking-wider hover:bg-amber-600 transition">
                                            Guardar Movimiento
                                        </button>
                                    </div>
                                )}

                                <div className="border-t border-gray-200 pt-3">
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Historial de Transacciones</h3>
                                    {cargando ? (
                                        <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div></div>
                                    ) : movimientos.length === 0 ? (
                                        <p className="text-xs text-gray-400 text-center py-3">Sin movimientos registrados aún.</p>
                                    ) : (
                                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                            {movimientos.map(m => (
                                                <div key={m.id} className="flex justify-between items-center bg-gray-50 p-2.5 rounded-lg border border-gray-100 text-xs">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            {getTipoBadge(m.tipo)}
                                                            <span className="text-[10px] font-bold text-gray-400">{m.fecha}</span>
                                                        </div>
                                                        {m.notas && <p className="text-[11px] text-gray-600 mt-1 font-medium">"{m.notas}"</p>}
                                                    </div>
                                                    <span className={`font-black text-sm ${m.tipo === 'ajuste_interes' ? 'text-purple-600' : 'text-neutral-800'}`}>${parseFloat(m.monto).toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 bg-gray-50 p-3 rounded-xl border border-gray-100 mt-2">
                            <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest text-center">¿Quién cobra este crédito?</span>
                            <div className="flex bg-gray-200 p-1 rounded-lg">
                                <button onClick={() => handleCambiarCobrador('principal')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-md transition-all ${cobradorLocal === 'principal' ? 'bg-neutral-900 text-amber-500 shadow-sm' : 'text-gray-500 hover:text-neutral-800'}`}>Yo (Principal)</button>
                                <button onClick={() => handleCambiarCobrador('ayudante')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-md transition-all ${cobradorLocal === 'ayudante' ? 'bg-neutral-900 text-amber-500 shadow-sm' : 'text-gray-500 hover:text-neutral-800'}`}>Ayudante</button>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 border-t border-neutral-200 bg-neutral-50 flex flex-col gap-2">
                        {estado === 'activo' && !modoLiquidacion && (
                            <button onClick={() => { setTipoAccion(null); setMostrarNegociar(false); setInteresLiquidacion(Math.max(0, calculos.pendiente).toFixed(2)); setModoLiquidacion(true); }} className="w-full bg-amber-500 text-neutral-950 font-black uppercase tracking-wider py-3 rounded-lg hover:bg-amber-600 shadow-md text-xs flex items-center justify-center gap-2 transition">
                                Finalizar / Liquidar Crédito
                            </button>
                        )}

                        {modoLiquidacion && (
                            <div className="w-full bg-red-50 border border-red-200 rounded-xl p-3 flex flex-col gap-3 animate-fade-in shadow-inner">
                                <div className="text-center"><span className="text-[10px] font-black uppercase text-red-600 tracking-widest">Liquidación Anticipada</span></div>
                                <div className="flex justify-between items-center text-sm border-b border-red-200 pb-1">
                                    <span className="text-red-700 font-bold">Capital a saldar:</span>
                                    <span className="font-black text-red-900">${montoCapital}</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-red-700 font-bold">Interés pendiente sugerido:</span>
                                        <span className="font-black text-red-900">${Math.max(0, calculos.pendiente).toFixed(2)}</span>
                                    </div>
                                    <label className="text-[10px] font-black uppercase text-red-500 mt-1">Interés acordado a cobrar:</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-red-700">$</span>
                                        <input type="number" step="0.01" min="0" value={interesLiquidacion} onChange={(e) => setInteresLiquidacion(e.target.value)} className="w-full bg-white border border-red-300 rounded-lg pl-7 pr-3 py-2 font-black text-red-900 outline-none focus:border-red-500 transition" />
                                    </div>
                                    <p className="text-[9px] text-red-500 mt-1">Si este monto difiere del sugerido, se creará un Ajuste Contable automático.</p>
                                </div>
                                <div className="flex gap-2 mt-1">
                                    <button onClick={() => setModoLiquidacion(false)} className="flex-1 bg-white border border-red-200 text-red-600 font-black py-2 rounded-lg text-xs uppercase tracking-wider hover:bg-red-50 transition">Cancelar</button>
                                    <button onClick={() => setModalConf({ isOpen: true, titulo: 'Confirmar Liquidación', mensaje: `Se pagará capital ($${montoCapital}) y un interés final de $${parseFloat(interesLiquidacion).toFixed(2)}.`, accion: () => ejecutarLiquidacion(parseFloat(interesLiquidacion)) })} className="flex-[2] bg-red-600 text-white font-black py-2 rounded-lg text-xs uppercase tracking-wider shadow-md hover:bg-red-700 transition">Confirmar Pago</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <ConfirmModal isOpen={modalConf.isOpen} titulo={modalConf.titulo} mensaje={modalConf.mensaje} onConfirm={modalConf.accion} onCancel={() => setModalConf({ isOpen: false, accion: null })} />
        </>
    );
}