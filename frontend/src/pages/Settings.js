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
import { Mail, Bell, Building, Send, AlertCircle, CheckCircle } from "lucide-react";

export default function Settings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);

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
        <h1 className="font-['Barlow_Condensed'] text-3xl md:text-4xl font-black uppercase tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure your tool tracking system</p>
      </div>

      {/* Company */}
      <Card className="rounded-sm shadow-none border border-border">
        <CardHeader className="pb-2">
          <CardTitle className="font-['Barlow_Condensed'] text-lg uppercase tracking-tight flex items-center gap-2">
            <Building size={16} /> Company
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wider font-bold">Company Name</Label>
            <Input data-testid="settings-company-name" className="rounded-none border-2 mt-1 max-w-md" placeholder="Your Construction Company"
              value={settings?.company_name || ""} onChange={e => setSettings({...settings, company_name: e.target.value})} />
          </div>
          <Button onClick={() => saveSettings({ company_name: settings?.company_name })} disabled={saving}
            className="bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase text-xs font-bold tracking-wider h-10" data-testid="save-company-btn">
            Save
          </Button>
        </CardContent>
      </Card>

      {/* Email Configuration */}
      <Card className="rounded-sm shadow-none border border-border">
        <CardHeader className="pb-2">
          <CardTitle className="font-['Barlow_Condensed'] text-lg uppercase tracking-tight flex items-center gap-2">
            <Mail size={16} /> Email Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Configure email to send notifications for expiring tags, overdue tools, and handovers.</p>
          <div>
            <Label className="text-xs uppercase tracking-wider font-bold">Email Provider</Label>
            <Select value={settings?.email_provider || "sendgrid"} onValueChange={v => setSettings({...settings, email_provider: v})}>
              <SelectTrigger className="rounded-none border-2 mt-1 max-w-md" data-testid="settings-email-provider"><SelectValue placeholder="Select provider" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sendgrid">SendGrid</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider font-bold">API Key</Label>
            <Input data-testid="settings-email-apikey" type="password" className="rounded-none border-2 mt-1 max-w-md" placeholder="SG.xxxxx..."
              value={settings?.email_api_key || ""} onChange={e => setSettings({...settings, email_api_key: e.target.value})} />
            <p className="text-xs text-muted-foreground mt-1">Get your API key from <a href="https://app.sendgrid.com/settings/api_keys" target="_blank" rel="noopener noreferrer" className="text-[hsl(38,92%,50%)] hover:underline">SendGrid Dashboard</a> &rarr; Settings &rarr; API Keys</p>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider font-bold">Sender Email</Label>
            <Input data-testid="settings-sender-email" type="email" className="rounded-none border-2 mt-1 max-w-md" placeholder="notifications@yourcompany.co.nz"
              value={settings?.sender_email || ""} onChange={e => setSettings({...settings, sender_email: e.target.value})} />
            <p className="text-xs text-muted-foreground mt-1">Must be a verified sender in your SendGrid account</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => saveSettings({ email_provider: settings?.email_provider, email_api_key: settings?.email_api_key, sender_email: settings?.sender_email })}
              disabled={saving} className="bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase text-xs font-bold tracking-wider h-10" data-testid="save-email-btn">
              Save Email Config
            </Button>
            <Button variant="outline" onClick={testEmail} disabled={testingEmail} className="rounded-none uppercase text-xs font-bold tracking-wider border-2 h-10" data-testid="test-email-btn">
              <Send size={14} className="mr-2" /> {testingEmail ? "Sending..." : "Test Email"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card className="rounded-sm shadow-none border border-border">
        <CardHeader className="pb-2">
          <CardTitle className="font-['Barlow_Condensed'] text-lg uppercase tracking-tight flex items-center gap-2">
            <Bell size={16} /> Notification Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div>
              <p className="text-sm font-medium">Expiring Safety Tags</p>
              <p className="text-xs text-muted-foreground">Alert when safety tags are near expiry</p>
            </div>
            <Switch checked={settings?.notify_tag_expiry ?? true}
              onCheckedChange={v => { setSettings({...settings, notify_tag_expiry: v}); saveSettings({ notify_tag_expiry: v }); }}
              data-testid="settings-notif-tags" />
          </div>
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div>
              <p className="text-sm font-medium">Overdue Equipment</p>
              <p className="text-xs text-muted-foreground">Alert when tools are past return date</p>
            </div>
            <Switch checked={settings?.notify_overdue ?? true}
              onCheckedChange={v => { setSettings({...settings, notify_overdue: v}); saveSettings({ notify_overdue: v }); }}
              data-testid="settings-notif-overdue" />
          </div>
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div>
              <p className="text-sm font-medium">Pending Handovers</p>
              <p className="text-xs text-muted-foreground">Alert on tool transfer notifications</p>
            </div>
            <Switch checked={settings?.notify_handover ?? true}
              onCheckedChange={v => { setSettings({...settings, notify_handover: v}); saveSettings({ notify_handover: v }); }}
              data-testid="settings-notif-handover" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider font-bold">Advance Warning (Days Before Expiry)</Label>
            <Input data-testid="settings-notif-days" type="number" className="rounded-none border-2 mt-1 w-32" min={1} max={60}
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
