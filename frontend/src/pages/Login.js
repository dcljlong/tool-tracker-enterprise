import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LogIn } from "lucide-react";
import toolTrackerLogo from "../assets/tool-tracker-logo.png";
import loginBackground from "../assets/login-background.jpg";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Enter email and password");
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      toast.success("Logged in");
      navigate("/", { replace: true });
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
        <div className="tt-login-heading">
          <p className="tt-login-kicker">A Long Line product</p>
          <h1 data-testid="login-title">Tool Tracker</h1>
          <p>Tool & Asset Control</p>
        </div>

        <form onSubmit={handleSubmit} className="tt-login-form">
          <button
            type="submit"
            className="tt-logo-submit"
            disabled={loading}
            aria-label="Sign in to Tool Tracker"
            title="Sign in to Tool Tracker"
          >
            <img src={toolTrackerLogo} alt="Tool Tracker logo" />
          </button>

          <div className="tt-login-title-block">
            <h2>Construction Tool Control</h2>
            <p>{loading ? "Authenticating..." : "Enter your credentials, then click Sign in."}</p>
          </div>

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
              placeholder="Enter password"
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
            {loading ? "Authenticating..." : <><LogIn size={16} className="mr-2" /> Sign in</>}
          </button>
        </form>

        <p className="tt-login-footnote">
          Built for construction tools, service records, handovers, and live asset visibility.
        </p>
      </main>
    </div>
  );
}
