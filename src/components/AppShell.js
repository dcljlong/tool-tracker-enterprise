import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Wrench, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NavItem = ({ to, icon: Icon, label }) => {
  const { pathname } = useLocation();
  const active = pathname === to;
  return (
    <Link
      to={to}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 10,
        textDecoration: 'none',
        color: active ? '#111827' : '#374151',
        background: active ? '#eef2ff' : 'transparent',
        fontWeight: active ? 700 : 600
      }}
    >
      <Icon size={18} />
      <span>{label}</span>
    </Link>
  );
};

export default function AppShell({ title, children }) {
  const { user, isAdmin, signOut } = useAuth();

  return (
    <div style={{ minHeight: '100vh', background: '#f6f7fb' }}>
      {/* Top bar */}
      <div style={{ height: 56, background: 'white', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800 }}>
            TT
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <div style={{ fontWeight: 800, color: '#111827' }}>Tool Tracker Enterprise</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{title}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 13, color: '#374151' }}>
            {user?.email} {isAdmin ? '(Admin)' : '(User)'}
          </div>
          <button
            onClick={signOut}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontWeight: 700 }}
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr' }}>
        {/* Left nav */}
        <div style={{ padding: 14 }}>
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: 10 }}>
            <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />
            <NavItem to="/equipment" icon={Wrench} label="Equipment" />
          </div>
        </div>

        {/* Main */}
        <div style={{ padding: 14 }}>
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: 16 }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
