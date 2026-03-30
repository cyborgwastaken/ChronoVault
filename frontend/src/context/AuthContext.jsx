import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const profileFetched = useRef(false);

    useEffect(() => {
        // Listen for auth changes — this fires INITIAL_SESSION first, then any changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('[Auth] Event:', event, session?.user?.email || 'no user');

            if (session?.user) {
                setUser(session.user);
                // Only fetch profile once per session to avoid race conditions
                if (!profileFetched.current) {
                    profileFetched.current = true;
                    // Use setTimeout to avoid Supabase deadlock with simultaneous requests
                    setTimeout(() => fetchProfile(session.user.id), 0);
                }
            } else {
                setUser(null);
                setProfile(null);
                profileFetched.current = false;
                setLoading(false);
            }
        });

        // Safety: if nothing fires within 4 seconds, stop loading
        const safetyTimer = setTimeout(() => {
            if (loading) {
                console.log('[Auth] Safety timeout — stopping loader');
                setLoading(false);
            }
        }, 4000);

        return () => {
            subscription.unsubscribe();
            clearTimeout(safetyTimer);
        };
    }, []);

    const fetchProfile = async (userId) => {
        try {
            console.log('[Auth] Fetching profile for:', userId);
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) {
                console.error('[Auth] Profile error:', error.message);
                // If profile doesn't exist yet (trigger may be slow), retry once
                if (error.code === 'PGRST116') {
                    console.log('[Auth] Retrying in 2s...');
                    await new Promise(r => setTimeout(r, 2000));
                    const { data: d2, error: e2 } = await supabase
                        .from('users')
                        .select('*')
                        .eq('id', userId)
                        .single();
                    if (!e2 && d2) {
                        setProfile(d2);
                        console.log('[Auth] Profile OK on retry:', d2.role, d2.credits);
                    }
                }
            } else {
                setProfile(data);
                console.log('[Auth] Profile OK:', data.email, 'role:', data.role, 'credits:', data.credits);
            }
        } catch (err) {
            console.error('[Auth] Unexpected:', err);
        } finally {
            setLoading(false);
        }
    };

    const refreshProfile = async () => {
        if (user) {
            profileFetched.current = true;
            await fetchProfile(user.id);
        }
    };

    const signInWithGoogle = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin,
            },
        });
        if (error) throw error;
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
        profileFetched.current = false;
    };

    const deductCredits = async (amount, type, description) => {
        console.log('[Auth] Deducting:', amount, type);
        const { data, error } = await supabase.rpc('deduct_credits', {
            amount,
            transaction_type: type,
            transaction_description: description,
        });

        console.log('[Auth] Deduct response:', data, error);

        if (error) throw new Error(error.message);

        const result = typeof data === 'string' ? JSON.parse(data) : data;
        if (!result.success) throw new Error(result.error || 'Credit deduction failed');

        await refreshProfile();
        return result;
    };

    const linkWallet = async (walletAddress) => {
        if (!user) throw new Error('Not authenticated');
        const { error } = await supabase
            .from('users')
            .update({ wallet_address: walletAddress })
            .eq('id', user.id);
        if (error) throw error;
        await refreshProfile();
    };

    const value = {
        user,
        profile,
        loading,
        signInWithGoogle,
        signOut,
        refreshProfile,
        deductCredits,
        linkWallet,
        isAdmin: profile?.role === 'admin',
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
