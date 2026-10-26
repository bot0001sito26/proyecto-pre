import { useState } from 'react';

export default function ClienteAcordeon({ cliente, setPrestamoSeleccionado }) {
    const [expandido, setExpandido] = useState(false);

    const prestamosActivos = cliente.prestamos.filter(p => p.estado === 'activo');
    const prestamosCerrados = cliente.prestamos.filter(p => p.estado !== 'activo');

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div
                onClick={() => setExpandido(!expandido)}
                className="p-4 bg-white flex justify-between items-center cursor-pointer hover:bg-gray-50 transition border-b border-transparent hover:border-gray-100"
            >
                <div>
                    <h2 className="font-bold text-gray-800 text-sm md:text-base">{cliente.nombre}</h2>
                    {cliente.telefono && <p className="text-[11px] font-bold text-gray-400 flex items-center gap-1 mt-0.5">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                        {cliente.telefono}
                    </p>}
                </div>
                <div className="flex items-center gap-3">
                    <span className="bg-amber-100 text-amber-700 border border-amber-200 text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-wider">
                        {prestamosActivos.length} Activos
                    </span>
                    <svg className={`w-5 h-5 text-gray-400 transition-transform ${expandido ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
            </div>

            {expandido && (
                <div className="p-3 bg-gray-50/50">
                    {prestamosActivos.length > 0 && (
                        <div className="divide-y divide-gray-100">
                            {prestamosActivos.map(p => {
                                const cobrado = Number(p.monto_total) - Number(p.saldo_pendiente);
                                const porcentaje = Math.round((cobrado / Number(p.monto_total)) * 100) || 0;

                                return (
                                    <div key={p.id} className="py-3 first:pt-0 last:pb-0">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <p className="font-black text-gray-800 text-sm">Capital: ${p.monto_capital}</p>
                                                <p className="text-[11px] font-bold text-amber-600 mb-1">A cobrar: ${p.monto_total}</p>
                                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{p.frecuencia} • Inició: {p.fecha_inicio}</p>
                                            </div>
                                            <button onClick={() => setPrestamoSeleccionado(p)} className="bg-white text-amber-600 text-[10px] font-black px-3 py-2 rounded-lg hover:bg-amber-50 transition uppercase tracking-widest border border-amber-200 shadow-sm">
                                                Cartulina
                                            </button>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2 overflow-hidden">
                                            <div className="bg-amber-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${porcentaje}%` }}></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {prestamosCerrados.length > 0 && (
                        <div className="mt-4 border-t border-gray-200 pt-3">
                            <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Historial Cerrado</h3>
                            <div className="divide-y divide-gray-100">
                                {prestamosCerrados.map(p => (
                                    <div key={p.id} className="py-2 opacity-75 grayscale hover:grayscale-0 transition">
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="font-bold text-gray-600 text-sm">Capital: ${p.monto_capital}</p>
                                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Inició: {p.fecha_inicio} • {p.estado}</p>
                                            </div>
                                            <button onClick={() => setPrestamoSeleccionado(p)} className="bg-white text-gray-500 text-[10px] font-bold px-3 py-1.5 rounded-md uppercase tracking-wider hover:bg-gray-100 border border-gray-200">
                                                Ver
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}