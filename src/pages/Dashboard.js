import React from 'react';
import AppShell from '../components/AppShell';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { isAdmin } = useAuth();

  return (
    <AppShell title="Dashboard">
      <div style={{ display: 'grid', gap: 12 }}>
        <h1 style={{ margin: 0 }}>Dashboard</h1>

        <div style={{ color: '#6b7280' }}>
          {isAdmin
            ? 'Admin: you can add/edit tools and manage system settings.'
            : 'User: read-only tools, checkout/return workflows.'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 8 }}>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Expired Tags</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>—</div>
          </div>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Overdue Returns</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>—</div>
          </div>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Tools In Use</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>—</div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
