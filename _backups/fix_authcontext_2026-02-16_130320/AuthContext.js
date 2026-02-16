import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

// AUTHCTX_FINGERPRINT
export const AUTHCTX_FINGERPRINT = 'AUTHCTX_' + new Date().toISOString();


export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(undefined); // undefined until first auth check completes
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [profileLoadedAt, setProfileLoadedAt] = useState(null);

  const loadProfile = async (uid) => {
  if (!uid) {
    setProfile(null);
    setProfileError(null);
    setProfileLoadedAt(new Date().toISOString());
    return;
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,is_admin,created_at,role')
      .eq('id', uid)
      .maybeSingle();

    if (error) {
      setProfile(null);
      setProfileError(String(error.message || error));
      return;
    }

    if (!data) {
      setProfile(null);
      setProfileError('Profile row not found (RLS or missing row).');
      return;
    }

    setProfile(data);
    setProfileError(null);
  } catch (e) {
    setProfile(null);
    setProfileError(String(e?.message || e));
  } finally {
    setProfileLoadedAt(new Date().toISOString());
  }
};

  useEffect(() => {
    let mounted = true;

    // Watchdog: prevent infinite spinner, but do NOT overwrite a real session/user if it arrives later
    const watchdog = setTimeout(() => {
      if (!mounted) return;
      setLoading(false);
      setUser((prev) => (prev === undefined ? null : prev));
    }, 4000);

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;

        if (error) {
          setSession(null);
          setUser(null);
          setProfile(null);
        } else {
          const s = data?.session || null;
          const u = s?.user || null;
          setSession(s);
          setUser(u);
          await loadProfile(u?.id);
        }
      } catch {
        if (!mounted) return;
        setSession(null);
        setUser(null);
        setProfile(null);
      } finally {
        if (!mounted) return;
        clearTimeout(watchdog);
        setLoading(false);
      }
    })();

    const { data } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!mounted) return;
      const u = s?.user || null;
      setSession(s || null);
      setUser(u);
      await loadProfile(u?.id);
    });

    return () => {
      mounted = false;
      clearTimeout(watchdog);
      try { data?.subscription?.unsubscribe(); } catch {}
    };
  }, []);

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      const s = data?.session || null;
      const u = s?.user || null;
      setSession(s);
      setUser(u);
      await loadProfile(u?.id);
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
  };

  const accessToken = useMemo(() => session?.access_token || '', [session]);
  const isAdmin = Boolean(profile?.is_admin);

  // FORCE_PROFILE_REFRESH_ON_USER_CHANGE
  useEffect(() => {
    const uid = user?.id || null;
    if (!uid) { setProfile(null); setProfileError(null); setProfileLoadedAt(new Date().toISOString()); return; }
    // fire and forget; loadProfile sets profile/profileError/profileLoadedAt
    loadProfile(uid);
  }, [user]);

  return (
    <AuthContext.Provider value={{ session, accessToken, user, loading, profile, isAdmin, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);














