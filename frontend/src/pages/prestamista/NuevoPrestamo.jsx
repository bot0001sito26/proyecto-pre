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

    const hoyEstandar = new Date().toISOString().split('T')[0];
    const [fechaInicio, setFechaInicio] = useState(hoyEstandar);
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        if (user?.id) {
            supabase.from('clientes').select('id, nombre').eq('prestamista_id', user.id).order('nombre')
                .then(({ data }) => { if (data) setClientes(data); });
        }
    }, [user]);

    useEffect(() => {
        if (tipoPrestamo === 'mensual_interes') {
            setFrecuencia('mensual');
            setInteres('0');
        } else {
            setFrecuencia('diario');
            setNumeroCuotas(30);
            setInteres('');
        }
    }, [tipoPrestamo]);

    const handleFrecuenciaChange = (f) => {
        setFrecuencia(f);
        if (f === 'diario') setNumeroCuotas(30);
        else if (f === 'semanal') setNumeroCuotas(4);
        else if (f === 'quincenal') setNumeroCuotas(2);
    };

    const sumarDias = (fechaBaseStr, dias) => {
        const [a, m, d] = fechaBaseStr.split('-').map(Number);
        const fecha = new Date(a, m - 1, d, 12, 0, 0);
        fecha.setDate(fecha.getDate() + dias);
        return fecha.toISOString().split('T')[0];
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
        let frecAGuardar = frecuencia; // Lo que irá a la BD

        if (tipoPrestamo === 'cuota_fija') {
            cuotasFinales = parseInt(numeroCuotas);
            valorCuota = (montoTotal / cuotasFinales).toFixed(2);
        } else {
            valorCuota = (capital * 0.20).toFixed(2);
            // Si eligió modalidad por días en interés abierto, lo guardamos como "dias_40"
            if (frecuencia === 'dias') {
                const diasInt = parseInt(diasPersonalizados) || 30;
                frecAGuardar = `dias_${diasInt}`;
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
                tipo_prestamo: tipoPrestamo // Seguirá siendo 'mensual_interes' en la BD
            }]).select().single();

        if (!errorPrestamo && prestamo) {
            const pagosGenerados = [];

            if (tipoPrestamo === 'cuota_fija') {
                let diasASumar = 1;
                if (frecuencia === 'semanal') diasASumar = 7;
                else if (frecuencia === 'quincenal') diasASumar = 15;

                let fechaIterativa = fechaInicio;
                for (let i = 1; i <= cuotasFinales; i++) {
                    fechaIterativa = sumarDias(fechaIterativa, diasASumar);
                    pagosGenerados.push({
                        prestamo_id: prestamo.id,
                        fecha_cobro: fechaIterativa,
                        estado_cobro: 'pendiente',
                        monto_recibido: 0
                    });
                }
            } else {
                // MODELO INTERÉS ABIERTO (Mensual o por Días)
                let fechaCobroStr = '';

                if (frecuencia === 'dias') {
                    const diasInt = parseInt(diasPersonalizados) || 30;
                    fechaCobroStr = sumarDias(fechaInicio, diasInt);
                } else {
                    const [a, m, d] = fechaInicio.split('-').map(Number);
                    let fechaCobroCorte = new Date(a, m - 1, d, 12, 0, 0);
                    fechaCobroCorte.setMonth(fechaCobroCorte.getMonth() + 1);
                    fechaCobroStr = fechaCobroCorte.toISOString().split('T')[0];
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
                    tipo: 'corte_mes', // Lo mantenemos así para retrocompatibilidad
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
            alert("Error al crear préstamo");
        }
        setGuardando(false);
    };

    const calcularSiguienteCorte = () => {
        if (!fechaInicio) return '';
        if (tipoPrestamo === 'mensual_interes' && frecuencia === 'dias') {
            const d = parseInt(diasPersonalizados) || 0;
            if (d === 0) return '...';
            return sumarDias(fechaInicio, d);
        }
        // Mensual clásico
        const [a, m, d] = fechaInicio.split('-').map(Number);
        const prox = new Date(a, m - 1, d, 12, 0, 0);
        prox.setMonth(prox.getMonth() + 1);
        return prox.toISOString().split('T')[0];
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
                                    <span className="text-[8px] font-medium normal-case tracking-normal">Diario / Semanal / Quinc.</span>
                                </label>
                                <label className={`border p-3 rounded-xl text-center text-xs font-black uppercase tracking-wider cursor-pointer transition flex flex-col items-center justify-center gap-1 ${tipoPrestamo === 'mensual_interes' ? 'bg-amber-100 border-amber-400 text-amber-800 shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                                    <input type="radio" name="tipoPrestamo" value="mensual_interes" checked={tipoPrestamo === 'mensual_interes'} onChange={() => setTipoPrestamo('mensual_interes')} className="hidden" />
                                    Interés Abierto
                                    <span className="text-[8px] font-medium normal-case tracking-normal">Mes a mes / Personalizado</span>
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

                        {/* CONFIGURACIÓN DE FRECUENCIA */}
                        <div className="bg-gray-50/50 border border-gray-100 p-3 rounded-xl space-y-3">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Frecuencia de Cobro</label>

                            {tipoPrestamo === 'cuota_fija' ? (
                                <>
                                    <div className="grid grid-cols-3 gap-2">
                                        {['diario', 'semanal', 'quincenal'].map(f => (
                                            <label key={f} className={`border p-2.5 rounded-xl text-center text-[11px] font-black uppercase tracking-wider cursor-pointer transition ${frecuencia === f ? 'bg-amber-50 border-amber-400 text-amber-700 shadow-sm' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
                                                <input type="radio" name="frecuencia" value={f} checked={frecuencia === f} onChange={() => handleFrecuenciaChange(f)} className="hidden" />
                                                {f}
                                            </label>
                                        ))}
                                    </div>
                                    <div className="pt-2 border-t border-gray-200">
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">Nº de Cuotas (Cantidad de Pagos)</label>
                                        <input type="number" min="1" value={numeroCuotas} onChange={(e) => setNumeroCuotas(e.target.value)} className="w-full border border-amber-200 rounded-xl p-2.5 bg-white outline-none focus:border-amber-500 font-black text-amber-900 transition text-center shadow-inner" required />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 gap-2">
                                        <label className={`border p-2.5 rounded-xl text-center text-[11px] font-black uppercase tracking-wider cursor-pointer transition ${frecuencia === 'mensual' ? 'bg-amber-50 border-amber-400 text-amber-700 shadow-sm' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
                                            <input type="radio" name="frecuencia" value="mensual" checked={frecuencia === 'mensual'} onChange={() => handleFrecuenciaChange('mensual')} className="hidden" />
                                            Mensual (Mes a mes)
                                        </label>
                                        <label className={`border p-2.5 rounded-xl text-center text-[11px] font-black uppercase tracking-wider cursor-pointer transition ${frecuencia === 'dias' ? 'bg-amber-50 border-amber-400 text-amber-700 shadow-sm' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
                                            <input type="radio" name="frecuencia" value="dias" checked={frecuencia === 'dias'} onChange={() => handleFrecuenciaChange('dias')} className="hidden" />
                                            Especial (Por Días)
                                        </label>
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