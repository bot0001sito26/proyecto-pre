const getTipoBadge = (tipo) => {
    switch (tipo) {
        case 'corte_mes':
            return <span className="font-black uppercase text-[9px] px-2 py-0.5 rounded bg-blue-100 text-blue-800">Inicio</span>;
        case 'pago_interes':
            return <span className="font-black uppercase text-[9px] px-2 py-0.5 rounded bg-green-100 text-green-800">Pago Int.</span>;
        case 'abono_capital':
            return <span className="font-black uppercase text-[9px] px-2 py-0.5 rounded bg-amber-100 text-amber-800">Abono Cap.</span>;
        case 'ajuste_interes':
            return <span className="font-black uppercase text-[9px] px-2 py-0.5 rounded bg-purple-100 text-purple-800">Ajuste</span>;
        default:
            return <span className="font-black uppercase text-[9px] px-2 py-0.5 rounded bg-gray-200 text-gray-700">{tipo}</span>;
    }
};

export default function HistorialTransaccionesLibreta({ cargando, movimientos }) {
    return (
        <div className="border-t border-gray-200 pt-3">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                Historial de Transacciones
            </h3>
            {cargando ? (
                <div className="flex justify-center py-4">
                    <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
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
                            <span className={`font-black text-sm ${m.tipo === 'ajuste_interes' ? 'text-purple-600' : 'text-neutral-800'}`}>
                                ${parseFloat(m.monto).toFixed(2)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}