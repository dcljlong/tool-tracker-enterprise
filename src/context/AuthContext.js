import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(undefined); // undefined until first auth check completes
  const [loading, setLoading] = useState(true);

  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [profileLoadedAt, setProfileLoadedAt] = useState(null);

  const accessToken = useMemo(() => session?.access_token || '', [session]);
  const isAdmin = Boolean(profile?.is_admin);

  const loadProfile = async (uid) => {
    try {
      if (!uid) {
        setProfile(null);
        setProfileError(null);
        setProfileLoadedAt(new Date().toISOString());
        return;
      }

      // IMPORTANT: profiles table is keyed by auth user id (uuid)
      const { data, error } = await supabase
        .from('profiles')
        .select('id,is_admin,role,created_at')
        .eq('id', uid)
        .maybeSingle();
if (error) {
        setProfile(null);
        setProfileError(String(error.message || error));
        setProfileLoadedAt(new Date().toISOString());
        return;
      }

      if (!data) {
        setProfile(null);
        setProfileError('Profile row not found (RLS or missing row).');
        setProfileLoadedAt(new Date().toISOString());
        return;
      }

      setProfile(data);
      setProfileError(null);
      setProfileLoadedAt(new Date().toISOString());
    } catch (e) {
setProfile(null);
      setProfileError(String(e?.message || e));
      setProfileLoadedAt(new Date().toISOString());
    }
  };

  useEffect(() => {
    let mounted = true;

    // Hard watchdog so UI cannot remain loading forever
    const watchdog = setTimeout(() => {
      if (!mounted) return;
setLoading(false);
      setUser((prev) => (prev === undefined ? null : prev));
    }, 4000);

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;

        const s = error ? null : (data?.session || null);
        const u = s?.user || null;
setSession(s);
        setUser(u);

        await loadProfile(u?.id);
      } catch (e) {
        if (!mounted) return;
setSession(null);
        setUser(null);
        setProfile(null);
        setProfileError(String(e?.message || e));
        setProfileLoadedAt(new Date().toISOString());
      } finally {
        if (!mounted) return;
        clearTimeout(watchdog);
        setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (!mounted) return;

      const u = s?.user || null;
setSession(s || null);
      setUser(u);

      // Do NOT block auth updates on profile
      loadProfile(u?.id);
    });

    return () => {
      mounted = false;
      clearTimeout(watchdog);
      try { sub?.subscription?.unsubscribe(); } catch {}
    };
  }, []);

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (!error) {
      const s = data?.session || null;
      const u = s?.user || null;
      setSession(s);
      setUser(u);
      loadProfile(u?.id);
    }
    return { error };
  };

  const signUp = async (email, password) => {
    return await supabase.auth.signUp({ email, password });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setProfileError(null);
    setProfileLoadedAt(new Date().toISOString());
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        accessToken,
        user,
        loading,
        profile,
        profileError,
        profileLoadedAt,
        isAdmin,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

