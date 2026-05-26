import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
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
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

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

  const handleForgotSubmit = async (e) => {
    e.preventDefault();

    if (!forgotEmail) {
      toast.error("Enter your email address");
      return;
    }

    setForgotLoading(true);

    try {
      await api.post("/auth/forgot-password", { email: forgotEmail });
      toast.success("If that email is configured, a reset link has been sent.");
      setForgotMode(false);
      setForgotEmail("");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Reset request failed");
    } finally {
      setForgotLoading(false);
    }
  };

  const toggleForgotMode = () => {
    setForgotMode((current) => !current);
    setPassword("");
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

        <form onSubmit={forgotMode ? handleForgotSubmit : handleSubmit} className="tt-login-form">
          <button
            type="submit"
            className="tt-logo-submit"
            disabled={forgotMode ? forgotLoading : loading}
            aria-label={forgotMode ? "Send Tool Tracker password reset link" : "Sign in to Tool Tracker"}
            title={forgotMode ? "Send password reset link" : "Sign in to Tool Tracker"}
          >
            <img src={toolTrackerLogo} alt="Tool Tracker logo" />
          </button>

          <div className="tt-login-title-block">
            <h2>{forgotMode ? "Reset Password" : "Construction Tool Control"}</h2>
            <p>
              {forgotMode
                ? (forgotLoading ? "Sending reset link..." : "Enter your email and we will send a reset link if email is configured.")
                : (loading ? "Authenticating..." : "Enter your credentials, then click Sign in.")}
            </p>
          </div>

          <div>
            <Label className="tt-login-label">Email</Label>
            <Input
              data-testid={forgotMode ? "forgot-password-email" : "login-email"}
              type="email"
              className="tt-login-input"
              placeholder="you@company.co.nz"
              value={forgotMode ? forgotEmail : email}
              onChange={e => (forgotMode ? setForgotEmail(e.target.value) : setEmail(e.target.value))}
            />
          </div>

          {!forgotMode && (
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
          )}

          <button
            type="submit"
            disabled={forgotMode ? forgotLoading : loading}
            className="tt-login-submit"
            data-testid={forgotMode ? "forgot-password-submit" : "login-submit-btn"}
          >
            {forgotMode
              ? (forgotLoading ? "Sending..." : "Send Reset Link")
              : (loading ? "Authenticating..." : <><LogIn size={16} className="mr-2" /> Sign in</>)}
          </button>

          <button
            type="button"
            className="tt-login-footnote"
            onClick={toggleForgotMode}
            data-testid="forgot-password-link"
          >
            {forgotMode ? "Back to sign in" : "Forgot password?"}
          </button>
        </form>

        <p className="tt-login-footnote">
          Built for construction tools, service records, handovers, and live asset visibility.
        </p>
      </main>
    </div>
  );
}
