import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LogIn } from "lucide-react";
import toolTrackerLogo from "../assets/tool-tracker-logo.png";
import loginBackground from "../assets/login-background.jpg";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { toast.error("Enter email and password"); return; }
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Logged in");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tt-login-shell">
      <div
        className="tt-login-background"
        style={{ backgroundImage: `url(${loginBackground})` }}
        aria-hidden="true"
      />
      <div className="tt-login-overlay" aria-hidden="true" />

      <main className="tt-login-card" aria-label="Tool Tracker login">
        <div className="tt-login-brand">
          <button
            type="button"
            className="tt-login-logo"
            tabIndex={-1}
            aria-hidden="true"
          >
            <img src={toolTrackerLogo} alt="Tool Tracker logo" />
          </button>

          <p className="tt-login-kicker">A Long Line product</p>
          <h1 data-testid="login-title">Tool Tracker</h1>
          <p>Tool & Asset Control</p>
        </div>

        <form onSubmit={handleSubmit} className="tt-login-form">
          <div>
            <Label className="tt-login-label">Email</Label>
            <Input
              data-testid="login-email"
              type="email"
              className="tt-login-input"
              placeholder="you@company.co.nz"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          <div>
            <Label className="tt-login-label">Password</Label>
            <Input
              data-testid="login-password"
              type="password"
              className="tt-login-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="tt-login-submit"
            data-testid="login-submit-btn"
          >
            {loading ? "Signing in..." : <><LogIn size={16} className="mr-2" /> Sign in</>}
          </button>
        </form>

        <p className="tt-login-footnote">
          Built for construction tools, service records, handovers, and live asset visibility.
        </p>
      </main>
    </div>
  );
}
