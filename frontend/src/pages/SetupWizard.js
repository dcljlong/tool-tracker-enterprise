import { useMemo, useState } from "react";
import {
  AlertCircle,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Mail,
  Shield,
  UserPlus,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const STEPS = [
  {
    id: 1,
    label: "Admin",
    title: "Admin Account",
    description: "Create the first administrator account.",
    icon: Shield,
  },
  {
    id: 2,
    label: "Company",
    title: "Company & Email",
    description: "Set company identity and optional email alerts.",
    icon: Mail,
  },
  {
    id: 3,
    label: "Alerts",
    title: "Notification Rules",
    description: "Choose default tool control alerts.",
    icon: Bell,
  },
  {
    id: 4,
    label: "Users",
    title: "Team Members",
    description: "Add site managers or workers now, or later.",
    icon: UserPlus,
  },
];

const ROLE_OPTIONS = [
  { value: "worker", label: "Worker / User" },
  { value: "site_manager", label: "Site Manager" },
  { value: "admin", label: "Admin" },
];

function isValidEmail(value) {
  return /\S+@\S+\.\S+/.test(String(value || "").trim());
}

function normaliseEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function errorMessage(error, fallback) {
  return error?.response?.data?.detail || fallback;
}

function FieldError({ message }) {
  if (!message) return null;

  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
      <AlertCircle size={12} />
      {message}
    </p>
  );
}

function StepProgress({ currentStep }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4" data-testid="setup-progress">
      {STEPS.map((item) => {
        const Icon = item.icon;
        const isActive = currentStep === item.id;
        const isComplete = currentStep > item.id;

        return (
          <div
            key={item.id}
            className={[
              "border p-3 transition-colors",
              isActive
                ? "border-[hsl(38,92%,50%)] bg-[hsl(38,92%,50%)]/10 text-[hsl(38,92%,50%)]"
                : isComplete
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                  : "border-border bg-card text-muted-foreground",
            ].join(" ")}
          >
            <div className="flex items-center gap-2">
              {isComplete ? <Check size={16} /> : <Icon size={16} />}
              <span className="text-xs font-black uppercase tracking-wider">{item.label}</span>
            </div>
            <p className="mt-1 hidden text-[11px] text-muted-foreground md:block">{item.description}</p>
          </div>
        );
      })}
    </div>
  );
}

function SetupShell({ step, children }) {
  const current = STEPS.find((item) => item.id === step) || STEPS[0];

  return (
    <div className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="grid gap-4 border-b border-border pb-6 lg:grid-cols-[1fr_320px] lg:items-end">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center border-2 border-[hsl(38,92%,50%)] bg-[hsl(38,92%,50%)] text-sm font-black text-black">
                TT
              </div>
              <div>
                <h1
                  className="font-['Barlow_Condensed'] text-4xl font-black uppercase tracking-widest text-[hsl(38,92%,50%)] md:text-5xl"
                  data-testid="setup-title"
                >
                  Tool Tracker
                </h1>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-muted-foreground">
                  Initial System Setup
                </p>
              </div>
            </div>

            <Badge className="rounded-full border border-[hsl(38,92%,50%)]/20 bg-[hsl(38,92%,50%)]/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-[hsl(38,92%,50%)]">
              Step {current.id} of {STEPS.length}
            </Badge>

            <h2 className="mt-3 font-['Barlow_Condensed'] text-3xl font-black uppercase tracking-tight">
              {current.title}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{current.description}</p>
          </div>

          <Card className="rounded-sm border-border shadow-none">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Wrench size={18} className="mt-0.5 shrink-0 text-[hsl(38,92%,50%)]" />
                <div>
                  <p className="text-sm font-bold">NZ construction tool control</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Configure the minimum required system settings first. Deeper category, report, and user rules can still be managed later.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </header>

        <StepProgress currentStep={step} />

        {children}
      </div>
    </div>
  );
}

