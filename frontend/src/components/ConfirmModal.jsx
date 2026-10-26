export default function ConfirmModal({ isOpen, titulo, mensaje, onConfirm, onCancel }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-neutral-950/70 flex items-center justify-center z-[70] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-fade-in-up">
                <h3 className="text-lg font-black text-neutral-900 mb-2 uppercase tracking-wide flex items-center gap-2">
                    <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    {titulo || "Confirmar Acción"}
                </h3>
                <p className="text-sm text-gray-600 mb-6 font-medium leading-relaxed">
                    {mensaje}
                </p>
                <div className="flex gap-3">
                    <button onClick={onCancel} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-bold uppercase tracking-wider text-xs hover:bg-gray-200 transition">
                        Cancelar
                    </button>
                    <button onClick={onConfirm} className="flex-1 bg-amber-500 text-white py-3 rounded-xl font-bold uppercase tracking-wider text-xs hover:bg-amber-600 transition shadow-md">
                        Confirmar
                    </button>
                </div>
            </div>
        </div>
    );
}