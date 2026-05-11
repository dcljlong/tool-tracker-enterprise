import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Mail, Bell, Building, Send, LayoutDashboard, SlidersHorizontal, RotateCcw, Save } from "lucide-react";

const DASHBOARD_LAYOUT_STORAGE_KEY = "tool_tracker_dashboard_layout_v1";

const DASHBOARD_WIDGETS = [
  { key: "hero", label: "Dashboard hero", helper: "Tool control status, health badge, and refresh action." },
  { key: "stats", label: "Summary tiles", helper: "Total tools, available, checked out, and maintenance." },
  { key: "overdueReturns", label: "Overdue returns", helper: "Tools past expected return date." },
  { key: "safetyTags", label: "Safety tags", helper: "Expiring tags and inspection visibility." },
  { key: "recentActivity", label: "Recent activity", helper: "Latest tool movements, returns, and changes." },
  { key: "fleetHealth", label: "Fleet health", helper: "Overall tool fleet health summary." },
  { key: "quickActions", label: "Quick actions", helper: "Scan QR, open tools, reports, and calendar." },
];

const PRESETS = {
  focused: {
    label: "Focused",
    description: "Only urgent tool-control panels.",
    widgets: {
      hero: true,
      stats: true,
      overdueReturns: true,
      safetyTags: true,
      recentActivity: false,
      fleetHealth: true,
      quickActions: true,
    },
  },
  standard: {
    label: "Standard",
    description: "Balanced everyday tool control dashboard.",
    widgets: {
      hero: true,
      stats: true,
      overdueReturns: true,
      safetyTags: true,
      recentActivity: true,
      fleetHealth: true,
      quickActions: true,
    },
  },
  full: {
    label: "Full Control Room",
    description: "Everything visible for managers and audit review.",
    widgets: {
      hero: true,
      stats: true,
      overdueReturns: true,
      safetyTags: true,
      recentActivity: true,
      fleetHealth: true,
      quickActions: true,
    },
  },
};

const DEFAULT_DASHBOARD_LAYOUT = {
  preset: "standard",
  widgets: PRESETS.standard.widgets,
};

function readDashboardLayout() {
  try {
    const raw = localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_DASHBOARD_LAYOUT;

    const parsed = JSON.parse(raw);
    return {
      preset: parsed.preset || "standard",
      widgets: {
        ...DEFAULT_DASHBOARD_LAYOUT.widgets,
        ...(parsed.widgets || {}),
      },
    };
  } catch {
    return DEFAULT_DASHBOARD_LAYOUT;
  }
}

