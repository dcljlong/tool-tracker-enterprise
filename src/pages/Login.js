import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Wrench, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabaseConfigOk } from '../lib/supabase';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, signIn, signUp } = useAuth();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (user) {
      const from = location.state?.from?.pathname || '/';
      navigate(from, { replace: true });
    }
  }, [user, navigate, location]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setError(null);
    setMessage(null);

    const res = isLogin
      ? await signIn(email, password)
      : await signUp(email, password);

    if (res?.error) setError(res.error.message);
    else if (!isLogin) setMessage('Account created! Check your email or sign in.');

    setFormLoading(false);
  };

  if (!supabaseConfigOk) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <h2>Missing .env credentials</h2>
        <p>Restart server after adding REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ maxWidth: '400px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', background: '#2563eb', borderRadius: '12px', marginBottom: '16px' }}>
            <Wrench size={32} color="white" />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Tool Tracker Enterprise</h1>
        </div>

        <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>
            {isLogin ? 'Sign In' : 'Create Account'}
          </h2>

          {error && (
            <div style={{ marginBottom: '16px', padding: '12px', background: '#fef2f2', color: '#b91c1c', borderRadius: '6px' }}>
              {error}
            </div>
          )}

          {message && (
            <div style={{ marginBottom: '16px', padding: '12px', background: '#f0fdf4', color: '#15803d', borderRadius: '6px' }}>
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>Email</label>
              <input
                type="email"
                name="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>Password</label>
              <input
                type="password"
                name="password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
            </div>

            <button
              type="submit"
              disabled={formLoading}
              style={{ width: '100%', padding: '10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '500' }}
            >
              {formLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : null}
              {isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => { setIsLogin(!isLogin); setError(null); setMessage(null); }}
              style={{ fontSize: '14px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
