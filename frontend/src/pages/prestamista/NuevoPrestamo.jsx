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
            setInteres('');
        }
    }, [tipoPrestamo]);

    const handleCrearPrestamo = async (e) => {
        e.preventDefault();

        const capital = parseFloat(montoCapital);
        const interesTotal = tipoPrestamo === 'cuota_fija' ? parseFloat(interes) : 0;

        if (!clienteId || capital <= 0 || !fechaInicio) {
            alert("Por favor, ingrese valores válidos mayores a cero.");
            return;
        }

        if (tipoPrestamo === 'cuota_fija' && interesTotal < 0) {
            alert("Por favor, ingrese un interés válido.");
            return;
        }

        setGuardando(true);
        const montoTotal = capital + interesTotal;

        let numeroCuotas = 30;
        let valorCuota = 0;

        if (tipoPrestamo === 'cuota_fija') {
            if (frecuencia === 'semanal') numeroCuotas = 4;
            if (frecuencia === 'quincenal') numeroCuotas = 2;
            if (frecuencia === 'mensual') numeroCuotas = 1;
            valorCuota = (montoTotal / numeroCuotas).toFixed(2);
        } else {
            valorCuota = (capital * 0.20).toFixed(2);
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
                frecuencia,
                valor_cuota: valorCuota,
                fecha_inicio: fechaInicio,
                cobrador,
                tipo_prestamo: tipoPrestamo
            }]).select().single();

        if (!errorPrestamo && prestamo) {

            const pagosGenerados = [];

            // Trabajamos las fechas asumiendo la zona horaria local al dividir la cadena
            const [anio, mes, dia] = fechaInicio.split('-').map(Number);

            if (tipoPrestamo === 'cuota_fija') {
                let fechaCobro = new Date(anio, mes - 1, dia, 12, 0, 0);
                for (let i = 1; i <= numeroCuotas; i++) {
                    if (frecuencia === 'diario') fechaCobro.setDate(fechaCobro.getDate() + 1);
                    else if (frecuencia === 'semanal') fechaCobro.setDate(fechaCobro.getDate() + 7);
                    else if (frecuencia === 'quincenal') fechaCobro.setDate(fechaCobro.getDate() + 15);
                    else if (frecuencia === 'mensual') fechaCobro.setDate(fechaCobro.getDate() + 30);

                    pagosGenerados.push({
                        prestamo_id: prestamo.id,
                        fecha_cobro: fechaCobro.toISOString().split('T')[0],
                        estado_cobro: 'pendiente',
                        monto_recibido: 0
                    });
                }
            } else {
                // MODELO MENSUAL INTERÉS: AVANZAMOS EXACTAMENTE UN MES CALENDARIO
                let fechaCobroCorte = new Date(anio, mes - 1, dia, 12, 0, 0);
                fechaCobroCorte.setMonth(fechaCobroCorte.getMonth() + 1);
                const fechaCobroStr = fechaCobroCorte.toISOString().split('T')[0];

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
                    notas: `Inicio del préstamo. Vencimiento del primer mes: ${fechaCobroStr}`
                }]);
            }

            if (pagosGenerados.length > 0) {
                await supabase.from('historial_pagos').insert(pagosGenerados);
            }

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

    // Función auxiliar para calcular la fecha del próximo mes visualmente en el resumen
    const calcularSiguienteMesVisual = (fechaIni) => {
        if (!fechaIni) return '';
        const [a, m, d] = fechaIni.split('-').map(Number);
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
                                    <span className="text-[8px] font-medium normal-case tracking-normal">Diario / Semanal / Mensual</span>
                                </label>
                                <label className={`border p-3 rounded-xl text-center text-xs font-black uppercase tracking-wider cursor-pointer transition flex flex-col items-center justify-center gap-1 ${tipoPrestamo === 'mensual_interes' ? 'bg-amber-100 border-amber-400 text-amber-800 shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                                    <input type="radio" name="tipoPrestamo" value="mensual_interes" checked={tipoPrestamo === 'mensual_interes'} onChange={() => setTipoPrestamo('mensual_interes')} className="hidden" />
                                    Interés Abierto
                                    <span className="text-[8px] font-medium normal-case tracking-normal">Abonos a capital / Plazo Fijo</span>
                                </label>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Fecha de Inicio</label>
                            <input
                                type="date"
                                value={fechaInicio}
                                onChange={(e) => setFechaInicio(e.target.value)}
                                required
                                className="w-full border border-gray-200 rounded-xl p-3 bg-gray-50 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 font-bold text-gray-800 transition"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Cliente</label>
                            <select
                                value={clienteId}
                                onChange={(e) => setClienteId(e.target.value)}
                                required
                                className="w-full border border-gray-200 rounded-xl p-3 bg-gray-50 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 font-bold text-gray-800 transition"
                            >
                                <option value="">Seleccione un cliente...</option>
                                {clientes.map(c => (
                                    <option key={c.id} value={c.id}>{c.nombre}</option>
                                ))}
                            </select>
                        </div>

                        <div className={`grid ${tipoPrestamo === 'cuota_fija' ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Capital ($)</label>
                                <input
                                    type="number" step="0.01" min="0.01" value={montoCapital}
                                    onChange={(e) => setMontoCapital(e.target.value)}
                                    className="w-full border border-gray-200 rounded-xl p-3 bg-gray-50 outline-none focus:border-amber-500 font-bold text-gray-800 transition text-center"
                                    required placeholder="Ej. 100"
                                />
                            </div>

                            {tipoPrestamo === 'cuota_fija' && (
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Interés Total ($)</label>
                                    <input
                                        type="number" step="0.01" min="0" value={interes}
                                        onChange={(e) => setInteres(e.target.value)}
                                        className="w-full border border-gray-200 rounded-xl p-3 bg-gray-50 outline-none focus:border-amber-500 font-bold text-gray-800 transition text-center"
                                        required placeholder="Ej. 20"
                                    />
                                </div>
                            )}
                        </div>

                        {tipoPrestamo === 'cuota_fija' && (
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Modalidad de Cobro</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {['diario', 'semanal', 'quincenal', 'mensual'].map(f => (
                                        <label key={f} className={`border p-3 rounded-xl text-center text-xs font-black uppercase tracking-wider cursor-pointer transition ${frecuencia === f ? 'bg-amber-50 border-amber-400 text-amber-700 shadow-sm' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
                                            <input type="radio" name="frecuencia" value={f} checked={frecuencia === f} onChange={() => setFrecuencia(f)} className="hidden" />
                                            {f}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">¿Quién cobra este crédito?</label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { id: 'principal', label: 'Yo' },
                                    { id: 'ayudante', label: 'Ayudante' }
                                ].map(c => (
                                    <label key={c.id} className={`border p-3 rounded-xl text-center text-xs font-black uppercase tracking-wider cursor-pointer transition ${cobrador === c.id ? 'bg-neutral-900 border-neutral-900 text-amber-500 shadow-sm' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
                                        <input type="radio" name="cobrador" value={c.id} checked={cobrador === c.id} onChange={() => setCobrador(c.id)} className="hidden" />
                                        {c.label}
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* RESUMEN DEL PRÉSTAMO */}
                        {montoCapital && (
                            <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200 text-center">
                                {tipoPrestamo === 'cuota_fija' && interes ? (
                                    <>
                                        <p className="text-[10px] text-amber-600 font-black uppercase tracking-widest mb-1">
                                            Total a cobrar: ${(parseFloat(montoCapital) + parseFloat(interes)).toFixed(2)}
                                        </p>
                                        <p className="text-2xl text-amber-600 font-black">
                                            Cuota {frecuencia}: ${((parseFloat(montoCapital) + parseFloat(interes)) / (frecuencia === 'diario' ? 30 : frecuencia === 'semanal' ? 4 : frecuencia === 'quincenal' ? 2 : 1)).toFixed(2)}
                                        </p>
                                    </>
                                ) : tipoPrestamo === 'mensual_interes' ? (
                                    <>
                                        <p className="text-[10px] text-amber-600 font-black uppercase tracking-widest mb-1">
                                            Capital en Préstamo
                                        </p>
                                        <p className="text-2xl text-amber-600 font-black">
                                            ${parseFloat(montoCapital).toFixed(2)}
                                        </p>
                                        <p className="text-xs text-amber-700 font-bold mt-2 bg-amber-100 inline-block px-3 py-1 rounded-full">
                                            Próximo corte: {calcularSiguienteMesVisual(fechaInicio)}
                                        </p>
                                    </>
                                ) : null}
                            </div>
                        )}

                        <button
                            type="submit" disabled={guardando}
                            className="w-full bg-amber-500 text-white p-4 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-amber-600 transition shadow-sm flex justify-center items-center gap-2 mt-2"
                        >
                            {guardando ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                    Confirmar Préstamo
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}