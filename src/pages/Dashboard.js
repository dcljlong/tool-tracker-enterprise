import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user, loading, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login', { replace: true, state: { from: { pathname: '/' } } });
    }
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', padding: '24px' }}>
      <h1 style={{ marginTop: 0 }}>Dashboard</h1>

      <div style={{ color: '#6b7280', marginTop: 6 }}>
        Logged in as: <b>{user.email}</b> {isAdmin ? '(Admin)' : '(User)'}
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link
          to="/equipment"
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid #d1d5db',
            background: 'white',
            textDecoration: 'none',
            color: '#111827',
            fontWeight: 600
          }}
        >
          Go to Equipment
        </Link>

        <button
          onClick={signOut}
          style={{ padding: '10px 14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
        >
          Logout
        </button>
      </div>
    </div>
  );
}
