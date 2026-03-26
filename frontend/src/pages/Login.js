import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { LogIn, Sun, Moon } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <Button variant="ghost" size="sm" onClick={toggleTheme} className="rounded-none" data-testid="login-theme-toggle">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </Button>
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-['Barlow_Condensed'] text-4xl md:text-5xl font-black uppercase tracking-tight text-[hsl(38,92%,50%)]" data-testid="login-title">
            Tool Tracker
          </h1>
          <p className="text-muted-foreground mt-2 uppercase tracking-wider text-sm">NZ Construction Equipment Management</p>
        </div>
        <Card className="border-border rounded-sm shadow-none">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-xs uppercase tracking-wider font-bold">Email</Label>
                <Input data-testid="login-email" type="email" className="rounded-none border-2 mt-1" placeholder="you@company.co.nz"
                  value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider font-bold">Password</Label>
                <Input data-testid="login-password" type="password" className="rounded-none border-2 mt-1"
                  value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase font-bold tracking-wider h-12" data-testid="login-submit-btn">
                {loading ? "Signing in..." : <><LogIn size={16} className="mr-2" /> Sign In</>}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
