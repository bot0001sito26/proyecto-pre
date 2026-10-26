export default function Suspendido() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
            <div className="rounded-xl bg-white p-8 text-center shadow-lg">
                <h1 className="text-2xl font-bold text-red-600">Cuenta Suspendida</h1>
                <p className="mt-4 text-gray-700">Por favor, contacte al administrador del sistema para reactivar su acceso.</p>
            </div>
        </div>
    );
}