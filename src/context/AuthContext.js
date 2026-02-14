import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  const loadProfile = async (uid) => {
    if (!uid) { setProfile(null); return; }
    const { data, error } = await supabase
      .from('profiles')
      .select('id,is_admin,created_at')
      .eq('id', uid)
      .single();

    if (!error) setProfile(data);
    else setProfile(null);
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const u = data.session?.user || null;
      setUser(u);
      await loadProfile(u?.id);
      setLoading(false);
    });

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange(async (_event, session) => {
        if (!mounted) return;
        const u = session?.user || null;
        setUser(u);
        await loadProfile(u?.id);
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email, password) => {
    const { data, error } =
      await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      setUser(data.user);
      await loadProfile(data.user?.id);
    }
    return { error };
  };

  const signUp = async (email, password) => {
    return await supabase.auth.signUp({ email, password });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  const isAdmin = Boolean(profile?.is_admin);

  return (
    <AuthContext.Provider value={{ user, loading, profile, isAdmin, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