export default function SetupWizard({ onComplete }) {
  const { setupAdmin } = useAuth();

  const [step, setStep] = useState(1);
  const [busyAction, setBusyAction] = useState("");
  const [errors, setErrors] = useState({});

  const [adminData, setAdminData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [companyData, setCompanyData] = useState({
    company_name: "",
    email_provider: "sendgrid",
    email_api_key: "",
    sender_email: "",
  });

  const [notificationData, setNotificationData] = useState({
    notify_tag_expiry: true,
    notify_overdue: true,
    notify_handover: true,
    notify_days_before: 14,
  });

  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "worker",
  });

  const loading = Boolean(busyAction);

  const canFinish = useMemo(() => step === 4, [step]);

  const updateAdmin = (field, value) => {
    setAdminData((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const updateCompany = (field, value) => {
    setCompanyData((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const updateNotification = (field, value) => {
    setNotificationData((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const updateNewUser = (field, value) => {
    setNewUser((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [`user_${field}`]: "" }));
  };

  const validateAdmin = () => {
    const nextErrors = {};

    if (!adminData.name.trim()) nextErrors.name = "Full name is required.";
    if (!adminData.email.trim()) nextErrors.email = "Email is required.";
    else if (!isValidEmail(adminData.email)) nextErrors.email = "Enter a valid email address.";
    if (adminData.password.length < 6) nextErrors.password = "Password must be at least 6 characters.";
    if (adminData.password !== adminData.confirmPassword) nextErrors.confirmPassword = "Passwords do not match.";

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateCompany = () => {
    const nextErrors = {};

    if (companyData.sender_email && !isValidEmail(companyData.sender_email)) {
      nextErrors.sender_email = "Enter a valid sender email.";
    }

    if (companyData.email_api_key.trim() && !companyData.sender_email.trim()) {
      nextErrors.sender_email = "Sender email is required when an API key is entered.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateNewUser = () => {
    const nextErrors = {};

    if (!newUser.name.trim()) nextErrors.user_name = "Name is required.";
    if (!newUser.email.trim()) nextErrors.user_email = "Email is required.";
    else if (!isValidEmail(newUser.email)) nextErrors.user_email = "Enter a valid email address.";
    if (newUser.password.length < 6) nextErrors.user_password = "Password must be at least 6 characters.";

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleCreateAdmin = async () => {
    if (!validateAdmin()) return;

    setBusyAction("admin");

    try {
      await setupAdmin({
        name: adminData.name.trim(),
        email: normaliseEmail(adminData.email),
        password: adminData.password,
        role: "admin",
      });

      toast.success("Admin account created");
      setStep(2);
    } catch (error) {
      toast.error(errorMessage(error, "Admin setup failed."));
    } finally {
      setBusyAction("");
    }
  };

  const handleCompanyEmail = async () => {
    if (!validateCompany()) return;

    setBusyAction("company");

    try {
      const payload = {
        company_name: companyData.company_name.trim(),
        email_provider: companyData.email_provider,
      };

      if (companyData.email_api_key.trim()) {
        payload.email_api_key = companyData.email_api_key.trim();
        payload.sender_email = normaliseEmail(companyData.sender_email);
      }

      await api.put("/settings", payload);
      toast.success(companyData.email_api_key.trim() ? "Company and email settings saved" : "Company settings saved");
      setStep(3);
    } catch (error) {
      toast.error(errorMessage(error, "Failed to save company settings."));
    } finally {
      setBusyAction("");
    }
  };

  const handleNotifications = async () => {
    setBusyAction("notifications");

    try {
      await api.put("/settings", {
        notify_tag_expiry: Boolean(notificationData.notify_tag_expiry),
        notify_overdue: Boolean(notificationData.notify_overdue),
        notify_handover: Boolean(notificationData.notify_handover),
        notify_days_before: Math.max(1, Math.min(60, Number(notificationData.notify_days_before || 14))),
      });

      toast.success("Notification rules saved");
      setStep(4);
    } catch (error) {
      toast.error(errorMessage(error, "Failed to save notification settings."));
    } finally {
      setBusyAction("");
    }
  };

  const handleAddUser = async () => {
    if (!validateNewUser()) return;

    setBusyAction("user");

    try {
      const response = await api.post("/users", {
        name: newUser.name.trim(),
        email: normaliseEmail(newUser.email),
        password: newUser.password,
        role: newUser.role,
      });

      setUsers((current) => [...current, response.data]);
      setNewUser({ name: "", email: "", password: "", role: "worker" });
      toast.success("User added");
    } catch (error) {
      toast.error(errorMessage(error, "Failed to add user."));
    } finally {
      setBusyAction("");
    }
  };

  const finishSetup = () => {
    if (!canFinish) return;
    toast.success("Setup complete");
    if (onComplete) onComplete();
  };

  return (
    <SetupShell step={step}>
      {step === 1 && (
        <Card className="rounded-sm border-border shadow-none" data-testid="setup-step-1">
          <CardHeader className="pb-4">
            <CardTitle className="font-['Barlow_Condensed'] text-2xl uppercase tracking-tight">
              Create Admin Account
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              This account controls users, settings, reports, categories, and tool management permissions.
            </p>
          </CardHeader>

          <CardContent className="grid gap-4">
            <div>
              <Label className="text-xs font-black uppercase tracking-wider">Full Name</Label>
              <Input
                data-testid="setup-admin-name"
                className="mt-1 rounded-none border-2"
                placeholder="David Long"
                value={adminData.name}
                onChange={(event) => updateAdmin("name", event.target.value)}
              />
              <FieldError message={errors.name} />
            </div>

            <div>
              <Label className="text-xs font-black uppercase tracking-wider">Email</Label>
              <Input
                data-testid="setup-admin-email"
                type="email"
                className="mt-1 rounded-none border-2"
                placeholder="admin@company.co.nz"
                value={adminData.email}
                onChange={(event) => updateAdmin("email", event.target.value)}
              />
              <FieldError message={errors.email} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="text-xs font-black uppercase tracking-wider">Password</Label>
                <Input
                  data-testid="setup-admin-password"
                  type="password"
                  className="mt-1 rounded-none border-2"
                  placeholder="Minimum 6 characters"
                  value={adminData.password}
                  onChange={(event) => updateAdmin("password", event.target.value)}
                />
                <FieldError message={errors.password} />
              </div>

              <div>
                <Label className="text-xs font-black uppercase tracking-wider">Confirm Password</Label>
                <Input
                  data-testid="setup-admin-confirm"
                  type="password"
                  className="mt-1 rounded-none border-2"
                  value={adminData.confirmPassword}
                  onChange={(event) => updateAdmin("confirmPassword", event.target.value)}
                />
                <FieldError message={errors.confirmPassword} />
              </div>
            </div>

            <Button
              onClick={handleCreateAdmin}
              disabled={loading}
              className="h-12 rounded-none bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] text-xs font-black uppercase tracking-wider"
              data-testid="setup-step1-next"
            >
              {busyAction === "admin" ? "Creating Admin..." : "Create Admin Account"}
              <ChevronRight size={16} className="ml-2" />
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card className="rounded-sm border-border shadow-none" data-testid="setup-step-2">
          <CardHeader className="pb-4">
            <CardTitle className="font-['Barlow_Condensed'] text-2xl uppercase tracking-tight">
              Company & Email
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Set the company name used in reports and optional SendGrid details for email alerts.
            </p>
          </CardHeader>

          <CardContent className="grid gap-4">
            <div>
              <Label className="text-xs font-black uppercase tracking-wider">Company Name</Label>
              <Input
                data-testid="setup-company-name"
                className="mt-1 rounded-none border-2"
                placeholder="Long Line Tools"
                value={companyData.company_name}
                onChange={(event) => updateCompany("company_name", event.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Used on reports, email subjects, and system headings where supported.
              </p>
            </div>

            <div>
              <Label className="text-xs font-black uppercase tracking-wider">Email Provider</Label>
              <Select
                value={companyData.email_provider}
                onValueChange={(value) => updateCompany("email_provider", value)}
              >
                <SelectTrigger className="mt-1 rounded-none border-2" data-testid="setup-email-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sendgrid">SendGrid</SelectItem>
                  <SelectItem value="other">Other / Later</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-black uppercase tracking-wider">SendGrid API Key</Label>
              <Input
                data-testid="setup-email-apikey"
                type="password"
                className="mt-1 rounded-none border-2"
                placeholder="Optional - can be added later"
                value={companyData.email_api_key}
                onChange={(event) => updateCompany("email_api_key", event.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Leave blank to skip email setup now.
              </p>
            </div>

            <div>
              <Label className="text-xs font-black uppercase tracking-wider">Sender Email</Label>
              <Input
                data-testid="setup-email-sender"
                type="email"
                className="mt-1 rounded-none border-2"
                placeholder="notifications@company.co.nz"
                value={companyData.sender_email}
                onChange={(event) => updateCompany("sender_email", event.target.value)}
              />
              <FieldError message={errors.sender_email} />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                disabled={loading}
                className="h-12 rounded-none border-2 text-xs font-black uppercase tracking-wider"
              >
                <ChevronLeft size={16} className="mr-2" />
                Back
              </Button>

              <Button
                onClick={handleCompanyEmail}
                disabled={loading}
                className="h-12 rounded-none bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] text-xs font-black uppercase tracking-wider"
                data-testid="setup-step2-next"
              >
                {busyAction === "company" ? "Saving..." : "Save & Continue"}
                <ChevronRight size={16} className="ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card className="rounded-sm border-border shadow-none" data-testid="setup-step-3">
          <CardHeader className="pb-4">
            <CardTitle className="font-['Barlow_Condensed'] text-2xl uppercase tracking-tight">
              Notification Rules
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              These defaults drive safety tag, overdue return, and handover alert behaviour.
            </p>
          </CardHeader>

          <CardContent className="grid gap-5">
            <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <p className="text-sm font-bold">Expiring Safety Tags</p>
                <p className="text-xs text-muted-foreground">Alert when tool tags are near expiry.</p>
              </div>
              <Switch
                checked={notificationData.notify_tag_expiry}
                onCheckedChange={(value) => updateNotification("notify_tag_expiry", value)}
                data-testid="setup-notif-tags"
              />
            </div>

            <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <p className="text-sm font-bold">Overdue Equipment</p>
                <p className="text-xs text-muted-foreground">Alert when tools are past expected return date.</p>
              </div>
              <Switch
                checked={notificationData.notify_overdue}
                onCheckedChange={(value) => updateNotification("notify_overdue", value)}
                data-testid="setup-notif-overdue"
              />
            </div>

            <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <p className="text-sm font-bold">Pending Handovers</p>
                <p className="text-xs text-muted-foreground">Alert on tool transfer and handover actions.</p>
              </div>
              <Switch
                checked={notificationData.notify_handover}
                onCheckedChange={(value) => updateNotification("notify_handover", value)}
                data-testid="setup-notif-handover"
              />
            </div>

            <div>
              <Label className="text-xs font-black uppercase tracking-wider">Advance Warning Days</Label>
              <Input
                data-testid="setup-notif-days"
                type="number"
                min={1}
                max={60}
                className="mt-1 w-32 rounded-none border-2"
                value={notificationData.notify_days_before}
                onChange={(event) => updateNotification("notify_days_before", event.target.value)}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Button
                variant="outline"
                onClick={() => setStep(2)}
                disabled={loading}
                className="h-12 rounded-none border-2 text-xs font-black uppercase tracking-wider"
              >
                <ChevronLeft size={16} className="mr-2" />
                Back
              </Button>

              <Button
                onClick={handleNotifications}
                disabled={loading}
                className="h-12 rounded-none bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] text-xs font-black uppercase tracking-wider"
                data-testid="setup-step3-next"
              >
                {busyAction === "notifications" ? "Saving..." : "Save & Continue"}
                <ChevronRight size={16} className="ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card className="rounded-sm border-border shadow-none" data-testid="setup-step-4">
          <CardHeader className="pb-4">
            <CardTitle className="font-['Barlow_Condensed'] text-2xl uppercase tracking-tight">
              Add Team Members
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Add initial users now, or finish setup and add them later from User Management.
            </p>
          </CardHeader>

          <CardContent className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="text-xs font-black uppercase tracking-wider">Name</Label>
                <Input
                  data-testid="setup-user-name"
                  className="mt-1 rounded-none border-2"
                  placeholder="Worker name"
                  value={newUser.name}
                  onChange={(event) => updateNewUser("name", event.target.value)}
                />
                <FieldError message={errors.user_name} />
              </div>

              <div>
                <Label className="text-xs font-black uppercase tracking-wider">Email</Label>
                <Input
                  data-testid="setup-user-email"
                  type="email"
                  className="mt-1 rounded-none border-2"
                  placeholder="worker@company.co.nz"
                  value={newUser.email}
                  onChange={(event) => updateNewUser("email", event.target.value)}
                />
                <FieldError message={errors.user_email} />
              </div>

              <div>
                <Label className="text-xs font-black uppercase tracking-wider">Temporary Password</Label>
                <Input
                  data-testid="setup-user-password"
                  type="password"
                  className="mt-1 rounded-none border-2"
                  placeholder="Minimum 6 characters"
                  value={newUser.password}
                  onChange={(event) => updateNewUser("password", event.target.value)}
                />
                <FieldError message={errors.user_password} />
              </div>

              <div>
                <Label className="text-xs font-black uppercase tracking-wider">Role</Label>
                <Select value={newUser.role} onValueChange={(value) => updateNewUser("role", value)}>
                  <SelectTrigger className="mt-1 rounded-none border-2" data-testid="setup-user-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={handleAddUser}
              disabled={loading}
              className="h-11 rounded-none border-2 text-xs font-black uppercase tracking-wider"
              data-testid="setup-add-user-btn"
            >
              <UserPlus size={16} className="mr-2" />
              {busyAction === "user" ? "Adding User..." : "Add User"}
            </Button>

            {users.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                  Added Users
                </p>
                {users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between gap-3 border border-border bg-muted/50 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{user.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px] uppercase">
                      {String(user.role || "").replace(/_/g, " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            <div className="grid gap-3 pt-2 md:grid-cols-2">
              <Button
                variant="outline"
                onClick={() => setStep(3)}
                disabled={loading}
                className="h-12 rounded-none border-2 text-xs font-black uppercase tracking-wider"
              >
                <ChevronLeft size={16} className="mr-2" />
                Back
              </Button>

              <Button
                onClick={finishSetup}
                disabled={loading}
                className="h-12 rounded-none bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] text-xs font-black uppercase tracking-wider"
                data-testid="setup-finish-btn"
              >
                Finish Setup
                <Check size={16} className="ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </SetupShell>
  );
}
