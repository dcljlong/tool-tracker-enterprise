import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import api from "@/lib/api";
import { Check, ChevronRight, ChevronLeft, Shield, Mail, Bell, UserPlus, AlertCircle } from "lucide-react";

const steps = [
  { id: 1, label: "Admin Account", icon: Shield },
  { id: 2, label: "Email Setup", icon: Mail },
  { id: 3, label: "Notifications", icon: Bell },
  { id: 4, label: "Add Users", icon: UserPlus },
];

export default function SetupWizard({ onComplete }) {
  const { setupAdmin } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [adminData, setAdminData] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [emailData, setEmailData] = useState({ provider: "sendgrid", api_key: "", sender_email: "" });
  const [notifData, setNotifData] = useState({ tag_expiry: true, overdue: true, handover: true, days_before: 14 });
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "worker" });
  const [errors, setErrors] = useState({});

  const validateStep1 = () => {
    const e = {};
    if (!adminData.name.trim()) e.name = "Name required";
    if (!adminData.email.trim()) e.email = "Email required";
    if (!/\S+@\S+\.\S+/.test(adminData.email)) e.email = "Invalid email";
    if (adminData.password.length < 6) e.password = "Min 6 characters";
    if (adminData.password !== adminData.confirmPassword) e.confirmPassword = "Passwords don't match";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleStep1 = async () => {
    if (!validateStep1()) return;
    setLoading(true);
    try {
      await setupAdmin({ name: adminData.name, email: adminData.email, password: adminData.password, role: "admin" });
      toast.success("Admin account created");
      setStep(2);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Setup failed");
    } finally {
      setLoading(false);
    }
  };

  const handleStep2 = async () => {
    if (emailData.api_key && !emailData.sender_email) {
      setErrors({ sender_email: "Sender email required when API key is set" });
      return;
    }
    if (emailData.api_key) {
      try {
        await api.put('/settings', {
          email_provider: emailData.provider,
          email_api_key: emailData.api_key,
          sender_email: emailData.sender_email,
        });
        toast.success("Email configured");
      } catch (err) {
        toast.error("Failed to save email settings");
      }
    }
    setStep(3);
  };

  const handleStep3 = async () => {
    try {
      await api.put('/settings', {
        notify_tag_expiry: notifData.tag_expiry,
        notify_overdue: notifData.overdue,
        notify_handover: notifData.handover,
        notify_days_before: notifData.days_before,
      });
      toast.success("Notification preferences saved");
      setStep(4);
    } catch (err) {
      toast.error("Failed to save preferences");
    }
  };

  const addUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast.error("Fill all user fields");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/users', newUser);
      setUsers([...users, res.data]);
      setNewUser({ name: "", email: "", password: "", role: "worker" });
      toast.success("User added");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add user");
    } finally {
      setLoading(false);
    }
  };

  const finishSetup = () => {
    toast.success("Setup complete!");
    onComplete();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="font-['Barlow_Condensed'] text-4xl md:text-5xl font-black uppercase tracking-tight text-[hsl(38,92%,50%)]" data-testid="setup-title">
            Tool Tracker
          </h1>
          <p className="text-muted-foreground mt-2 uppercase tracking-wider text-sm">Initial Setup</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center mb-8 gap-1">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div className={`flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-wider font-bold ${
                step === s.id ? "text-[hsl(38,92%,50%)] bg-[hsl(38,92%,50%)]/10 border border-[hsl(38,92%,50%)]/20" :
                step > s.id ? "text-emerald-500 bg-emerald-500/10 border border-emerald-500/20" :
                "text-muted-foreground bg-muted border border-border"
              }`}>
                {step > s.id ? <Check size={14} /> : <s.icon size={14} />}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < steps.length - 1 && <ChevronRight size={14} className="text-muted-foreground mx-1" />}
            </div>
          ))}
        </div>

        {/* Step 1: Admin Account */}
        {step === 1 && (
          <Card className="border-border rounded-sm shadow-none" data-testid="setup-step-1">
            <CardHeader className="pb-4">
              <CardTitle className="font-['Barlow_Condensed'] text-2xl uppercase tracking-tight">Create Admin Account</CardTitle>
              <p className="text-sm text-muted-foreground">This will be the primary administrator account.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs uppercase tracking-wider font-bold">Full Name</Label>
                <Input data-testid="setup-admin-name" className="rounded-none border-2 mt-1" placeholder="John Smith"
                  value={adminData.name} onChange={e => setAdminData({...adminData, name: e.target.value})} />
                {errors.name && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle size={12} />{errors.name}</p>}
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider font-bold">Email</Label>
                <Input data-testid="setup-admin-email" type="email" className="rounded-none border-2 mt-1" placeholder="admin@company.co.nz"
                  value={adminData.email} onChange={e => setAdminData({...adminData, email: e.target.value})} />
                {errors.email && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle size={12} />{errors.email}</p>}
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider font-bold">Password</Label>
                <Input data-testid="setup-admin-password" type="password" className="rounded-none border-2 mt-1" placeholder="Min 6 characters"
                  value={adminData.password} onChange={e => setAdminData({...adminData, password: e.target.value})} />
                {errors.password && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle size={12} />{errors.password}</p>}
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider font-bold">Confirm Password</Label>
                <Input data-testid="setup-admin-confirm" type="password" className="rounded-none border-2 mt-1"
                  value={adminData.confirmPassword} onChange={e => setAdminData({...adminData, confirmPassword: e.target.value})} />
                {errors.confirmPassword && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle size={12} />{errors.confirmPassword}</p>}
              </div>
              <Button onClick={handleStep1} disabled={loading} className="w-full bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase font-bold tracking-wider h-12" data-testid="setup-step1-next">
                {loading ? "Creating..." : "Create Admin Account"}
                <ChevronRight size={16} className="ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Email Setup */}
        {step === 2 && (
          <Card className="border-border rounded-sm shadow-none" data-testid="setup-step-2">
            <CardHeader className="pb-4">
              <CardTitle className="font-['Barlow_Condensed'] text-2xl uppercase tracking-tight">Email Configuration</CardTitle>
              <p className="text-sm text-muted-foreground">Configure email to enable notifications. You can skip this and set up later.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs uppercase tracking-wider font-bold">Email Provider</Label>
                <Select value={emailData.provider} onValueChange={v => setEmailData({...emailData, provider: v})}>
                  <SelectTrigger className="rounded-none border-2 mt-1" data-testid="setup-email-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sendgrid">SendGrid</SelectItem>
                    <SelectItem value="other">Other SMTP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider font-bold">API Key</Label>
                <Input data-testid="setup-email-apikey" type="password" className="rounded-none border-2 mt-1" placeholder="SG.xxxxx..."
                  value={emailData.api_key} onChange={e => setEmailData({...emailData, api_key: e.target.value})} />
                <p className="text-xs text-muted-foreground mt-1">Get your key from SendGrid Dashboard &rarr; Settings &rarr; API Keys</p>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider font-bold">Sender Email</Label>
                <Input data-testid="setup-email-sender" type="email" className="rounded-none border-2 mt-1" placeholder="notifications@yourcompany.co.nz"
                  value={emailData.sender_email} onChange={e => setEmailData({...emailData, sender_email: e.target.value})} />
                {errors.sender_email && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle size={12} />{errors.sender_email}</p>}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1 rounded-none uppercase font-bold tracking-wider h-12 border-2">
                  <ChevronLeft size={16} className="mr-2" /> Back
                </Button>
                <Button onClick={handleStep2} className="flex-1 bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase font-bold tracking-wider h-12" data-testid="setup-step2-next">
                  {emailData.api_key ? "Save & Continue" : "Skip for Now"}
                  <ChevronRight size={16} className="ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Notification Preferences */}
        {step === 3 && (
          <Card className="border-border rounded-sm shadow-none" data-testid="setup-step-3">
            <CardHeader className="pb-4">
              <CardTitle className="font-['Barlow_Condensed'] text-2xl uppercase tracking-tight">Notification Preferences</CardTitle>
              <p className="text-sm text-muted-foreground">Set default alert preferences for your team.</p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between py-3 border-b border-border">
                <div>
                  <p className="text-sm font-medium">Expiring Safety Tags</p>
                  <p className="text-xs text-muted-foreground">Alert when tags are near expiry</p>
                </div>
                <Switch checked={notifData.tag_expiry} onCheckedChange={v => setNotifData({...notifData, tag_expiry: v})} data-testid="setup-notif-tags" />
              </div>
              <div className="flex items-center justify-between py-3 border-b border-border">
                <div>
                  <p className="text-sm font-medium">Overdue Equipment</p>
                  <p className="text-xs text-muted-foreground">Alert when tools are past return date</p>
                </div>
                <Switch checked={notifData.overdue} onCheckedChange={v => setNotifData({...notifData, overdue: v})} data-testid="setup-notif-overdue" />
              </div>
              <div className="flex items-center justify-between py-3 border-b border-border">
                <div>
                  <p className="text-sm font-medium">Pending Handovers</p>
                  <p className="text-xs text-muted-foreground">Alert on tool transfer requests</p>
                </div>
                <Switch checked={notifData.handover} onCheckedChange={v => setNotifData({...notifData, handover: v})} data-testid="setup-notif-handover" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider font-bold">Advance Warning (Days)</Label>
                <Input data-testid="setup-notif-days" type="number" className="rounded-none border-2 mt-1 w-32" min={1} max={60}
                  value={notifData.days_before} onChange={e => setNotifData({...notifData, days_before: parseInt(e.target.value) || 14})} />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)} className="flex-1 rounded-none uppercase font-bold tracking-wider h-12 border-2">
                  <ChevronLeft size={16} className="mr-2" /> Back
                </Button>
                <Button onClick={handleStep3} className="flex-1 bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase font-bold tracking-wider h-12" data-testid="setup-step3-next">
                  Save & Continue <ChevronRight size={16} className="ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Add Users */}
        {step === 4 && (
          <Card className="border-border rounded-sm shadow-none" data-testid="setup-step-4">
            <CardHeader className="pb-4">
              <CardTitle className="font-['Barlow_Condensed'] text-2xl uppercase tracking-tight">Add Team Members</CardTitle>
              <p className="text-sm text-muted-foreground">Add users now or later from the Users panel. You can always manage users after setup.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider font-bold">Name</Label>
                  <Input data-testid="setup-user-name" className="rounded-none border-2 mt-1" placeholder="Worker name"
                    value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider font-bold">Email</Label>
                  <Input data-testid="setup-user-email" type="email" className="rounded-none border-2 mt-1" placeholder="worker@company.co.nz"
                    value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider font-bold">Password</Label>
                  <Input data-testid="setup-user-password" type="password" className="rounded-none border-2 mt-1"
                    value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider font-bold">Role</Label>
                  <Select value={newUser.role} onValueChange={v => setNewUser({...newUser, role: v})}>
                    <SelectTrigger className="rounded-none border-2 mt-1" data-testid="setup-user-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="worker">Worker / User</SelectItem>
                      <SelectItem value="site_manager">Site Manager</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button variant="outline" onClick={addUser} disabled={loading} className="w-full rounded-none uppercase font-bold tracking-wider h-10 border-2" data-testid="setup-add-user-btn">
                <UserPlus size={16} className="mr-2" /> Add User
              </Button>
              {users.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Added Users</p>
                  {users.map(u => (
                    <div key={u.id} className="flex items-center justify-between p-3 border border-border bg-muted/50">
                      <span className="text-sm font-medium">{u.name}</span>
                      <span className="text-xs text-muted-foreground uppercase">{u.role}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep(3)} className="flex-1 rounded-none uppercase font-bold tracking-wider h-12 border-2">
                  <ChevronLeft size={16} className="mr-2" /> Back
                </Button>
                <Button onClick={finishSetup} className="flex-1 bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase font-bold tracking-wider h-12" data-testid="setup-finish-btn">
                  Finish Setup <Check size={16} className="ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
