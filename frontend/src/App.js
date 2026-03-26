import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { Toaster } from "@/components/ui/sonner";
import { useState, useEffect } from "react";
import api from "@/lib/api";
import Layout from "@/components/Layout";
import SetupWizard from "@/pages/SetupWizard";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import ToolCatalog from "@/pages/ToolCatalog";
import ToolDetail from "@/pages/ToolDetail";
import UserManagement from "@/pages/UserManagement";
import Settings from "@/pages/Settings";
import Notifications from "@/pages/Notifications";
import Reports from "@/pages/Reports";
import Categories from "@/pages/Categories";
import CalendarPage from "@/pages/CalendarPage";
import QRScannerPage from "@/pages/QRScannerPage";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;
  if (!user) return <Navigate to="/login" />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const [isFirstRun, setIsFirstRun] = useState(null);

  useEffect(() => {
    api.get('/setup/check').then(res => setIsFirstRun(res.data.is_first_run)).catch(() => setIsFirstRun(false));
  }, []);

  if (isFirstRun === null || loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground font-['Barlow_Condensed'] text-2xl uppercase tracking-wider">Loading System...</div></div>;
  }

  return (
    <Routes>
      <Route path="/setup" element={isFirstRun && !user ? <SetupWizard onComplete={() => setIsFirstRun(false)} /> : <Navigate to="/" />} />
      <Route path="/login" element={user ? <Navigate to="/" /> : (isFirstRun ? <Navigate to="/setup" /> : <Login />)} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="tools" element={<ToolCatalog />} />
        <Route path="tools/:toolId" element={<ToolDetail />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="reports" element={<Reports />} />
        <Route path="categories" element={<Categories />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="scan" element={<QRScannerPage />} />
        <Route path="settings" element={<Settings />} />
        <Route path="notifications" element={<Notifications />} />
      </Route>
      <Route path="*" element={<Navigate to={isFirstRun ? "/setup" : (user ? "/" : "/login")} />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster position="top-right" />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
