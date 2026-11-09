import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from './api';
import { useSupabase } from './siteConfig';
import { supabase, clearContext } from './supabaseApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (useSupabase) {
      supabase.auth.getSession().then(({ data }) => {
        if (!data.session) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
          setLoading(false);
          return;
        }
        api.get('/auth/me').then(res => {
          setUser(res.data);
          localStorage.setItem('user', JSON.stringify(res.data));
        }).catch(() => setUser(null)).finally(() => setLoading(false));
      });
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          clearContext();
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        }
      });
      return () => sub.subscription.unsubscribe();
    }
    const token = localStorage.getItem('token');
    if (token) {
      api.get('/auth/me').then(res => {
        setUser(res.data);
        localStorage.setItem('user', JSON.stringify(res.data));
      }).catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data;
  }, []);

  const setupAdmin = useCallback(async (data) => {
    const res = await api.post('/auth/setup', data);
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data;
  }, []);

  const logout = useCallback(() => {
    if (useSupabase) {
      clearContext();
      supabase.auth.signOut();
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, setupAdmin, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
