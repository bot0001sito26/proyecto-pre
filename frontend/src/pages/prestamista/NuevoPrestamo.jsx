import { useState, useEffect } from 'react';
import supabase from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, Link, useLocation } from 'react-router-dom';

export default function NuevoPrestamo() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const clientePreseleccionado = location.state?.preselectClienteId || '';
    const prestamoARenovar = location.state?.prestamoARenovar || null;

    const [clientes, setClientes] = useState([]);
    const [clienteId, setClienteId] = useState(clientePreseleccionado);

    const [tipoPrestamo, setTipoPrestamo] = useState('cuota_fija');
    const [montoCapital, setMontoCapital] = useState('');
    const [interes, setInteres] = useState('');

    const [frecuencia, setFrecuencia] = useState('diario');
    const [numeroCuotas, setNumeroCuotas] = useState(30);
    const [diasPersonalizados, setDiasPersonalizados] = useState('');
    const [cobrador, setCobrador] = useState('principal');
    const [esCapitalAjeno, setEsCapitalAjeno] = useState(false); // NUEVO: Estado para dinero de terceros

    const hoyEstandar = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
    const [fechaInicio, setFechaInicio] = useState(hoyEstandar);
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        if (user?.id) {
            supabase.from('clientes').select('id, nombre').eq('prestamista_id', user.id).order('nombre')
                .then(({ data }) => { if (data) setClientes(data); });
        }
    }, [user]);

    // Lógica estricta de modalidades
    useEffect(() => {
        if (tipoPrestamo === 'mensual_interes') {
            setFrecuencia('semanal'); // Por defecto al cambiar a abierto
            setInteres('0');
        } else {
            setFrecuencia('diario'); // Única opción para cuota fija
            setNumeroCuotas(30);
            setInteres('');
        }
    }, [tipoPrestamo]);

    // ----------------------------------------------------
    // FUNCIONES ESTRICTAS EN UTC PARA EVITAR SALTOS DE DÍAS 
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

    const handleCrearPrestamo = async (e) => {
        e.preventDefault();

        const capital = parseFloat(montoCapital);
        const interesTotal = tipoPrestamo === 'cuota_fija' ? parseFloat(interes) : 0;

        if (!clienteId || capital <= 0 || !fechaInicio) {
            alert("Por favor, ingrese valores válidos mayores a cero.");
            return;
        }

        setGuardando(true);
        const montoTotal = capital + interesTotal;
        let valorCuota = 0;
        let cuotasFinales = 1;
        let frecAGuardar = frecuencia;

        if (tipoPrestamo === 'cuota_fija') {
            cuotasFinales = parseInt(numeroCuotas);
            valorCuota = (montoTotal / cuotasFinales).toFixed(2);
        } else {
            valorCuota = (capital * 0.20).toFixed(2);
            if (frecuencia === 'dias') {
                const diasInt = parseInt(diasPersonalizados) || 30;
                frecAGuardar = `dias_${diasInt}`;
            } else if (frecuencia === 'semanal') {
                frecAGuardar = 'dias_7';
            } else if (frecuencia === 'quincenal') {
                frecAGuardar = 'dias_15';
            } else {
                frecAGuardar = 'mensual';
            }
        }

        const { data: prestamo, error: errorPrestamo } = await supabase
            .from('prestamos')
            .insert([{
                prestamista_id: user.id,
                cliente_id: clienteId,
                monto_capital: capital,
                interes_total: interesTotal,
                monto_total: montoTotal,
                saldo_pendiente: montoTotal,
                frecuencia: frecAGuardar,
                valor_cuota: valorCuota,
                fecha_inicio: fechaInicio,
                cobrador,
                tipo_prestamo: tipoPrestamo,
                es_capital_ajeno: esCapitalAjeno // NUEVO: Se guarda en Supabase
            }]).select().single();

        if (!errorPrestamo && prestamo) {
            const pagosGenerados = [];

            if (tipoPrestamo === 'cuota_fija') {
                let fechaIterativa = fechaInicio;
                for (let i = 1; i <= cuotasFinales; i++) {
                    fechaIterativa = sumarDias(fechaIterativa, 1); // Siempre 1 día para diario
                    pagosGenerados.push({
                        prestamo_id: prestamo.id,
                        fecha_cobro: fechaIterativa,
                        estado_cobro: 'pendiente',
                        monto_recibido: 0
                    });
                }
            } else {
                let fechaCobroStr = '';

                if (frecuencia === 'dias') {
                    const diasInt = parseInt(diasPersonalizados) || 30;
                    fechaCobroStr = sumarDias(fechaInicio, diasInt);
                } else if (frecuencia === 'semanal') {
                    fechaCobroStr = sumarDias(fechaInicio, 7);
                } else if (frecuencia === 'quincenal') {
                    fechaCobroStr = sumarDias(fechaInicio, 15);
                } else {
                    fechaCobroStr = sumarMesesPreservandoDia(fechaInicio, 1);
                }

                pagosGenerados.push({
                    prestamo_id: prestamo.id,
                    fecha_cobro: fechaCobroStr,
                    estado_cobro: 'pendiente',
                    monto_recibido: 0
                });

                await supabase.from('movimientos_mensuales').insert([{
                    prestamo_id: prestamo.id,
                    fecha: fechaInicio,
                    tipo: 'corte_mes',
                    monto: capital,
                    notas: `Inicio del préstamo. Vencimiento del primer corte: ${fechaCobroStr}`
                }]);
            }

            if (pagosGenerados.length > 0) await supabase.from('historial_pagos').insert(pagosGenerados);

            if (prestamoARenovar) {
                await supabase.from('prestamos').update({ saldo_pendiente: 0, estado: 'renovado', fecha_cierre: fechaInicio }).eq('id', prestamoARenovar);
                const { data: prestamoViejo } = await supabase.from('prestamos').select('valor_cuota').eq('id', prestamoARenovar).single();
                if (prestamoViejo) {
                    await supabase.from('historial_pagos')
                        .update({ estado_cobro: 'renovado', monto_recibido: prestamoViejo.valor_cuota, fecha_cobro: fechaInicio })
                        .eq('prestamo_id', prestamoARenovar).in('estado_cobro', ['pendiente', 'no_pago']);
                }
            }
            navigate('/dashboard');
        } else {
            alert("Error al crear préstamo: " + (errorPrestamo ? errorPrestamo.message : "Error desconocido"));
        }
        setGuardando(false);
    };

    const calcularSiguienteCorte = () => {
        if (!fechaInicio) return '';
        if (tipoPrestamo === 'mensual_interes') {
            if (frecuencia === 'dias') {
                const d = parseInt(diasPersonalizados) || 0;
                if (d === 0) return '...';
                return sumarDias(fechaInicio, d);
            } else if (frecuencia === 'semanal') {
                return sumarDias(fechaInicio, 7);
            } else if (frecuencia === 'quincenal') {
                return sumarDias(fechaInicio, 15);
            }
            // Mensual clásico con UTC
            return sumarMesesPreservandoDia(fechaInicio, 1);
        }
        return '';
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4 pb-20 overflow-x-hidden w-full font-sans">
            <div className="max-w-md mx-auto space-y-6">
                <div className="flex items-center justify-between mb-2">
                    <Link to="/dashboard" className="text-neutral-400 hover:text-amber-600 transition flex items-center gap-1 font-bold text-xs uppercase tracking-widest">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Volver
                    </Link>
                    <h1 className="text-xl font-black text-neutral-900 tracking-widest uppercase">Nuevo Préstamo</h1>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-amber-500"></div>

                    <form onSubmit={handleCrearPrestamo} className="space-y-5">
                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-800 mb-2">Modelo de Préstamo</label>
                            <div className="grid grid-cols-2 gap-2">
                                <label className={`border p-3 rounded-xl text-center text-xs font-black uppercase tracking-wider cursor-pointer transition flex flex-col items-center justify-center gap-1 ${tipoPrestamo === 'cuota_fija' ? 'bg-amber-100 border-amber-400 text-amber-800 shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                                    <input type="radio" name="tipoPrestamo" value="cuota_fija" checked={tipoPrestamo === 'cuota_fija'} onChange={() => setTipoPrestamo('cuota_fija')} className="hidden" />
                                    Cuota Fija
                                    <span className="text-[8px] font-medium normal-case tracking-normal">Sólo Diario (Rigido)</span>
                                </label>
                                <label className={`border p-3 rounded-xl text-center text-xs font-black uppercase tracking-wider cursor-pointer transition flex flex-col items-center justify-center gap-1 ${tipoPrestamo === 'mensual_interes' ? 'bg-amber-100 border-amber-400 text-amber-800 shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                                    <input type="radio" name="tipoPrestamo" value="mensual_interes" checked={tipoPrestamo === 'mensual_interes'} onChange={() => setTipoPrestamo('mensual_interes')} className="hidden" />
                                    Interés Abierto
                                    <span className="text-[8px] font-medium normal-case tracking-normal">Capital flexible</span>
                                </label>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Fecha de Inicio</label>
                            <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} required className="w-full border border-gray-200 rounded-xl p-3 bg-gray-50 outline-none focus:border-amber-500 font-bold text-gray-800 transition" />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Cliente</label>
                            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} required className="w-full border border-gray-200 rounded-xl p-3 bg-gray-50 outline-none focus:border-amber-500 font-bold text-gray-800 transition">
                                <option value="">Seleccione un cliente...</option>
                                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                        </div>

                        <div className={`grid ${tipoPrestamo === 'cuota_fija' ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Capital ($)</label>
                                <input type="number" step="0.01" min="0.01" value={montoCapital} onChange={(e) => setMontoCapital(e.target.value)} className="w-full border border-gray-200 rounded-xl p-3 bg-gray-50 outline-none focus:border-amber-500 font-bold text-gray-800 transition text-center" required placeholder="Ej. 100" />
                            </div>
                            {tipoPrestamo === 'cuota_fija' && (
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Interés Total ($)</label>
                                    <input type="number" step="0.01" min="0" value={interes} onChange={(e) => setInteres(e.target.value)} className="w-full border border-gray-200 rounded-xl p-3 bg-gray-50 outline-none focus:border-amber-500 font-bold text-gray-800 transition text-center" required placeholder="Ej. 20" />
                                </div>
                            )}
                        </div>

                        {/* NUEVO: Interruptor de Capital Ajeno */}
                        <div className="bg-purple-50/50 border border-purple-100 p-4 rounded-xl flex items-center justify-between gap-4">
                            <div>
                                <h3 className="text-[11px] font-black text-purple-900 uppercase tracking-widest">Terceros</h3>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={esCapitalAjeno}
                                    onChange={(e) => setEsCapitalAjeno(e.target.checked)}
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                            </label>
                        </div>

                        <div className="bg-gray-50/50 border border-gray-100 p-3 rounded-xl space-y-3">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Frecuencia de Cobro</label>

                            {tipoPrestamo === 'cuota_fija' ? (
                                <>
                                    <div className="grid grid-cols-1 gap-2">
                                        <label className="border p-2.5 rounded-xl text-center text-[11px] font-black uppercase tracking-wider bg-amber-50 border-amber-400 text-amber-700 shadow-sm cursor-not-allowed">
                                            DIARIO (Única opción)
                                        </label>
                                    </div>
                                    <div className="pt-2 border-t border-gray-200">
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">Nº de Cuotas (Cantidad de Pagos)</label>
                                        <input
                                            type="number"
                                            value={numeroCuotas}
                                            readOnly
                                            className="w-full border border-gray-200 rounded-xl p-2.5 bg-gray-100 font-black text-gray-500 text-center shadow-inner cursor-not-allowed outline-none select-none"
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                        {['semanal', 'quincenal', 'mensual', 'dias'].map(f => (
                                            <label key={f} className={`border p-2.5 rounded-xl text-center text-[11px] font-black uppercase tracking-wider cursor-pointer transition ${frecuencia === f ? 'bg-amber-50 border-amber-400 text-amber-700 shadow-sm' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
                                                <input type="radio" name="frecuencia" value={f} checked={frecuencia === f} onChange={() => setFrecuencia(f)} className="hidden" />
                                                {f === 'mensual' ? 'Mes a mes' : f === 'dias' ? 'Especial' : f}
                                            </label>
                                        ))}
                                    </div>
                                    {frecuencia === 'dias' && (
                                        <div className="pt-2 border-t border-gray-200 animate-fade-in">
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">El interés se generará cada (Días)</label>
                                            <input type="number" min="1" value={diasPersonalizados} onChange={(e) => setDiasPersonalizados(e.target.value)} className="w-full border border-amber-200 rounded-xl p-2.5 bg-white outline-none focus:border-amber-500 font-black text-amber-900 transition text-center shadow-inner" required placeholder="Ej. 40" autoFocus />
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">¿Quién cobra este crédito?</label>
                            <div className="grid grid-cols-2 gap-2">
                                {[{ id: 'principal', label: 'Yo' }, { id: 'ayudante', label: 'Ayudante' }].map(c => (
                                    <label key={c.id} className={`border p-3 rounded-xl text-center text-xs font-black uppercase tracking-wider cursor-pointer transition ${cobrador === c.id ? 'bg-neutral-900 border-neutral-900 text-amber-500 shadow-sm' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
                                        <input type="radio" name="cobrador" value={c.id} checked={cobrador === c.id} onChange={() => setCobrador(c.id)} className="hidden" />
                                        {c.label}
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* RESUMEN */}
                        {montoCapital && (
                            <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200 text-center">
                                {tipoPrestamo === 'cuota_fija' && interes !== '' ? (
                                    <>
                                        <p className="text-[10px] text-amber-600 font-black uppercase tracking-widest mb-1">Total a cobrar: ${(parseFloat(montoCapital) + parseFloat(interes || 0)).toFixed(2)}</p>
                                        <p className="text-xl md:text-2xl text-amber-600 font-black">{numeroCuotas || 0} Pagos de: ${((parseFloat(montoCapital) + parseFloat(interes || 0)) / (parseInt(numeroCuotas) || 1)).toFixed(2)}</p>
                                    </>
                                ) : tipoPrestamo === 'mensual_interes' ? (
                                    <>
                                        <p className="text-[10px] text-amber-600 font-black uppercase tracking-widest mb-1">Capital en Préstamo</p>
                                        <p className="text-2xl text-amber-600 font-black">${parseFloat(montoCapital).toFixed(2)}</p>
                                        <p className="text-xs text-amber-700 font-bold mt-2 bg-amber-100 inline-block px-3 py-1 rounded-full">Próximo corte: {calcularSiguienteCorte()}</p>
                                    </>
                                ) : null}
                            </div>
                        )}

                        <button type="submit" disabled={guardando} className="w-full bg-amber-500 text-white p-4 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-amber-600 transition shadow-sm flex justify-center items-center gap-2 mt-2">
                            {guardando ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <>Confirmar Préstamo</>}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}