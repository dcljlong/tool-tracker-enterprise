import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Equipment from './pages/Equipment';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          {/* Dev tolerance: if you land on the GH Pages base path locally, redirect */}
          <Route path="/tool-tracker-enterprise" element={<Navigate to="/" replace />} />
          <Route path="/tool-tracker-enterprise/" element={<Navigate to="/" replace />} />

          {/* Primary routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/equipment" element={<RequireAuth><Equipment /></RequireAuth>} />

          {/* GH Pages-style prefixed routes */}
          <Route path="/tool-tracker-enterprise/login" element={<Login />} />
          <Route path="/tool-tracker-enterprise/equipment" element={<RequireAuth><Equipment /></RequireAuth>} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
