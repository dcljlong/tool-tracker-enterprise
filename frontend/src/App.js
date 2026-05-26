import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { toast } from "sonner";
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

function ForcePasswordChange() {
  const { logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSignOut = () => {
    logout();
    window.location.href = "/login";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    if (!currentPassword) {
      setErrorMessage("Enter your temporary or current password.");
      return;
    }

    if ((newPassword || "").length < 6) {
      setErrorMessage("New password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("New password and confirmation do not match.");
      return;
    }

    setSaving(true);

    try {
      await api.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });

      const profile = await api.get("/auth/me");
      localStorage.setItem("user", JSON.stringify(profile.data));
      toast.success("Password updated");
      window.location.href = "/";
    } catch (error) {
      setErrorMessage(error?.response?.data?.detail || "Password update failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#050916,#07111f_48%,#020617)] px-4 py-8 text-slate-100">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg items-center justify-center">
        <section className="w-full rounded-2xl border border-[rgba(245,190,80,0.30)] bg-slate-950/92 p-6 shadow-2xl" data-testid="force-password-change-page">
          <div className="mb-5">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[hsl(38,92%,58%)]">
              Tool Tracker Security
            </p>
            <h1 className="mt-2 font-['Barlow_Condensed'] text-3xl font-black uppercase tracking-wide text-white">
              Change Required
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              Your account was created or reset with a temporary password. Set your own password before continuing.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <Label className="text-xs font-black uppercase tracking-wider text-slate-200">
                Current / Temporary Password
              </Label>
              <Input
                data-testid="force-password-current"
                type="password"
                autoComplete="current-password"
                className="mt-1 rounded-xl border border-white/20 bg-slate-900 text-slate-50"
                value={currentPassword}
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                  setErrorMessage("");
                }}
              />
            </div>

            <div>
              <Label className="text-xs font-black uppercase tracking-wider text-slate-200">
                New Password
              </Label>
              <Input
                data-testid="force-password-new"
                type="password"
                autoComplete="new-password"
                className="mt-1 rounded-xl border border-white/20 bg-slate-900 text-slate-50"
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  setErrorMessage("");
                }}
              />
            </div>

            <div>
              <Label className="text-xs font-black uppercase tracking-wider text-slate-200">
                Confirm New Password
              </Label>
              <Input
                data-testid="force-password-confirm"
                type="password"
                autoComplete="new-password"
                className="mt-1 rounded-xl border border-white/20 bg-slate-900 text-slate-50"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setErrorMessage("");
                }}
              />
            </div>

            {errorMessage && (
              <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-200" data-testid="force-password-error">
                {errorMessage}
              </p>
            )}

            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={handleSignOut}
                className="h-10 rounded-xl border border-white/20 bg-transparent text-xs font-bold uppercase tracking-wider text-slate-100 hover:bg-white/5"
                data-testid="force-password-sign-out"
              >
                Sign Out
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="h-10 rounded-xl bg-[hsl(38,92%,50%)] px-4 text-xs font-black uppercase tracking-wider text-black hover:bg-[hsl(38,92%,45%)]"
                data-testid="force-password-submit"
              >
                {saving ? "Saving..." : "Save Password"}
              </Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user?.force_password_change) return <ForcePasswordChange />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const [isFirstRun, setIsFirstRun] = useState(null);

  useEffect(() => {
    api
      .get("/setup/check")
      .then((res) => setIsFirstRun(Boolean(res.data.is_first_run)))
      .catch(() => setIsFirstRun(false));
  }, []);

  if (isFirstRun === null || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground font-['Barlow_Condensed'] text-2xl uppercase tracking-wider">
          Loading System...
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/setup"
        element={
          isFirstRun ? (
            <SetupWizard onComplete={() => setIsFirstRun(false)} />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />

      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : isFirstRun ? <Navigate to="/setup" replace /> : <Login />}
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
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

      <Route path="*" element={<Navigate to={isFirstRun ? "/setup" : user ? "/" : "/login"} replace />} />
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
