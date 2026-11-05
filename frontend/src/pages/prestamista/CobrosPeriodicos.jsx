import { useState, useEffect, useMemo } from 'react';
import supabase from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import CartulinaModal from '../../components/CartulinaModal';
import LibretaInteresAbiertoModal from '../../components/LibretaInteresAbiertoModal';

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

// ----------------------------------------------------
// SUB-COMPONENTE: ACORDEÓN PARA GRUPOS DE PRÉSTAMOS
// ----------------------------------------------------
function PrestamoGrupoAcordeon({ grupo, abrirModal }) {
    const [expandido, setExpandido] = useState(false);
    const mult = grupo.prestamosAgrupados.length > 1;
    const pPrincipal = grupo.prestamosAgrupados[0];

    return (
        <div className={`bg-white rounded-2xl shadow-sm border-l-4 overflow-hidden transition-all hover:shadow-md ${grupo.atrasado ? 'border-l-red-500 bg-red-50/20' : 'border-l-amber-400'}`}>
            <div onClick={() => mult ? setExpandido(!expandido) : undefined} className={`p-4 flex justify-between items-center ${mult ? 'cursor-pointer hover:bg-gray-50' : ''}`}>
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="font-bold text-gray-800 text-lg">{grupo.clientes.nombre}</h2>
                        {mult && (
                            <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider border border-amber-200">
                                {grupo.prestamosAgrupados.length} Créditos
                            </span>
                        )}
                    </div>
                    <p className="text-xs font-bold text-gray-400 mb-1 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                        {grupo.clientes.telefono || 'Sin número'}
                    </p>

                    <div className={`text-[11px] font-black mb-2 flex flex-col ${grupo.atrasado ? 'text-red-600' : 'text-neutral-600'}`}>
                        {grupo.atrasado ? (
                            <>
                                <span className="flex items-center gap-1">{grupo.mensajeAtraso}</span>
                                <span className="text-[9px] text-red-400 mt-0.5">Vencimiento más próximo: {grupo.fechaVencimiento}</span>
                            </>
                        ) : (
                            `🗓️ Próximo Pago: ${grupo.fechaVencimiento}`
                        )}
                    </div>

                    {!mult && (
                        <div className="flex items-center gap-2 flex-wrap">
                            {pPrincipal.tipo_prestamo === 'mensual_interes' && (
                                <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded border ${pPrincipal.frecuencia.startsWith('dias_') ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-purple-100 text-purple-800 border-purple-200'}`}>
                                    {pPrincipal.frecuencia.startsWith('dias_') ? `Interés (${pPrincipal.frecuencia.split('_')[1]} Días)` : 'Interés Abierto'}
                                </span>
                            )}
                            {pPrincipal.cobrador === 'ayudante' && (
                                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded bg-neutral-100 text-neutral-500 border border-neutral-200">Ayudante</span>
                            )}
                        </div>
                    )}
                </div>

                <div className="text-right flex flex-col items-end justify-center gap-1">
                    <p className="font-black text-gray-800 text-xl">${grupo.montoTotalSuma.toFixed(2)}</p>
                    {!mult ? (
                        <button onClick={(e) => { e.stopPropagation(); abrirModal(pPrincipal); }} className="mt-2 bg-amber-50 text-amber-700 hover:bg-amber-100 font-black tracking-widest uppercase text-[9px] px-4 py-2 rounded-lg transition-colors border border-amber-200 shadow-sm">
                            {pPrincipal.tipo_prestamo === 'mensual_interes' ? 'Abrir Libreta' : 'Abrir Cartulina'}
                        </button>
                    ) : (
                        <svg className={`w-6 h-6 text-gray-400 mt-2 transition-transform ${expandido ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                    )}
                </div>
            </div>

            {/* Contenido Expandible para múltiples préstamos */}
            {mult && expandido && (
                <div className="p-3 bg-gray-50/80 border-t border-gray-100 divide-y divide-gray-200">
                    {grupo.prestamosAgrupados.map((subP) => (
                        <div key={subP.id} className="py-3 flex justify-between items-center first:pt-1 last:pb-1">
                            <div>
                                <p className="font-black text-gray-800 text-sm">Capital: ${subP.monto_capital}</p>
                                <p className="text-[11px] font-bold text-amber-600 mb-1">
                                    Cuota/Int: ${subP.tipo_prestamo === 'mensual_interes' ? (parseFloat(subP.monto_total) * 0.20).toFixed(2) : subP.valor_cuota}
                                </p>
                                <p className={`text-[9px] font-bold uppercase tracking-wider ${subP.atrasado ? 'text-red-500' : 'text-gray-500'}`}>
                                    {subP.tipo_prestamo === 'mensual_interes' ? (subP.frecuencia.startsWith('dias_') ? `Int. (${subP.frecuencia.split('_')[1]} Días)` : 'Interés Abierto') : 'Cuota Fija'} • Corte: {subP.fechaVencimiento}
                                </p>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); abrirModal(subP); }} className="bg-white text-amber-600 text-[10px] font-black px-3 py-2 rounded-lg hover:bg-amber-50 transition uppercase tracking-widest border border-amber-200 shadow-sm">
                                {subP.tipo_prestamo === 'mensual_interes' ? 'Libreta' : 'Cartulina'}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ----------------------------------------------------
// VISTA PRINCIPAL
// ----------------------------------------------------
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

        let query = supabase
            .from('prestamos')
            .select(`
                id, monto_total, monto_capital, frecuencia, fecha_inicio, estado, valor_cuota, cobrador, tipo_prestamo,
                clientes ( id, nombre, telefono ),
                historial_pagos ( id, fecha_cobro, estado_cobro, monto_recibido ),
                movimientos_mensuales ( tipo, monto, fecha )
            `)
            .eq('prestamista_id', user.id)
            .eq('estado', 'activo');

        if (modalidadActiva === 'semanal') query = query.eq('frecuencia', 'dias_7');
        else if (modalidadActiva === 'quincenal') query = query.eq('frecuencia', 'dias_15');
        else if (modalidadActiva === 'mensual') query = query.eq('frecuencia', 'mensual');
        else if (modalidadActiva === 'especial') query = query.like('frecuencia', 'dias_%').neq('frecuencia', 'dias_7').neq('frecuencia', 'dias_15');

        const { data, error } = await query;

        if (!error && data) {
            const procesados = data.map(p => {
                let fechaVencimiento = 'Sin fecha';
                let atrasado = false;
                let mensajeAtraso = '';

                if (p.tipo_prestamo === 'mensual_interes') {
                    let cortesPorMes = 1;
                    if (p.frecuencia === 'dias_7') cortesPorMes = 4;
                    else if (p.frecuencia === 'dias_15') cortesPorMes = 2;
                    else if (p.frecuencia.startsWith('dias_')) cortesPorMes = 30 / parseInt(p.frecuencia.split('_')[1]);

                    const capitalOriginal = parseFloat(p.monto_total);
                    const interesPorCorteFijo = (capitalOriginal * 0.20) / cortesPorMes;

                    const pagado = (p.movimientos_mensuales || []).filter(m => m.tipo === 'pago_interes').reduce((sum, m) => sum + parseFloat(m.monto), 0);
                    const ajustes = (p.movimientos_mensuales || []).filter(m => m.tipo === 'ajuste_interes').reduce((sum, m) => sum + parseFloat(m.monto), 0);

                    if (p.frecuencia.startsWith('dias_')) {
                        const diasFrecuencia = parseInt(p.frecuencia.split('_')[1]);
                        let generado = 0;
                        let cortesTranscurridos = 0;
                        let fechaCorteEfectiva = sumarDias(p.fecha_inicio, diasFrecuencia);

                        while (fechaCorteEfectiva <= hoyStr) {
                            generado += interesPorCorteFijo;
                            cortesTranscurridos++;
                            fechaCorteEfectiva = sumarDias(p.fecha_inicio, diasFrecuencia * (cortesTranscurridos + 1));
                        }

                        const pendiente = generado - pagado - ajustes;
                        fechaVencimiento = fechaCorteEfectiva;

                        if (pendiente > 0.01) {
                            atrasado = true;
                            mensajeAtraso = `Deuda: $${pendiente.toFixed(2)}`;
                        }

                    } else {
                        // LÓGICA MENSUAL SINCRONIZADA ESTRICTA EN UTC
                        let i = 1;
                        let generado = 0;
                        let cortesTranscurridos = 0;
                        let fechaCorteEfectiva = sumarMesesPreservandoDia(p.fecha_inicio, i);

                        while (fechaCorteEfectiva <= hoyStr) {
                            generado += interesPorCorteFijo;
                            cortesTranscurridos++;
                            i++;
                            fechaCorteEfectiva = sumarMesesPreservandoDia(p.fecha_inicio, i);
                        }

                        const pendiente = generado - pagado - ajustes;
                        fechaVencimiento = fechaCorteEfectiva;

                        if (pendiente > 0.01) {
                            atrasado = true;
                            mensajeAtraso = `Deuda: $${pendiente.toFixed(2)}`;
                        }
                    }

                } else {
                    const pendientes = (p.historial_pagos || [])
                        .filter(pago => pago.estado_cobro === 'pendiente' || pago.estado_cobro === 'no_pago')
                        .sort((a, b) => a.fecha_cobro.localeCompare(b.fecha_cobro));

                    if (pendientes.length > 0) {
                        fechaVencimiento = pendientes[0].fecha_cobro;
                        const cuotasVencidas = pendientes.filter(pago => pago.fecha_cobro < hoyStr).length;

                        if (cuotasVencidas > 0) {
                            atrasado = true;
                            mensajeAtraso = `${cuotasVencidas} cuota(s) vencida(s)`;
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

        // AGRUPACIÓN INTELIGENTE POR CLIENTE PARA EL ACORDEÓN
        const agrupadosPorCliente = {};
        filtrados.forEach(p => {
            const clienteId = p.clientes.id;
            if (!agrupadosPorCliente[clienteId]) {
                agrupadosPorCliente[clienteId] = {
                    ...p,
                    prestamosAgrupados: [p],
                    montoTotalSuma: parseFloat(p.tipo_prestamo === 'mensual_interes' ? (parseFloat(p.monto_total) * 0.20) : p.valor_cuota),
                    atrasadoAlguna: p.atrasado,
                    mensajesAtraso: p.mensajeAtraso ? [p.mensajeAtraso] : []
                };
            } else {
                const item = agrupadosPorCliente[clienteId];
                item.prestamosAgrupados.push(p);
                item.montoTotalSuma += parseFloat(p.tipo_prestamo === 'mensual_interes' ? (parseFloat(p.monto_total) * 0.20) : p.valor_cuota);

                if (p.atrasado) {
                    item.atrasadoAlguna = true;
                    if (p.mensajeAtraso && !item.mensajesAtraso.includes(p.mensajeAtraso)) {
                        item.mensajesAtraso.push(p.mensajeAtraso);
                    }
                }
                // Conservar la fecha de vencimiento más antigua/próxima
                if (p.fechaVencimiento.localeCompare(item.fechaVencimiento) < 0) {
                    item.fechaVencimiento = p.fechaVencimiento;
                }
            }
        });

        const resultadoFinal = Object.values(agrupadosPorCliente).map(item => ({
            ...item,
            atrasado: item.atrasadoAlguna,
            mensajeAtraso: item.mensajesAtraso.join(' | ')
        }));

        return resultadoFinal.sort((a, b) => {
            if (a.atrasado && !b.atrasado) return -1;
            if (!a.atrasado && b.atrasado) return 1;
            return a.fechaVencimiento.localeCompare(b.fechaVencimiento);
        });
    }, [prestamos, cobradorActivo, busqueda]);

    const abrirModal = (prestamo) => setPrestamoSeleccionado(prestamo);
    const renovarPrestamo = (clienteId, prestamoId) => navigate('/nuevo-prestamo', { state: { preselectClienteId: clienteId, prestamoARenovar: prestamoId } });

    const finalizarPrestamo = async (datosLiquidacion = null) => {
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

                <div className="grid grid-cols-4 gap-1 bg-gray-200 p-1 rounded-xl">
                    {[
                        { id: 'semanal', label: 'Sem.' },
                        { id: 'quincenal', label: 'Quin.' },
                        { id: 'mensual', label: 'Mens.' },
                        { id: 'especial', label: 'Especial' }
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
                            type="text" placeholder="Buscar cliente..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl pl-10 pr-3 py-3 outline-none font-bold text-sm focus:border-amber-500 transition"
                        />
                    </div>
                    <select value={cobradorActivo} onChange={(e) => setCobradorActivo(e.target.value)} className="w-full md:w-1/3 bg-gray-50 border border-gray-200 text-gray-800 rounded-xl p-3 outline-none font-bold text-sm focus:border-amber-500 transition">
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
                        prestamosFiltrados.map((grupo) => (
                            <PrestamoGrupoAcordeon key={grupo.id} grupo={grupo} abrirModal={abrirModal} />
                        ))
                    )}
                </div>
            </div>

            {prestamoSeleccionado && (
                prestamoSeleccionado.tipo_prestamo === 'mensual_interes' ? (
                    <LibretaInteresAbiertoModal
                        prestamo={prestamoSeleccionado}
                        onClose={() => setPrestamoSeleccionado(null)}
                        onFinalizar={finalizarPrestamo}
                        onUpdate={fetchPrestamosPeriodicos}
                    />
                ) : (
                    <CartulinaModal
                        prestamo={prestamoSeleccionado}
                        onClose={() => setPrestamoSeleccionado(null)}
                        onRenovar={renovarPrestamo}
                        onFinalizar={finalizarPrestamo}
                        onUpdate={fetchPrestamosPeriodicos}
                    />
                )
            )}
        </div>
    );
}