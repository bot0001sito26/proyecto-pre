import { useState, useEffect, useMemo } from 'react';
import supabase from '../supabaseClient';
import ConfirmModal from './ConfirmModal';

export default function LibretaMensualModal({ prestamo, onClose, onFinalizar, onUpdate }) {
    const [movimientos, setMovimientos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [montoAccion, setMontoAccion] = useState('');
    const [notaAccion, setNotaAccion] = useState('');
    const [tipoAccion, setTipoAccion] = useState(null);

    // NUEVO ESTADO PARA LA LIQUIDACIÓN ANTICIPADA
    const [modoLiquidacion, setModoLiquidacion] = useState(false);
    const [interesLiquidacion, setInteresLiquidacion] = useState('');

    const [modalConf, setModalConf] = useState({ isOpen: false, titulo: '', mensaje: '', accion: null });
    const [editandoFecha, setEditandoFecha] = useState(false);
    const [nuevaFecha, setNuevaFecha] = useState('');

    const hoyStr = useMemo(() => {
        const d = new Date();
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split('T')[0];
    }, []);

    const prestamoId = prestamo?.id;
    const fechaInicio = prestamo?.fecha_inicio;
    const montoTotal = prestamo?.monto_total;
    const montoCapital = prestamo?.monto_capital;
    const cobrador = prestamo?.cobrador;
    const clienteNombre = prestamo?.clientes?.nombre;
    const prestamoEstado = prestamo?.estado;

    const [cobradorLocal, setCobradorLocal] = useState(cobrador || 'principal');

    useEffect(() => {
        if (prestamoId) {
            setCobradorLocal(cobrador || 'principal');
            setNuevaFecha(fechaInicio || '');
            setModoLiquidacion(false);
            fetchMovimientos();
        }
    }, [prestamoId]);

    const fetchMovimientos = async () => {
        setCargando(true);
        const { data } = await supabase
            .from('movimientos_mensuales')
            .select('*')
            .eq('prestamo_id', prestamoId)
            .order('fecha', { ascending: false });
        if (data) setMovimientos(data);
        setCargando(false);
    };

    const calculos = useMemo(() => {
        if (!fechaInicio) return { meses: 0, generado: 0, pagado: 0, pendiente: 0, proximoCorte: '' };

        const capitalOriginal = parseFloat(montoTotal);
        const [anioIni, mesIni, diaIni] = fechaInicio.split('-').map(Number);
        const [anioHoy, mesHoy, diaHoy] = hoyStr.split('-').map(Number);

        let generado = 0;
        let mesesTranscurridos = 0;
        let mesCorte = mesIni + 1;
        let anioCorte = anioIni;

        while (anioCorte < anioHoy || (anioCorte === anioHoy && mesCorte < mesHoy) || (anioCorte === anioHoy && mesCorte === mesHoy && diaIni <= diaHoy)) {
            mesesTranscurridos++;

            // 1. Calculamos cuál es el último día de este mes de corte (ej: 28 para feb, 30 para abr)
            const ultimoDia = new Date(anioCorte, mesCorte, 0).getDate();
            const diaCorteEfectivo = Math.min(diaIni, ultimoDia);

            // 2. Armamos la fecha de corte sin peligro de desbordamiento
            const fechaCorteFija = new Date(anioCorte, mesCorte - 1, diaCorteEfectivo);

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

        const pagado = movimientos
            .filter(m => m.tipo === 'pago_interes')
            .reduce((sum, m) => sum + parseFloat(m.monto), 0);

        const pendiente = generado - pagado;

        const proximoMesCorte = mesIni + mesesTranscurridos + 1;
        const proxCorteDate = new Date(anioIni, proximoMesCorte - 1, diaIni);
        const proximoCorteStr = `${proxCorteDate.getFullYear()}-${String(proxCorteDate.getMonth() + 1).padStart(2, '0')}-${String(proxCorteDate.getDate()).padStart(2, '0')}`;

        return {
            meses: mesesTranscurridos,
            generado,
            pagado,
            pendiente,
            proximoCorte: proximoCorteStr
        };
    }, [movimientos, fechaInicio, montoTotal, hoyStr]);

    const interesSugerido = useMemo(() => {
        return (parseFloat(montoCapital || 0) * 0.20).toFixed(2);
    }, [montoCapital]);

    const handleCambiarCobrador = async (nuevoCobrador) => {
        setCobradorLocal(nuevoCobrador);
        const { error } = await supabase.from('prestamos').update({ cobrador: nuevoCobrador }).eq('id', prestamoId);
        if (!error && onUpdate) onUpdate();
        else setCobradorLocal(cobrador || 'principal');
    };

    const confirmarCambioFecha = () => {
        setModalConf({
            isOpen: true,
            titulo: 'Cambiar Fecha de Inicio',
            mensaje: `¿Estás seguro de modificar la fecha de inicio del préstamo al ${nuevaFecha}? Esto recalculará todo el interés pendiente alineando los cortes a este día.`,
            accion: () => ejecutarCambioFecha()
        });
    };

    const ejecutarCambioFecha = async () => {
        setModalConf({ isOpen: false, accion: null });
        const { error } = await supabase.from('prestamos').update({ fecha_inicio: nuevaFecha }).eq('id', prestamoId);
        if (!error) {
            setEditandoFecha(false);
            if (onUpdate) onUpdate();
        } else alert("Error al cambiar la fecha de inicio.");
    };

    const registrarMovimiento = async () => {
        const val = parseFloat(montoAccion);
        if (!val || val <= 0) {
            alert("Ingrese un monto válido.");
            return;
        }

        const titulo = tipoAccion === 'abono_capital' ? 'Abono a Capital' : 'Pago de Interés';
        setModalConf({
            isOpen: true,
            titulo: `Confirmar ${titulo}`,
            mensaje: `¿Deseas registrar un ${titulo} por $${val.toFixed(2)}?`,
            accion: () => ejecutarGuardado(val)
        });
    };

    const ejecutarGuardado = async (monto) => {
        setModalConf({ isOpen: false, accion: null });
        const nuevoMov = { prestamo_id: prestamoId, fecha: hoyStr, tipo: tipoAccion, monto: monto, notas: notaAccion || (tipoAccion === 'abono_capital' ? 'Abono parcial al capital' : 'Pago de interés') };

        const { error } = await supabase.from('movimientos_mensuales').insert([nuevoMov]);

        if (!error) {
            if (tipoAccion === 'abono_capital') {
                const nuevoCapital = Math.max(0, parseFloat(montoCapital) - monto);
                await supabase.from('prestamos').update({ monto_capital: nuevoCapital }).eq('id', prestamoId);
            }
            setMontoAccion('');
            setNotaAccion('');
            setTipoAccion(null);
            fetchMovimientos();
            if (onUpdate) onUpdate();
        } else alert("Error al registrar el movimiento.");
    };

    // --- NUEVAS FUNCIONES PARA LIQUIDACIÓN ---
    const confirmarLiquidacion = () => {
        const intCobrado = parseFloat(interesLiquidacion) || 0;
        setModalConf({
            isOpen: true,
            titulo: 'Confirmar Liquidación',
            mensaje: `Se registrará el pago del capital total ($${montoCapital}) y un interés final de $${intCobrado.toFixed(2)}. El crédito quedará FINALIZADO. ¿Continuar?`,
            accion: () => ejecutarLiquidacion(intCobrado)
        });
    };

    const ejecutarLiquidacion = async (intCobrado) => {
        setModalConf({ isOpen: false, accion: null });
        setCargando(true);

        const capPendiente = parseFloat(montoCapital) || 0;
        const movimientosAInsertar = [];

        if (capPendiente > 0) {
            movimientosAInsertar.push({ prestamo_id: prestamoId, fecha: hoyStr, tipo: 'abono_capital', monto: capPendiente, notas: 'Liquidación total del capital' });
        }
        if (intCobrado > 0) {
            movimientosAInsertar.push({ prestamo_id: prestamoId, fecha: hoyStr, tipo: 'pago_interes', monto: intCobrado, notas: 'Liquidación final de interés acordado' });
        }

        if (movimientosAInsertar.length > 0) {
            await supabase.from('movimientos_mensuales').insert(movimientosAInsertar);
        }

        // Bajamos el capital a cero en la base antes de llamar a onFinalizar que cierra todo
        await supabase.from('prestamos').update({ monto_capital: 0 }).eq('id', prestamoId);

        setModoLiquidacion(false);
        if (onFinalizar) onFinalizar();
    };

    return (
        <>
            <div className="fixed inset-0 bg-neutral-950/70 flex items-end md:items-center justify-center p-0 md:p-4 z-50 backdrop-blur-sm transition-opacity">
                <div className="bg-white w-full max-w-lg rounded-t-2xl md:rounded-2xl h-[90vh] md:h-auto max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">

                    <div className="p-4 bg-neutral-900 text-white flex justify-between items-center border-b border-amber-500/30">
                        <span className="text-xs font-black uppercase tracking-widest text-amber-500 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                            Libreta Mensual Anubis
                        </span>
                        <button onClick={onClose} className="text-neutral-400 hover:text-white transition p-1">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    <div className="p-4 md:p-6 overflow-y-auto flex-1 bg-amber-50/20 select-none space-y-4">
                        <div className="border-2 border-neutral-900 bg-white shadow-sm p-4 font-mono relative">
                            <div className="absolute top-0 left-0 w-full h-1 bg-amber-500"></div>

                            <div className="mb-4 text-sm font-bold leading-relaxed text-neutral-700">
                                <div className="flex border-b border-neutral-200 border-dashed pb-1 mb-1">
                                    <span className="w-24 text-neutral-400">Cliente:</span>
                                    <span className="truncate">{clienteNombre}</span>
                                </div>
                                <div className="flex border-b border-neutral-200 border-dashed pb-1 mb-1 items-center min-h-[28px]">
                                    <span className="w-24 text-neutral-400">Inicio:</span>
                                    {editandoFecha ? (
                                        <div className="flex items-center gap-2 flex-1 animate-fade-in">
                                            <input
                                                type="date"
                                                value={nuevaFecha}
                                                onChange={(e) => setNuevaFecha(e.target.value)}
                                                className="flex-1 text-xs font-black bg-white border border-amber-300 rounded p-1 outline-none focus:border-amber-500"
                                            />
                                            <button onClick={confirmarCambioFecha} className="text-white bg-green-500 hover:bg-green-600 rounded p-1.5 shadow-sm transition">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                            </button>
                                            <button onClick={() => { setEditandoFecha(false); setNuevaFecha(fechaInicio); }} className="text-white bg-red-500 hover:bg-red-600 rounded p-1.5 shadow-sm transition">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-3">
                                            <span>{fechaInicio || 'N/A'}</span>
                                            <button onClick={() => setEditandoFecha(true)} className="text-[9px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-black uppercase tracking-wider hover:bg-amber-200 transition border border-amber-200">
                                                ✏️ Editar
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="flex border-b border-neutral-200 border-dashed pb-1 mb-1">
                                    <span className="w-24 text-neutral-400">Capital Actual:</span>
                                    <span className="text-neutral-900 text-base font-black">${montoCapital}</span>
                                </div>
                                <div className="flex border-b border-neutral-200 border-dashed pb-1 mb-1 text-amber-700 font-black">
                                    <span className="w-24 text-neutral-400">Costo / mes:</span>
                                    <span>${interesSugerido}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mb-3">
                                <div className="bg-gray-100 p-2 rounded-lg border border-gray-200 text-center">
                                    <span className="block text-[9px] font-black uppercase text-gray-500">Transcurrido</span>
                                    <span className="text-xs font-black text-gray-800">
                                        {cargando ? '...' : `${calculos.meses} meses`}
                                    </span>
                                </div>
                                <div className="bg-gray-100 p-2 rounded-lg border border-gray-200 text-center">
                                    <span className="block text-[9px] font-black uppercase text-gray-500">Próximo Corte</span>
                                    <span className="text-xs font-black text-gray-800">
                                        {cargando ? '...' : calculos.proximoCorte}
                                    </span>
                                </div>
                            </div>

                            <div className={`p-3 rounded-xl border mb-4 text-center shadow-inner transition-colors duration-300 ${cargando ? 'bg-gray-50 border-gray-200' : calculos.pendiente > 0 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
                                <p className="text-[10px] font-black uppercase tracking-widest mb-1">
                                    {cargando ? 'Calculando...' : calculos.pendiente > 0 ? ' Interés Atrasado (Pendiente)' : 'Interés Pendiente'}
                                </p>
                                <p className="text-2xl font-black">
                                    ${cargando ? '0.00' : Math.max(0, calculos.pendiente).toFixed(2)}
                                </p>
                                <div className="text-[9px] font-bold mt-2 flex justify-center gap-4 text-neutral-600">
                                    <span>Generado: <b className="text-neutral-900">${cargando ? '...' : calculos.generado.toFixed(2)}</b></span>
                                    <span>Pagado: <b className="text-neutral-900">${cargando ? '...' : calculos.pagado.toFixed(2)}</b></span>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setTipoAccion('abono_capital')}
                                        disabled={cargando || modoLiquidacion}
                                        className={`p-3 rounded-xl font-black text-xs uppercase tracking-wider border transition-all ${tipoAccion === 'abono_capital' ? 'bg-neutral-900 text-amber-500 border-neutral-900' : 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200 disabled:opacity-50'}`}
                                    >
                                        + Abono Capital
                                    </button>
                                    <button
                                        onClick={() => {
                                            setTipoAccion('pago_interes');
                                            if (calculos.pendiente > 0) setMontoAccion(calculos.pendiente.toFixed(2));
                                        }}
                                        disabled={cargando || modoLiquidacion}
                                        className={`p-3 rounded-xl font-black text-xs uppercase tracking-wider border transition-all ${tipoAccion === 'pago_interes' ? 'bg-neutral-900 text-amber-500 border-neutral-900' : 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200 disabled:opacity-50'}`}
                                    >
                                        + Pago Interés
                                    </button>
                                </div>

                                {tipoAccion && (
                                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 space-y-2 animate-fade-in">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-amber-900">
                                                Registrar {tipoAccion === 'abono_capital' ? 'Abono a Capital' : 'Pago de Interés'}
                                            </span>
                                            <button onClick={() => { setTipoAccion(null); setMontoAccion(''); }} className="text-amber-800 font-bold text-xs">✕</button>
                                        </div>
                                        <div className="flex gap-2">
                                            <input
                                                type="number" step="0.01" min="0.01"
                                                placeholder="Monto ($)"
                                                value={montoAccion}
                                                onChange={(e) => setMontoAccion(e.target.value)}
                                                className="w-1/2 bg-white border border-amber-200 rounded-lg p-2 text-xs font-bold text-gray-800 outline-none focus:border-amber-500"
                                                autoFocus
                                            />
                                            <input
                                                type="text"
                                                placeholder="Nota opcional..."
                                                value={notaAccion}
                                                onChange={(e) => setNotaAccion(e.target.value)}
                                                className="w-1/2 bg-white border border-amber-200 rounded-lg p-2 text-xs font-medium text-gray-800 outline-none focus:border-amber-500"
                                            />
                                        </div>
                                        <button
                                            onClick={registrarMovimiento}
                                            className="w-full bg-amber-500 text-neutral-950 font-black py-2 rounded-lg text-xs uppercase tracking-wider hover:bg-amber-600 transition"
                                        >
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
                                                            <span className={`font-black uppercase text-[9px] px-2 py-0.5 rounded ${m.tipo === 'abono_capital' ? 'bg-amber-100 text-amber-800' : m.tipo === 'pago_interes' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>
                                                                {m.tipo === 'abono_capital' ? 'Abono Cap.' : m.tipo === 'pago_interes' ? 'Pago Int.' : 'Corte'}
                                                            </span>
                                                            <span className="text-[10px] font-bold text-gray-400">{m.fecha}</span>
                                                        </div>
                                                        {m.notas && <p className="text-[11px] text-gray-600 mt-1 font-medium">"{m.notas}"</p>}
                                                    </div>
                                                    <span className="font-black text-sm text-neutral-800">${parseFloat(m.monto).toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

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

                    <div className="p-4 border-t border-neutral-200 bg-neutral-50 flex flex-col gap-2">
                        {prestamoEstado === 'activo' && !modoLiquidacion && (
                            <button
                                onClick={() => {
                                    setTipoAccion(null);
                                    setInteresLiquidacion(Math.max(0, calculos.pendiente).toFixed(2));
                                    setModoLiquidacion(true);
                                }}
                                className="w-full bg-amber-500 text-neutral-950 font-black uppercase tracking-wider py-3 rounded-lg hover:bg-amber-600 shadow-md text-xs flex items-center justify-center gap-2 transition"
                            >
                                Finalizar / Liquidar Crédito
                            </button>
                        )}

                        {modoLiquidacion && (
                            <div className="w-full bg-red-50 border border-red-200 rounded-xl p-3 flex flex-col gap-3 animate-fade-in shadow-inner">
                                <div className="text-center">
                                    <span className="text-[10px] font-black uppercase text-red-600 tracking-widest">Liquidación Anticipada</span>
                                </div>

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
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={interesLiquidacion}
                                            onChange={(e) => setInteresLiquidacion(e.target.value)}
                                            className="w-full bg-white border border-red-300 rounded-lg pl-7 pr-3 py-2 font-black text-red-900 outline-none focus:border-red-500 transition"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-2 mt-1">
                                    <button
                                        onClick={() => setModoLiquidacion(false)}
                                        className="flex-1 bg-white border border-red-200 text-red-600 font-black py-2 rounded-lg text-xs uppercase tracking-wider hover:bg-red-50 transition"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={confirmarLiquidacion}
                                        className="flex-[2] bg-red-600 text-white font-black py-2 rounded-lg text-xs uppercase tracking-wider shadow-md hover:bg-red-700 transition"
                                    >
                                        Confirmar Pago
                                    </button>
                                </div>
                            </div>
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