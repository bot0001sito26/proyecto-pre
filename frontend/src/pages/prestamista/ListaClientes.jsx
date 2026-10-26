import { useState, useEffect } from 'react';
import supabase from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';
import ConfirmModal from '../../components/ConfirmModal';

const ITEMS_POR_PAGINA = 20;

export default function ListaClientes() {
    const { user } = useAuth();
    const [nombre, setNombre] = useState('');
    const [telefono, setTelefono] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [busqueda, setBusqueda] = useState('');

    // Estados para edición compacta
    const [editandoId, setEditandoId] = useState(null);
    const [editNombre, setEditNombre] = useState('');
    const [editTelefono, setEditTelefono] = useState('');

    // Estado para el modal de confirmación
    const [modalConf, setModalConf] = useState({ isOpen: false, titulo: '', mensaje: '', accion: null });

    const [clientes, setClientes] = useState(() => {
        try { return JSON.parse(sessionStorage.getItem('anubis_clientes')) || []; } catch { return []; }
    });
    const [totalClientes, setTotalClientes] = useState(() => {
        try { return Number(sessionStorage.getItem('anubis_clientes_total')) || 0; } catch { return 0; }
    });

    const [cargando, setCargando] = useState(clientes.length === 0);
    const [pagina, setPagina] = useState(1);

    useEffect(() => {
        setPagina(1);
    }, [busqueda]);

    useEffect(() => {
        if (user?.id) {
            const timeoutId = setTimeout(() => fetchClientes(), 300);
            return () => clearTimeout(timeoutId);
        }
    }, [user, pagina, busqueda]);

    const fetchClientes = async () => {
        if (clientes.length === 0 || pagina > 1 || busqueda.trim() !== '') {
            setCargando(true);
        }

        const from = (pagina - 1) * ITEMS_POR_PAGINA;
        const to = from + ITEMS_POR_PAGINA - 1;

        let query = supabase
            .from('clientes')
            .select('*', { count: 'exact' })
            .eq('prestamista_id', user.id)
            .order('nombre', { ascending: true });

        if (busqueda.trim() !== '') {
            query = query.ilike('nombre', `%${busqueda}%`);
        }

        const { data, count, error } = await query.range(from, to);
        if (!error && data) {
            setClientes(data);
            setTotalClientes(count || 0);

            if (pagina === 1 && busqueda.trim() === '') {
                sessionStorage.setItem('anubis_clientes', JSON.stringify(data));
                sessionStorage.setItem('anubis_clientes_total', count.toString());
            }
        }
        setCargando(false);
    };

    const handleCrearCliente = async (e) => {
        e.preventDefault();
        if (!nombre.trim()) return;
        setGuardando(true);
        const { error } = await supabase.from('clientes').insert([{ prestamista_id: user.id, nombre, telefono }]);
        if (!error) {
            setNombre('');
            setTelefono('');
            setPagina(1);
            setBusqueda('');
            sessionStorage.removeItem('anubis_clientes');
            fetchClientes();
        } else {
            alert("Error al crear cliente");
        }
        setGuardando(false);
    };

    const iniciarEdicion = (cliente) => {
        setEditandoId(cliente.id);
        setEditNombre(cliente.nombre);
        setEditTelefono(cliente.telefono || '');
    };

    const solicitarGuardarEdicion = (id) => {
        if (!editNombre.trim()) return;

        setModalConf({
            isOpen: true,
            titulo: 'Actualizar Cliente',
            mensaje: `¿Estás seguro que deseas actualizar los datos a ${editNombre}?`,
            accion: () => ejecutarGuardado(id)
        });
    };

    const ejecutarGuardado = async (id) => {
        setModalConf({ isOpen: false, accion: null });

        const { error } = await supabase
            .from('clientes')
            .update({ nombre: editNombre, telefono: editTelefono })
            .eq('id', id);

        if (!error) {
            const clientesActualizados = clientes.map(c =>
                c.id === id ? { ...c, nombre: editNombre, telefono: editTelefono } : c
            );

            setClientes(clientesActualizados);

            if (pagina === 1 && busqueda.trim() === '') {
                sessionStorage.setItem('anubis_clientes', JSON.stringify(clientesActualizados));
            }

            setEditandoId(null);
        } else {
            alert("Error al actualizar el cliente en la base de datos.");
        }
    };

    const totalPaginas = Math.ceil(totalClientes / ITEMS_POR_PAGINA);

    return (
        <div className="min-h-screen bg-gray-50 p-4 pb-20 overflow-x-hidden w-full font-sans">
            <div className="max-w-2xl mx-auto space-y-6">

                <div className="flex items-center justify-between mb-2">
                    <Link to="/dashboard" className="text-neutral-400 hover:text-amber-600 transition flex items-center gap-1 font-bold text-xs uppercase tracking-widest">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Volver
                    </Link>
                    <h1 className="text-xl font-black text-neutral-900 tracking-widest uppercase">Mis Clientes</h1>
                </div>

                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-amber-500"></div>
                    <h2 className="text-xs font-black uppercase tracking-widest text-neutral-800 mb-4 flex items-center gap-2">
                        <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                        Agregar Nuevo
                    </h2>
                    <form onSubmit={handleCrearCliente} className="flex flex-col md:flex-row gap-3">
                        <input
                            type="text"
                            placeholder="Nombre (Obligatorio)"
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none text-neutral-800 focus:border-amber-500 placeholder-gray-400 font-medium transition"
                            required
                        />
                        <input
                            type="text"
                            placeholder="Teléfono"
                            value={telefono}
                            onChange={(e) => setTelefono(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none text-neutral-800 focus:border-amber-500 placeholder-gray-400 font-medium transition"
                        />
                        <button type="submit" disabled={guardando} className="bg-amber-500 text-white px-6 py-3 rounded-xl font-black uppercase tracking-wider text-xs hover:bg-amber-600 transition whitespace-nowrap shadow-sm shadow-amber-500/30">
                            {guardando ? '...' : 'Guardar'}
                        </button>
                    </form>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50/50 relative">
                        <svg className="w-5 h-5 absolute left-7 top-1/2 transform -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        <input
                            type="text"
                            placeholder="Buscar cliente..."
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            className="w-full bg-white border border-gray-200 rounded-xl pl-10 p-3 text-sm outline-none focus:border-amber-500 font-medium text-gray-700 transition"
                        />
                    </div>

                    {cargando ? (
                        <div className="flex justify-center py-8"><div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div></div>
                    ) : clientes.length === 0 ? (
                        <p className="p-8 text-center text-sm text-gray-400 font-medium">
                            {busqueda ? 'No se encontraron resultados.' : 'No tienes clientes aún.'}
                        </p>
                    ) : (
                        <ul className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
                            {clientes.map(c => (
                                <li key={c.id} className="p-3 md:p-4 hover:bg-amber-50/30 transition">
                                    {editandoId === c.id ? (
                                        <div className="space-y-2 w-full">
                                            <div className="flex flex-col sm:flex-row gap-2">
                                                <input
                                                    type="text"
                                                    value={editNombre}
                                                    onChange={(e) => setEditNombre(e.target.value)}
                                                    className="w-full bg-white border border-amber-300 rounded-lg p-2 text-sm outline-none font-bold text-gray-800 focus:ring-2 focus:ring-amber-500/20"
                                                    placeholder="Nombre"
                                                    autoFocus
                                                />
                                                <input
                                                    type="text"
                                                    value={editTelefono}
                                                    onChange={(e) => setEditTelefono(e.target.value)}
                                                    placeholder="Teléfono"
                                                    className="w-full sm:w-40 bg-white border border-amber-300 rounded-lg p-2 text-xs outline-none font-medium text-gray-800 focus:ring-2 focus:ring-amber-500/20"
                                                />
                                            </div>
                                            <div className="flex justify-end gap-2 pt-1">
                                                <button onClick={() => setEditandoId(null)} className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition flex items-center gap-1">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                                    Cancelar
                                                </button>
                                                <button onClick={() => solicitarGuardarEdicion(c.id)} className="px-3 py-1.5 text-xs font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 transition flex items-center gap-1 shadow-sm">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                    Guardar
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-gray-800 text-sm md:text-base truncate">{c.nombre}</p>
                                                {c.telefono && (
                                                    <p className="text-[11px] font-bold text-gray-400 mt-0.5 flex items-center gap-1">
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                                        {c.telefono}
                                                    </p>
                                                )}
                                            </div>
                                            <button onClick={() => iniciarEdicion(c)} className="text-gray-400 hover:text-amber-500 transition p-2 bg-gray-50 hover:bg-amber-50 rounded-lg shrink-0" title="Editar Cliente">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                            </button>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {totalPaginas > 1 && (
                    <div className="flex items-center justify-between bg-white p-3 rounded-2xl shadow-sm border border-gray-100">
                        <button
                            onClick={() => setPagina(p => Math.max(1, p - 1))}
                            disabled={pagina === 1 || cargando}
                            className="text-[10px] font-black uppercase tracking-widest px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                            Anterior
                        </button>
                        <span className="text-xs font-bold text-gray-500">
                            Página {pagina} de {totalPaginas}
                        </span>
                        <button
                            onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                            disabled={pagina === totalPaginas || cargando}
                            className="text-[10px] font-black uppercase tracking-widest px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                            Siguiente
                        </button>
                    </div>
                )}
            </div>

            <ConfirmModal
                isOpen={modalConf.isOpen}
                titulo={modalConf.titulo}
                mensaje={modalConf.mensaje}
                onConfirm={modalConf.accion}
                onCancel={() => setModalConf({ isOpen: false, accion: null })}
            />
        </div>
    );
}