export default function Settings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [dashboardLayout, setDashboardLayout] = useState(readDashboardLayout);

  useEffect(() => {
    api.get('/settings').then(res => setSettings(res.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const saveSettings = async (updates) => {
    setSaving(true);
    try {
      const res = await api.put('/settings', updates);
      setSettings(res.data);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const applyDashboardPreset = (presetKey) => {
    const preset = PRESETS[presetKey];
    if (!preset) return;

    const next = {
      preset: presetKey,
      widgets: { ...preset.widgets },
    };

    setDashboardLayout(next);
    localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("tool-tracker-dashboard-layout-updated"));
    toast.success(`${preset.label} dashboard layout applied`);
  };

  const toggleDashboardWidget = (widgetKey) => {
    setDashboardLayout(prev => ({
      preset: "custom",
      widgets: {
        ...prev.widgets,
        [widgetKey]: !prev.widgets[widgetKey],
      },
    }));
  };

  const saveDashboardLayout = () => {
    localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, JSON.stringify(dashboardLayout));
    window.dispatchEvent(new Event("tool-tracker-dashboard-layout-updated"));
    toast.success("Dashboard layout saved");
  };

  const resetDashboardLayout = () => {
    const next = DEFAULT_DASHBOARD_LAYOUT;
    setDashboardLayout(next);
    localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("tool-tracker-dashboard-layout-updated"));
    toast.success("Dashboard layout reset to Standard");
  };

  const testEmail = async () => {
    setTestingEmail(true);
    try {
      await api.post('/settings/test-email');
      toast.success("Test email sent! Check your inbox.");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Email test failed. Check your API key and sender email.");
    } finally {
      setTestingEmail(false);
    }
  };

  if (user?.role !== "admin") return <p className="text-muted-foreground">Admin access required</p>;
  if (loading) return <div className="h-96 bg-muted animate-pulse rounded-sm" />;

  return (
    <div className="space-y-8" data-testid="settings-page">
      <div>
        <h1 className="font-['Barlow_Condensed'] text-3xl md:text-4xl font-black uppercase tracking-[0.08em] text-slate-950 dark:text-slate-50">Settings</h1>
        <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">Configure your tool tracking system</p>
      </div>

      {/* Company */}
      <Card className="rounded-[1.35rem] border border-slate-200 bg-white text-slate-950 shadow-[0_18px_46px_rgba(15,23,42,0.08)] dark:border-[rgba(245,190,80,0.24)] dark:bg-[radial-gradient(circle_at_top_left,rgba(245,190,80,0.10),transparent_38%),linear-gradient(135deg,#020617,#0f172a_64%,#111827)] dark:text-slate-50 dark:shadow-[0_20px_54px_rgba(15,23,42,0.16)]">
        <CardHeader className="pb-2">
          <CardTitle className="font-['Barlow_Condensed'] text-lg uppercase tracking-tight flex items-center gap-2">
            <Building size={16} /> Company
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wider font-bold">Company Name</Label>
            <Input data-testid="settings-company-name" className="mt-1 max-w-md rounded-xl border border-slate-300 bg-white text-slate-950 dark:border-white/20 dark:bg-slate-950/45 dark:text-slate-50" placeholder="Your Construction Company"
              value={settings?.company_name || ""} onChange={e => setSettings({...settings, company_name: e.target.value})} />
          </div>
          <Button onClick={() => saveSettings({ company_name: settings?.company_name })} disabled={saving}
            className="bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase text-xs font-bold tracking-wider h-10" data-testid="save-company-btn">
            Save
          </Button>
        </CardContent>
      </Card>

      {/* Email Configuration */}
      <Card className="rounded-[1.35rem] border border-slate-200 bg-white text-slate-950 shadow-[0_18px_46px_rgba(15,23,42,0.08)] dark:border-[rgba(245,190,80,0.24)] dark:bg-[radial-gradient(circle_at_top_left,rgba(245,190,80,0.10),transparent_38%),linear-gradient(135deg,#020617,#0f172a_64%,#111827)] dark:text-slate-50 dark:shadow-[0_20px_54px_rgba(15,23,42,0.16)]">
        <CardHeader className="pb-2">
          <CardTitle className="font-['Barlow_Condensed'] text-lg uppercase tracking-tight flex items-center gap-2">
            <Mail size={16} /> Email Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">Configure email to send notifications for expiring tags, overdue tools, and handovers.</p>
          <div>
            <Label className="text-xs uppercase tracking-wider font-bold">Email Provider</Label>
            <Select value={settings?.email_provider || "sendgrid"} onValueChange={v => setSettings({...settings, email_provider: v})}>
              <SelectTrigger className="mt-1 max-w-md rounded-xl border border-slate-300 bg-white text-slate-950 dark:border-white/20 dark:bg-slate-950/45 dark:text-slate-50" data-testid="settings-email-provider"><SelectValue placeholder="Select provider" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sendgrid">SendGrid</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider font-bold">API Key</Label>
            <Input data-testid="settings-email-apikey" type="password" className="mt-1 max-w-md rounded-xl border border-slate-300 bg-white text-slate-950 dark:border-white/20 dark:bg-slate-950/45 dark:text-slate-50" placeholder="SG.xxxxx..."
              value={settings?.email_api_key || ""} onChange={e => setSettings({...settings, email_api_key: e.target.value})} />
            <p className="text-xs text-muted-foreground mt-1">Get your API key from <a href="https://app.sendgrid.com/settings/api_keys" target="_blank" rel="noopener noreferrer" className="text-[hsl(38,92%,50%)] hover:underline">SendGrid Dashboard</a> &rarr; Settings &rarr; API Keys</p>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider font-bold">Sender Email</Label>
            <Input data-testid="settings-sender-email" type="email" className="mt-1 max-w-md rounded-xl border border-slate-300 bg-white text-slate-950 dark:border-white/20 dark:bg-slate-950/45 dark:text-slate-50" placeholder="notifications@yourcompany.co.nz"
              value={settings?.sender_email || ""} onChange={e => setSettings({...settings, sender_email: e.target.value})} />
            <p className="text-xs text-muted-foreground mt-1">Must be a verified sender in your SendGrid account</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => saveSettings({ email_provider: settings?.email_provider, email_api_key: settings?.email_api_key, sender_email: settings?.sender_email })}
              disabled={saving} className="bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase text-xs font-bold tracking-wider h-10" data-testid="save-email-btn">
              Save Email Config
            </Button>
            <Button variant="outline" onClick={testEmail} disabled={testingEmail} className="h-10 rounded-xl border border-slate-300 bg-white text-xs font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-50 dark:border-white/20 dark:bg-transparent dark:text-slate-100 dark:hover:bg-white/5" data-testid="test-email-btn">
              <Send size={14} className="mr-2" /> {testingEmail ? "Sending..." : "Test Email"}
            </Button>
          </div>
        </CardContent>
      </Card>


      {/* Dashboard Layout */}
      <Card className="rounded-[1.35rem] border border-slate-200 bg-white text-slate-950 shadow-[0_18px_46px_rgba(15,23,42,0.08)] dark:border-[rgba(245,190,80,0.24)] dark:bg-[radial-gradient(circle_at_top_left,rgba(245,190,80,0.10),transparent_38%),linear-gradient(135deg,#020617,#0f172a_64%,#111827)] dark:text-slate-50 dark:shadow-[0_20px_54px_rgba(15,23,42,0.16)]">
        <CardHeader className="pb-2">
          <CardTitle className="font-['Barlow_Condensed'] text-lg uppercase tracking-tight flex items-center gap-2">
            <LayoutDashboard size={16} /> Dashboard Layout
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Choose how much detail appears on your Tool Tracker dashboard. This version saves your personal layout on this device.
          </p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {Object.entries(PRESETS).map(([key, preset]) => (
              <button
                key={key}
                type="button"
                onClick={() => applyDashboardPreset(key)}
                className={`border-2 p-4 text-left transition-all hover:border-[hsl(38,92%,50%)] ${
                  dashboardLayout.preset === key
                    ? "border-[hsl(38,92%,50%)] bg-[hsl(38,92%,50%)]/15 text-slate-950 dark:text-slate-50"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-[hsl(38,92%,50%)]/8 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                }`}
              >
                <p className="font-['Barlow_Condensed'] text-lg font-black uppercase tracking-tight">
                  {preset.label}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {preset.description}
                </p>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {DASHBOARD_WIDGETS.map(widget => (
              <label
                key={widget.key}
                className={`flex cursor-pointer items-start gap-3 border p-4 transition-all ${
                  dashboardLayout.widgets[widget.key]
                    ? "border-[hsl(38,92%,50%)]/55 bg-[hsl(38,92%,50%)]/15 text-slate-950 dark:text-slate-50"
                    : "border-slate-200 bg-white text-slate-600 opacity-90 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:opacity-80"
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!dashboardLayout.widgets[widget.key]}
                  onChange={() => toggleDashboardWidget(widget.key)}
                  className="mt-1 h-4 w-4 accent-[hsl(38,92%,50%)]"
                />
                <span>
                  <span className="block text-xs font-black uppercase tracking-[0.16em]">
                    {widget.label}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {widget.helper}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={saveDashboardLayout}
              className="bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase text-xs font-bold tracking-wider h-10"
            >
              <Save size={14} className="mr-2" /> Save Layout
            </Button>
            <Button
              variant="outline"
              onClick={resetDashboardLayout}
              className="h-10 rounded-xl border border-slate-300 bg-white text-xs font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-50 dark:border-white/20 dark:bg-transparent dark:text-slate-100 dark:hover:bg-white/5"
            >
              <RotateCcw size={14} className="mr-2" /> Reset Standard
            </Button>
          </div>
        </CardContent>
      </Card>
      {/* Notification Preferences */}
      <Card className="rounded-[1.35rem] border border-slate-200 bg-white text-slate-950 shadow-[0_18px_46px_rgba(15,23,42,0.08)] dark:border-[rgba(245,190,80,0.24)] dark:bg-[radial-gradient(circle_at_top_left,rgba(245,190,80,0.10),transparent_38%),linear-gradient(135deg,#020617,#0f172a_64%,#111827)] dark:text-slate-50 dark:shadow-[0_20px_54px_rgba(15,23,42,0.16)]">
        <CardHeader className="pb-2">
          <CardTitle className="font-['Barlow_Condensed'] text-lg uppercase tracking-tight flex items-center gap-2">
            <Bell size={16} /> Notification Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between py-3 border-b border-slate-200 dark:border-white/10">
            <div>
              <p className="text-sm font-medium">Expiring Safety Tags</p>
              <p className="text-xs text-slate-400">Alert when safety tags are near expiry</p>
            </div>
            <Switch checked={settings?.notify_tag_expiry ?? true}
              onCheckedChange={v => { setSettings({...settings, notify_tag_expiry: v}); saveSettings({ notify_tag_expiry: v }); }}
              data-testid="settings-notif-tags" />
          </div>
          <div className="flex items-center justify-between py-3 border-b border-slate-200 dark:border-white/10">
            <div>
              <p className="text-sm font-medium">Overdue Equipment</p>
              <p className="text-xs text-slate-400">Alert when tools are past return date</p>
            </div>
            <Switch checked={settings?.notify_overdue ?? true}
              onCheckedChange={v => { setSettings({...settings, notify_overdue: v}); saveSettings({ notify_overdue: v }); }}
              data-testid="settings-notif-overdue" />
          </div>
          <div className="flex items-center justify-between py-3 border-b border-slate-200 dark:border-white/10">
            <div>
              <p className="text-sm font-medium">Pending Handovers</p>
              <p className="text-xs text-slate-400">Alert on tool transfer notifications</p>
            </div>
            <Switch checked={settings?.notify_handover ?? true}
              onCheckedChange={v => { setSettings({...settings, notify_handover: v}); saveSettings({ notify_handover: v }); }}
              data-testid="settings-notif-handover" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider font-bold">Advance Warning (Days Before Expiry)</Label>
            <Input data-testid="settings-notif-days" type="number" className="mt-1 w-32 rounded-xl border border-slate-300 bg-white text-slate-950 dark:border-white/20 dark:bg-slate-950/45 dark:text-slate-50" min={1} max={60}
              value={settings?.notify_days_before ?? 14} onChange={e => setSettings({...settings, notify_days_before: parseInt(e.target.value) || 14})} />
            <Button onClick={() => saveSettings({ notify_days_before: settings?.notify_days_before })} disabled={saving}
              className="mt-2 bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase text-xs font-bold tracking-wider h-10" data-testid="save-notif-days-btn">
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
