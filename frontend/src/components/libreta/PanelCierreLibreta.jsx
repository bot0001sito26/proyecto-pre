import { useState } from 'react';

export default function PanelCierreLibreta({
    estado,
    modoLiquidacion,
    onAbrirPanel,
    onCerrarPanel,
    capitalActualEnVivo,
    pendiente,
    nombreCliente,
    onSolicitarConfirmacion
}) {
    const [tipoCierre, setTipoCierre] = useState('liquidar'); // 'liquidar' | 'renovar'
    const [interesLiquidacion, setInteresLiquidacion] = useState('0.00');

    const abrir = (modo) => {
        setTipoCierre(modo);
        setInteresLiquidacion(Math.max(0, pendiente).toFixed(2));
        onAbrirPanel();
    };

    const confirmar = () => {
        const intVal = parseFloat(interesLiquidacion) || 0;
        const esRenovacion = tipoCierre === 'renovar';

        const mensaje = esRenovacion
            ? `Se liquidará este crédito ($${capitalActualEnVivo.toFixed(2)} capital + $${intVal.toFixed(2)} interés) y pasarás al formulario de Nuevo Préstamo para ${nombreCliente || 'este cliente'}.`
            : `Se pagará capital ($${capitalActualEnVivo.toFixed(2)}) y un interés final de $${intVal.toFixed(2)}.`;

        onSolicitarConfirmacion({
            titulo: esRenovacion ? 'Confirmar Renovación' : 'Confirmar Liquidación',
            mensaje,
            datosCierre: { esRenovacion, intCobrado: intVal }
        });
    };

    if (estado !== 'activo') {
        return (
            <div className="p-3 border-t border-neutral-200 bg-neutral-100 text-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                    Crédito {estado === 'renovado' ? 'Renovado' : 'Cerrado'} • Solo Lectura
                </span>
            </div>
        );
    }

    return (
        <div className="p-4 border-t border-neutral-200 bg-neutral-50 flex flex-col gap-2">
            {!modoLiquidacion && (
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => abrir('renovar')}
                        className="bg-neutral-900 text-amber-500 font-black uppercase tracking-wider py-3 rounded-lg hover:bg-neutral-800 shadow-md text-xs flex items-center justify-center gap-1.5 transition"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Renovar Crédito
                    </button>
                    <button
                        onClick={() => abrir('liquidar')}
                        className="bg-amber-500 text-neutral-950 font-black uppercase tracking-wider py-3 rounded-lg hover:bg-amber-600 shadow-md text-xs flex items-center justify-center gap-1.5 transition"
                    >
                        Finalizar / Liquidar
                    </button>
                </div>
            )}

            {modoLiquidacion && (
                <div className={`w-full border rounded-xl p-3 flex flex-col gap-3 animate-fade-in shadow-inner ${tipoCierre === 'renovar' ? 'bg-amber-50 border-amber-300' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex justify-between items-center">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${tipoCierre === 'renovar' ? 'text-amber-800' : 'text-red-600'}`}>
                            {tipoCierre === 'renovar' ? 'Liquidar y Renovar Crédito' : 'Liquidación Anticipada'}
                        </span>
                        <button
                            type="button"
                            onClick={() => setTipoCierre(tipoCierre === 'renovar' ? 'liquidar' : 'renovar')}
                            className="text-[9px] font-black uppercase underline text-neutral-600 hover:text-neutral-900"
                        >
                            {tipoCierre === 'renovar' ? 'Solo Finalizar' : '¿Renovar Crédito?'}
                        </button>
                    </div>

                    <div className="flex justify-between items-center text-sm border-b border-black/10 pb-1">
                        <span className="text-neutral-700 font-bold">Capital a saldar:</span>
                        <span className="font-black text-neutral-900">${capitalActualEnVivo.toFixed(2)}</span>
                    </div>

                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-neutral-700 font-bold">Interés pendiente sugerido:</span>
                            <span className="font-black text-neutral-900">${Math.max(0, pendiente).toFixed(2)}</span>
                        </div>
                        <label className="text-[10px] font-black uppercase text-neutral-600 mt-1">Interés acordado a cobrar:</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-neutral-700">$</span>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={interesLiquidacion}
                                onChange={(e) => setInteresLiquidacion(e.target.value)}
                                className="w-full bg-white border border-gray-300 rounded-lg pl-7 pr-3 py-2 font-black text-neutral-900 outline-none focus:border-amber-500 transition"
                            />
                        </div>
                    </div>

                    {tipoCierre === 'renovar' && (
                        <p className="text-[10px] font-bold text-amber-900 bg-white/80 border border-amber-200 rounded-lg p-2 leading-snug">
                            Al confirmar, se saldará este crédito y se abrirá el formulario de <strong>Nuevo Préstamo</strong> con el cliente preseleccionado.
                        </p>
                    )}

                    <div className="flex gap-2 mt-1">
                        <button
                            onClick={onCerrarPanel}
                            className="flex-1 bg-white border border-gray-300 text-gray-600 font-black py-2 rounded-lg text-xs uppercase tracking-wider hover:bg-gray-50 transition"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={confirmar}
                            className={`flex-[2] font-black py-2 rounded-lg text-xs uppercase tracking-wider shadow-md transition ${tipoCierre === 'renovar'
                                    ? 'bg-neutral-900 text-amber-500 hover:bg-neutral-800'
                                    : 'bg-red-600 text-white hover:bg-red-700'
                                }`}
                        >
                            {tipoCierre === 'renovar' ? 'Confirmar e Ir a Nuevo' : 'Confirmar Pago'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}