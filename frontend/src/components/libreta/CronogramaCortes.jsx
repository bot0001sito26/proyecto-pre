export default function CronogramaCortes({ mesesAgrupados }) {
    if (!mesesAgrupados || mesesAgrupados.length === 0) return null;

    return (
        <div className="mb-4 bg-white border border-gray-200 rounded-lg p-2 max-h-48 overflow-y-auto shadow-inner">
            <span className="block text-[9px] font-black uppercase text-gray-400 mb-2 sticky top-0 bg-white pb-1 z-10">
                Cronograma de Cortes
            </span>
            <div className="space-y-3">
                {mesesAgrupados.map(mes => (
                    <div key={mes.mesNumero} className="border border-amber-100 rounded-md overflow-hidden">
                        <div className="bg-amber-50 px-2 py-1.5 flex justify-between items-center border-b border-amber-100">
                            <span className="text-[10px] font-black uppercase text-amber-800">Mes {mes.mesNumero}</span>
                            <div className="flex gap-3 text-[9px] font-bold text-amber-600">
                                <span>Base: ${mes.capitalBase.toFixed(2)}</span>
                                <span>Int: ${(mes.capitalBase * 0.20).toFixed(2)}</span>
                            </div>
                        </div>
                        <div className="bg-white">
                            {mes.cortes.map(c => (
                                <div
                                    key={c.numeroGlobal}
                                    className={`flex justify-between items-center px-2 py-1.5 text-[10px] uppercase font-black tracking-wider border-b last:border-b-0 border-gray-50 ${c.estado === 'proximo' ? 'bg-amber-100/50 text-amber-900' : 'text-gray-500'
                                        }`}
                                >
                                    <span>
                                        Corte #{c.numeroLocal}{' '}
                                        <span className="text-[8px] text-gray-400 normal-case">(Global #{c.numeroGlobal})</span>
                                    </span>
                                    <span className="flex items-center gap-2">
                                        <span>{c.fecha}</span>
                                        {c.estado === 'proximo' ? (
                                            <span className="text-amber-600">(Próximo)</span>
                                        ) : (
                                            <span className="text-green-500">✓</span>
                                        )}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}