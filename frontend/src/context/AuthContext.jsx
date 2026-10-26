import { createContext, useState, useEffect, useContext } from 'react';
import supabase from '../supabaseClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [perfil, setPerfil] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                fetchPerfil(session.user.id);
            } else {
                setLoading(false);
            }
        });


        const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
                fetchPerfil(session.user.id);
            } else {
                setUser(null);
                setPerfil(null);
                setLoading(false);
            }
        });

        return () => listener.subscription.unsubscribe();
    }, []);

    const fetchPerfil = async (userId) => {
        const { data, error } = await supabase
            .from('perfiles')
            .select('rol, estado')
            .eq('id', userId)
            .single();

        if (!error && data) {
            setUser({ id: userId });
            setPerfil(data);
        }
        setLoading(false);
    };

    return (
        <AuthContext.Provider value={{ user, perfil, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);