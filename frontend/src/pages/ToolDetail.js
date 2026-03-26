import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowLeft, QrCode, ArrowRight, RotateCcw, Users as UsersIcon,
  Wrench, CheckCircle, AlertTriangle, Clock, ShieldCheck, FileText, Camera
} from "lucide-react";
import { ToolCertificates } from "@/components/ToolCertificates";

const statusConfig = {
  available: { label: "Available", class: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" },
  checked_out: { label: "Checked Out", class: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20" },
  maintenance_required: { label: "Maintenance Required", class: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20" },
};

export default function ToolDetail() {
  const { toolId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tool, setTool] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [audit, setAudit] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Checkout state
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutData, setCheckoutData] = useState({ job_number: "", site: "", site_manager: "", expected_return_date: "", notes: "" });

  // Return state
  const [showReturn, setShowReturn] = useState(false);
  const [returnData, setReturnData] = useState({ condition: "good", notes: "" });

  // Handover state
  const [showHandover, setShowHandover] = useState(false);
  const [handoverData, setHandoverData] = useState({ next_holder_id: "", job_number: "", site_manager: "", notes: "" });

  // Maintenance state
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [maintData, setMaintData] = useState({ action_type: "inspection", description: "", safety_tag_expiry: "", next_maintenance_date: "", condition: "" });

  // Photo upload
  const [uploading, setUploading] = useState(false);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setUploading(true);
    try {
      const res = await api.post(`/tools/${toolId}/photo`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setTool(prev => ({ ...prev, photo_url: res.data.photo_url }));
      toast.success("Photo uploaded");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    Promise.all([
      api.get(`/tools/${toolId}`),
      api.get(`/tools/${toolId}/qr`),
      api.get(`/audit/${toolId}`),
      api.get('/users'),
    ]).then(([toolRes, qrRes, auditRes, usersRes]) => {
      setTool(toolRes.data);
      setQrCode(qrRes.data.qr_code);
      setAudit(auditRes.data);
      setAllUsers(usersRes.data);
    }).catch(() => toast.error("Failed to load tool")).finally(() => setLoading(false));
  }, [toolId]);

  const handleCheckout = async () => {
    if (!checkoutData.job_number || !checkoutData.site || !checkoutData.site_manager || !checkoutData.expected_return_date) {
      toast.error("Fill all required fields"); return;
    }
    try {
      await api.post('/checkout', { tool_id: toolId, ...checkoutData });
      toast.success("Tool checked out");
      setShowCheckout(false);
      const [toolRes, auditRes] = await Promise.all([api.get(`/tools/${toolId}`), api.get(`/audit/${toolId}`)]);
      setTool(toolRes.data); setAudit(auditRes.data);
    } catch (err) { toast.error(err.response?.data?.detail || "Checkout failed"); }
  };

  const handleReturn = async () => {
    try {
      await api.post('/return', { tool_id: toolId, ...returnData });
      toast.success("Tool returned");
      setShowReturn(false);
      const [toolRes, auditRes] = await Promise.all([api.get(`/tools/${toolId}`), api.get(`/audit/${toolId}`)]);
      setTool(toolRes.data); setAudit(auditRes.data);
    } catch (err) { toast.error(err.response?.data?.detail || "Return failed"); }
  };

  const handleHandover = async () => {
    if (!handoverData.next_holder_id || !handoverData.job_number || !handoverData.site_manager) {
      toast.error("Fill all required fields"); return;
    }
    try {
      await api.post('/handover', { tool_id: toolId, ...handoverData });
      toast.success("Handover complete");
      setShowHandover(false);
      const [toolRes, auditRes] = await Promise.all([api.get(`/tools/${toolId}`), api.get(`/audit/${toolId}`)]);
      setTool(toolRes.data); setAudit(auditRes.data);
    } catch (err) { toast.error(err.response?.data?.detail || "Handover failed"); }
  };

  const handleMaintenance = async () => {
    if (!maintData.description) { toast.error("Description required"); return; }
    try {
      await api.post('/maintenance', { tool_id: toolId, ...maintData });
      toast.success("Maintenance recorded");
      setShowMaintenance(false);
      const [toolRes, auditRes] = await Promise.all([api.get(`/tools/${toolId}`), api.get(`/audit/${toolId}`)]);
      setTool(toolRes.data); setAudit(auditRes.data);
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-sm" />)}</div>;
  if (!tool) return <p>Tool not found</p>;

  const sc = statusConfig[tool.status] || statusConfig.available;
  const canManage = user?.role === "admin" || user?.role === "site_manager";

  return (
    <div className="space-y-6" data-testid="tool-detail-page">
      <Button variant="ghost" onClick={() => navigate('/tools')} className="rounded-none uppercase text-xs font-bold tracking-wider -ml-2" data-testid="back-to-tools">
        <ArrowLeft size={14} className="mr-2" /> Back to Tools
      </Button>

      {/* Header */}
      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1 space-y-4">
          <div className="flex items-start gap-3 flex-wrap">
            <h1 className="font-['Barlow_Condensed'] text-3xl md:text-4xl font-black uppercase tracking-tight">{tool.asset_id}</h1>
            <Badge className={`${sc.class} rounded-full text-xs font-bold uppercase px-3 py-1 mt-1`}>{sc.label}</Badge>
          </div>
          <p className="text-lg text-muted-foreground">{tool.description}</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div><p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Category</p><p className="font-medium mt-0.5">{tool.category}</p></div>
            <div><p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Model</p><p className="font-medium mt-0.5">{tool.model_name || "—"}</p></div>
            <div><p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Serial</p><p className="font-['JetBrains_Mono'] mt-0.5">{tool.serial_number || "—"}</p></div>
            <div><p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Condition</p><p className="font-medium mt-0.5 capitalize">{tool.condition}</p></div>
            <div>
              <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Safety Tag</p>
              <p className={`font-medium mt-0.5 ${tool.safety_tag_expiry && new Date(tool.safety_tag_expiry) < new Date() ? 'text-rose-500' : ''}`}>
                {tool.safety_tag_expiry ? new Date(tool.safety_tag_expiry).toLocaleDateString('en-NZ') : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Next Maintenance</p>
              <p className="font-medium mt-0.5">{tool.next_maintenance_date ? new Date(tool.next_maintenance_date).toLocaleDateString('en-NZ') : "—"}</p>
            </div>
          </div>

          {tool.current_holder_name && (
            <Card className="rounded-sm shadow-none border-2 border-blue-500/30 bg-blue-500/5">
              <CardContent className="py-3 flex items-center gap-3">
                <UsersIcon size={18} className="text-blue-500" />
                <div>
                  <p className="text-sm font-medium">Currently with: <span className="font-bold">{tool.current_holder_name}</span></p>
                  <p className="text-xs text-muted-foreground">{tool.current_site && `Site: ${tool.current_site}`} {tool.current_job && `| Job: ${tool.current_job}`}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Photo & QR Code */}
        <div className="flex flex-col gap-4 w-full md:w-52 shrink-0">
          {/* Tool Photo */}
          <Card className="rounded-sm shadow-none border border-border" data-testid="tool-photo-card">
            <CardContent className="p-4 text-center">
              {tool.photo_url ? (
                <img src={tool.photo_url.startsWith('/api') ? `${process.env.REACT_APP_BACKEND_URL}${tool.photo_url}` : tool.photo_url}
                  alt={tool.description} className="w-full h-36 object-cover" data-testid="tool-photo" />
              ) : (
                <div className="w-full h-36 bg-muted flex items-center justify-center">
                  <Camera size={32} className="text-muted-foreground" />
                </div>
              )}
              <label className="mt-2 block">
                <Input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoUpload} data-testid="photo-upload-input" />
                <Button variant="outline" size="sm" className="w-full rounded-none uppercase text-xs font-bold tracking-wider border-2 mt-2" asChild disabled={uploading}>
                  <span><Camera size={12} className="mr-1" /> {uploading ? "Uploading..." : "Upload Photo"}</span>
                </Button>
              </label>
            </CardContent>
          </Card>

          {/* QR Code */}
          <Card className="rounded-sm shadow-none border border-border" data-testid="qr-code-card">
            <CardContent className="p-4 text-center">
              {qrCode && <img src={qrCode} alt="QR Code" className="w-full" data-testid="qr-code-image" />}
              <p className="text-xs text-muted-foreground mt-2 uppercase tracking-wider">Scan to identify</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        {tool.status === "available" && (
          <Dialog open={showCheckout} onOpenChange={setShowCheckout}>
            <DialogTrigger asChild>
              <Button className="bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase text-xs font-bold tracking-wider h-10" data-testid="checkout-btn">
                <ArrowRight size={14} className="mr-2" /> Check Out
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-sm">
              <DialogHeader><DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">Check Out Tool</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label className="text-xs uppercase tracking-wider font-bold">Job Number *</Label><Input data-testid="checkout-job" className="rounded-none border-2 mt-1" value={checkoutData.job_number} onChange={e => setCheckoutData({...checkoutData, job_number: e.target.value})} /></div>
                <div><Label className="text-xs uppercase tracking-wider font-bold">Site *</Label><Input data-testid="checkout-site" className="rounded-none border-2 mt-1" value={checkoutData.site} onChange={e => setCheckoutData({...checkoutData, site: e.target.value})} /></div>
                <div><Label className="text-xs uppercase tracking-wider font-bold">Site Manager *</Label><Input data-testid="checkout-manager" className="rounded-none border-2 mt-1" value={checkoutData.site_manager} onChange={e => setCheckoutData({...checkoutData, site_manager: e.target.value})} /></div>
                <div><Label className="text-xs uppercase tracking-wider font-bold">Expected Return *</Label><Input data-testid="checkout-return-date" type="date" className="rounded-none border-2 mt-1" value={checkoutData.expected_return_date} onChange={e => setCheckoutData({...checkoutData, expected_return_date: e.target.value})} /></div>
                <div><Label className="text-xs uppercase tracking-wider font-bold">Notes</Label><Textarea data-testid="checkout-notes" className="rounded-none border-2 mt-1" rows={2} value={checkoutData.notes} onChange={e => setCheckoutData({...checkoutData, notes: e.target.value})} /></div>
                <Button onClick={handleCheckout} className="w-full bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase font-bold tracking-wider h-11" data-testid="confirm-checkout-btn">Confirm Checkout</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {tool.status === "checked_out" && (
          <>
            <Dialog open={showReturn} onOpenChange={setShowReturn}>
              <DialogTrigger asChild>
                <Button className="bg-emerald-600 text-white hover:bg-emerald-700 rounded-none uppercase text-xs font-bold tracking-wider h-10" data-testid="return-btn">
                  <RotateCcw size={14} className="mr-2" /> Return
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-sm">
                <DialogHeader><DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">Return Tool</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold">Condition</Label>
                    <Select value={returnData.condition} onValueChange={v => setReturnData({...returnData, condition: v})}>
                      <SelectTrigger className="rounded-none border-2 mt-1" data-testid="return-condition"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="good">Good</SelectItem>
                        <SelectItem value="fair">Fair</SelectItem>
                        <SelectItem value="damaged">Damaged (needs maintenance)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs uppercase tracking-wider font-bold">Notes</Label><Textarea data-testid="return-notes" className="rounded-none border-2 mt-1" rows={2} value={returnData.notes} onChange={e => setReturnData({...returnData, notes: e.target.value})} /></div>
                  <Button onClick={handleReturn} className="w-full bg-emerald-600 text-white hover:bg-emerald-700 rounded-none uppercase font-bold tracking-wider h-11" data-testid="confirm-return-btn">Confirm Return</Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={showHandover} onOpenChange={setShowHandover}>
              <DialogTrigger asChild>
                <Button variant="outline" className="rounded-none uppercase text-xs font-bold tracking-wider border-2 h-10" data-testid="handover-btn">
                  <UsersIcon size={14} className="mr-2" /> Handover
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-sm">
                <DialogHeader><DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">Handover Tool</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold">Hand To *</Label>
                    <Select value={handoverData.next_holder_id} onValueChange={v => setHandoverData({...handoverData, next_holder_id: v})}>
                      <SelectTrigger className="rounded-none border-2 mt-1" data-testid="handover-user"><SelectValue placeholder="Select user" /></SelectTrigger>
                      <SelectContent>{allUsers.filter(u => u.id !== user?.id).map(u => <SelectItem key={u.id} value={u.id}>{u.name} ({u.role})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs uppercase tracking-wider font-bold">Job Number *</Label><Input data-testid="handover-job" className="rounded-none border-2 mt-1" value={handoverData.job_number} onChange={e => setHandoverData({...handoverData, job_number: e.target.value})} /></div>
                  <div><Label className="text-xs uppercase tracking-wider font-bold">Site Manager *</Label><Input data-testid="handover-manager" className="rounded-none border-2 mt-1" value={handoverData.site_manager} onChange={e => setHandoverData({...handoverData, site_manager: e.target.value})} /></div>
                  <div><Label className="text-xs uppercase tracking-wider font-bold">Notes</Label><Textarea data-testid="handover-notes" className="rounded-none border-2 mt-1" rows={2} value={handoverData.notes} onChange={e => setHandoverData({...handoverData, notes: e.target.value})} /></div>
                  <Button onClick={handleHandover} className="w-full bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase font-bold tracking-wider h-11" data-testid="confirm-handover-btn">Confirm Handover</Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}

        {canManage && (
          <Dialog open={showMaintenance} onOpenChange={setShowMaintenance}>
            <DialogTrigger asChild>
              <Button variant="outline" className="rounded-none uppercase text-xs font-bold tracking-wider border-2 h-10" data-testid="maintenance-btn">
                <Wrench size={14} className="mr-2" /> Record Maintenance
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-sm">
              <DialogHeader><DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">Record Maintenance</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider font-bold">Action Type</Label>
                  <Select value={maintData.action_type} onValueChange={v => setMaintData({...maintData, action_type: v})}>
                    <SelectTrigger className="rounded-none border-2 mt-1" data-testid="maint-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inspection">Inspection</SelectItem>
                      <SelectItem value="repair">Repair</SelectItem>
                      <SelectItem value="calibration">Calibration</SelectItem>
                      <SelectItem value="tag_renewal">Tag Renewal</SelectItem>
                      <SelectItem value="completed">Mark Completed (return to available)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs uppercase tracking-wider font-bold">Description *</Label><Textarea data-testid="maint-description" className="rounded-none border-2 mt-1" rows={2} value={maintData.description} onChange={e => setMaintData({...maintData, description: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs uppercase tracking-wider font-bold">New Tag Expiry</Label><Input data-testid="maint-tag" type="date" className="rounded-none border-2 mt-1" value={maintData.safety_tag_expiry} onChange={e => setMaintData({...maintData, safety_tag_expiry: e.target.value})} /></div>
                  <div><Label className="text-xs uppercase tracking-wider font-bold">Next Maintenance</Label><Input data-testid="maint-next" type="date" className="rounded-none border-2 mt-1" value={maintData.next_maintenance_date} onChange={e => setMaintData({...maintData, next_maintenance_date: e.target.value})} /></div>
                </div>
                <Button onClick={handleMaintenance} className="w-full bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase font-bold tracking-wider h-11" data-testid="confirm-maint-btn">Save Maintenance Record</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Compliance Certificates */}
      <ToolCertificates toolId={toolId} />

      {/* Audit Trail */}
      <Card className="rounded-sm shadow-none border border-border" data-testid="audit-trail">
        <CardHeader className="pb-2">
          <CardTitle className="font-['Barlow_Condensed'] text-lg uppercase tracking-tight flex items-center gap-2">
            <FileText size={16} /> Audit Trail
          </CardTitle>
        </CardHeader>
        <CardContent>
          {audit.length > 0 ? (
            <div className="space-y-2">
              {audit.map(a => (
                <div key={a.id} className="flex items-start gap-3 p-2 border-b border-border last:border-0 text-sm">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                    a.action === 'checkout' ? 'bg-blue-500' :
                    a.action === 'return' ? 'bg-emerald-500' :
                    a.action === 'handover' ? 'bg-amber-500' :
                    a.action === 'maintenance' ? 'bg-rose-500' : 'bg-muted-foreground'
                  }`} />
                  <div className="flex-1">
                    <p><span className="font-medium">{a.user_name}</span> <span className="text-muted-foreground">&mdash; {a.details}</span></p>
                    <p className="text-xs text-muted-foreground mt-0.5">{new Date(a.timestamp).toLocaleString('en-NZ')}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] uppercase shrink-0">{a.action}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No activity recorded</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
