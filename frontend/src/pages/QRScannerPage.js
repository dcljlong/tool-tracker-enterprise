import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Scanner } from "@yudiel/react-qr-scanner";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Camera, ArrowRight, RotateCcw, Users, Wrench, CheckCircle,
  AlertTriangle, QrCode, ArrowLeft, X
} from "lucide-react";

const statusConfig = {
  available: { label: "Available", class: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20", icon: CheckCircle },
  checked_out: { label: "Checked Out", class: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20", icon: ArrowRight },
  maintenance_required: { label: "Maintenance", class: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20", icon: AlertTriangle },
};

export default function QRScannerPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [scanning, setScanning] = useState(true);
  const [tool, setTool] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Action dialogs
  const [showCheckout, setShowCheckout] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [showHandover, setShowHandover] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [checkoutData, setCheckoutData] = useState({ job_number: "", site: "", site_manager: "", expected_return_date: "", notes: "" });
  const [returnData, setReturnData] = useState({ condition: "good", notes: "" });
  const [handoverData, setHandoverData] = useState({ next_holder_id: "", job_number: "", site_manager: "", notes: "" });

  const handleScan = useCallback(async (detectedCodes) => {
    if (!scanning || loading) return;
    const code = detectedCodes?.[0];
    if (!code?.rawValue) return;

    setScanning(false);
    setLoading(true);
    setError("");

    try {
      let toolId;
      // Try parsing as JSON (our QR format)
      try {
        const parsed = JSON.parse(code.rawValue);
        toolId = parsed.tool_id;
      } catch {
        // Maybe it's just a tool ID string
        toolId = code.rawValue;
      }

      if (!toolId) {
        setError("Invalid QR code - no tool ID found");
        setLoading(false);
        return;
      }

      const res = await api.get(`/tools/${toolId}`);
      setTool(res.data);
      // Pre-fetch users for handover
      api.get('/users').then(r => setAllUsers(r.data)).catch(() => {});
    } catch (err) {
      if (err.response?.status === 404) {
        setError("Tool not found. This QR code doesn't match any tool in the system.");
      } else {
        setError("Failed to look up tool. Check your connection.");
      }
    } finally {
      setLoading(false);
    }
  }, [scanning, loading]);

  const resetScanner = () => {
    setTool(null);
    setError("");
    setScanning(true);
  };

  const handleCheckout = async () => {
    if (!checkoutData.job_number || !checkoutData.site || !checkoutData.site_manager || !checkoutData.expected_return_date) {
      toast.error("Fill all required fields"); return;
    }
    try {
      await api.post('/checkout', { tool_id: tool.id, ...checkoutData });
      toast.success(`${tool.asset_id} checked out`);
      setShowCheckout(false);
      resetScanner();
    } catch (err) { toast.error(err.response?.data?.detail || "Checkout failed"); }
  };

  const handleReturn = async () => {
    try {
      await api.post('/return', { tool_id: tool.id, ...returnData });
      toast.success(`${tool.asset_id} returned`);
      setShowReturn(false);
      resetScanner();
    } catch (err) { toast.error(err.response?.data?.detail || "Return failed"); }
  };

  const handleHandover = async () => {
    if (!handoverData.next_holder_id || !handoverData.job_number || !handoverData.site_manager) {
      toast.error("Fill required fields"); return;
    }
    try {
      await api.post('/handover', { tool_id: tool.id, ...handoverData });
      toast.success("Handover complete");
      setShowHandover(false);
      resetScanner();
    } catch (err) { toast.error(err.response?.data?.detail || "Handover failed"); }
  };

  return (
    <div className="space-y-4" data-testid="qr-scanner-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-['Barlow_Condensed'] text-3xl font-black uppercase tracking-tight">QR Scanner</h1>
          <p className="text-muted-foreground text-sm mt-1">Scan tool QR code for quick actions</p>
        </div>
        <Button variant="ghost" onClick={() => navigate(-1)} className="rounded-none uppercase text-xs font-bold tracking-wider" data-testid="scanner-back-btn">
          <ArrowLeft size={14} className="mr-1" /> Back
        </Button>
      </div>

      {/* Scanner View */}
      {scanning && !tool && (
        <Card className="rounded-sm shadow-none border-2 border-[hsl(38,92%,50%)]/30 overflow-hidden" data-testid="camera-scanner">
          <CardContent className="p-0">
            <div className="relative aspect-square max-h-[400px] bg-black">
              <Scanner
                onScan={handleScan}
                onError={(err) => setError(typeof err === 'string' ? err : 'Camera access failed. Please allow camera permissions.')}
                formats={["qr_code"]}
                components={{ audio: false, torch: true }}
                styles={{
                  container: { width: "100%", height: "100%" },
                  video: { objectFit: "cover" },
                }}
              />
              {/* Scan overlay */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-56 h-56 border-2 border-[hsl(38,92%,50%)] relative">
                    <div className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-4 border-l-4 border-[hsl(38,92%,50%)]" />
                    <div className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-4 border-r-4 border-[hsl(38,92%,50%)]" />
                    <div className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-4 border-l-4 border-[hsl(38,92%,50%)]" />
                    <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-4 border-r-4 border-[hsl(38,92%,50%)]" />
                  </div>
                </div>
                <div className="absolute bottom-4 left-0 right-0 text-center">
                  <p className="text-white text-sm font-medium bg-black/50 inline-block px-4 py-2">
                    Point camera at tool QR code
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <Card className="rounded-sm shadow-none border border-border">
          <CardContent className="py-12 text-center">
            <div className="animate-pulse text-[hsl(38,92%,50%)]">
              <QrCode size={48} className="mx-auto mb-4" />
              <p className="text-lg font-medium">Looking up tool...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card className="rounded-sm shadow-none border-2 border-rose-500/30 bg-rose-500/5" data-testid="scan-error">
          <CardContent className="py-6 text-center">
            <AlertTriangle size={36} className="mx-auto text-rose-500 mb-3" />
            <p className="text-sm font-medium">{error}</p>
            <Button onClick={resetScanner} className="mt-4 bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase text-xs font-bold tracking-wider" data-testid="scan-again-btn">
              <Camera size={14} className="mr-2" /> Scan Again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tool Found */}
      {tool && !loading && (
        <div className="space-y-4">
          <Card className="rounded-sm shadow-none border-2 border-[hsl(38,92%,50%)]/30 bg-[hsl(38,92%,50%)]/5" data-testid="scanned-tool">
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                {tool.photo_url ? (
                  <img src={tool.photo_url.startsWith('/api') ? `${process.env.REACT_APP_BACKEND_URL}${tool.photo_url}` : tool.photo_url}
                    alt={tool.description} className="w-16 h-16 object-cover shrink-0" />
                ) : (
                  <div className="w-16 h-16 bg-muted flex items-center justify-center shrink-0">
                    <Wrench size={24} className="text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-['JetBrains_Mono'] text-lg font-bold">{tool.asset_id}</span>
                    <Badge className={`${(statusConfig[tool.status] || statusConfig.available).class} rounded-full text-xs font-bold uppercase px-2`}>
                      {(statusConfig[tool.status] || statusConfig.available).label}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{tool.description}</p>
                  <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                    <span>{tool.category}</span>
                    {tool.serial_number && <span>SN: {tool.serial_number}</span>}
                    <span>Condition: {tool.condition}</span>
                  </div>
                  {tool.current_holder_name && (
                    <p className="text-xs mt-1"><span className="text-muted-foreground">With:</span> <span className="font-medium">{tool.current_holder_name}</span> {tool.current_site && `at ${tool.current_site}`}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-3" data-testid="quick-actions">
            {tool.status === "available" && (
              <Button onClick={() => setShowCheckout(true)} className="bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase text-xs font-bold tracking-wider h-14 flex flex-col gap-1" data-testid="quick-checkout-btn">
                <ArrowRight size={18} />
                <span>Check Out</span>
              </Button>
            )}
            {tool.status === "checked_out" && (
              <>
                <Button onClick={() => setShowReturn(true)} className="bg-emerald-600 text-white hover:bg-emerald-700 rounded-none uppercase text-xs font-bold tracking-wider h-14 flex flex-col gap-1" data-testid="quick-return-btn">
                  <RotateCcw size={18} />
                  <span>Return</span>
                </Button>
                <Button onClick={() => setShowHandover(true)} variant="outline" className="rounded-none uppercase text-xs font-bold tracking-wider border-2 h-14 flex flex-col gap-1" data-testid="quick-handover-btn">
                  <Users size={18} />
                  <span>Handover</span>
                </Button>
              </>
            )}
            {tool.status === "maintenance_required" && (
              <div className="col-span-2 p-4 border-2 border-rose-500/30 bg-rose-500/5 text-center">
                <AlertTriangle size={24} className="mx-auto text-rose-500 mb-2" />
                <p className="text-sm font-bold text-rose-500 uppercase">Requires Maintenance</p>
                <p className="text-xs text-muted-foreground mt-1">This tool cannot be checked out until maintenance is completed</p>
              </div>
            )}
            <Button onClick={() => navigate(`/tools/${tool.id}`)} variant="outline" className="rounded-none uppercase text-xs font-bold tracking-wider border-2 h-14 flex flex-col gap-1" data-testid="quick-view-detail-btn">
              <QrCode size={18} />
              <span>Full Details</span>
            </Button>
            <Button onClick={resetScanner} variant="outline" className="rounded-none uppercase text-xs font-bold tracking-wider border-2 h-14 flex flex-col gap-1" data-testid="scan-next-btn">
              <Camera size={18} />
              <span>Scan Next</span>
            </Button>
          </div>
        </div>
      )}

      {/* Checkout Dialog */}
      <Dialog open={showCheckout} onOpenChange={setShowCheckout}>
        <DialogContent className="rounded-sm">
          <DialogHeader><DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">Quick Checkout - {tool?.asset_id}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs uppercase tracking-wider font-bold">Job Number *</Label><Input data-testid="qr-checkout-job" className="rounded-none border-2 mt-1" value={checkoutData.job_number} onChange={e => setCheckoutData({...checkoutData, job_number: e.target.value})} /></div>
            <div><Label className="text-xs uppercase tracking-wider font-bold">Site *</Label><Input data-testid="qr-checkout-site" className="rounded-none border-2 mt-1" value={checkoutData.site} onChange={e => setCheckoutData({...checkoutData, site: e.target.value})} /></div>
            <div><Label className="text-xs uppercase tracking-wider font-bold">Site Manager *</Label><Input data-testid="qr-checkout-manager" className="rounded-none border-2 mt-1" value={checkoutData.site_manager} onChange={e => setCheckoutData({...checkoutData, site_manager: e.target.value})} /></div>
            <div><Label className="text-xs uppercase tracking-wider font-bold">Expected Return *</Label><Input data-testid="qr-checkout-date" type="date" className="rounded-none border-2 mt-1" value={checkoutData.expected_return_date} onChange={e => setCheckoutData({...checkoutData, expected_return_date: e.target.value})} /></div>
            <div><Label className="text-xs uppercase tracking-wider font-bold">Notes</Label><Textarea data-testid="qr-checkout-notes" className="rounded-none border-2 mt-1" rows={2} value={checkoutData.notes} onChange={e => setCheckoutData({...checkoutData, notes: e.target.value})} /></div>
            <Button onClick={handleCheckout} className="w-full bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase font-bold tracking-wider h-12" data-testid="qr-confirm-checkout">Confirm Checkout</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Return Dialog */}
      <Dialog open={showReturn} onOpenChange={setShowReturn}>
        <DialogContent className="rounded-sm">
          <DialogHeader><DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">Quick Return - {tool?.asset_id}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs uppercase tracking-wider font-bold">Condition</Label>
              <Select value={returnData.condition} onValueChange={v => setReturnData({...returnData, condition: v})}>
                <SelectTrigger className="rounded-none border-2 mt-1" data-testid="qr-return-condition"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="fair">Fair</SelectItem>
                  <SelectItem value="damaged">Damaged (needs maintenance)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs uppercase tracking-wider font-bold">Notes</Label><Textarea data-testid="qr-return-notes" className="rounded-none border-2 mt-1" rows={2} value={returnData.notes} onChange={e => setReturnData({...returnData, notes: e.target.value})} /></div>
            <Button onClick={handleReturn} className="w-full bg-emerald-600 text-white hover:bg-emerald-700 rounded-none uppercase font-bold tracking-wider h-12" data-testid="qr-confirm-return">Confirm Return</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Handover Dialog */}
      <Dialog open={showHandover} onOpenChange={setShowHandover}>
        <DialogContent className="rounded-sm">
          <DialogHeader><DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">Quick Handover - {tool?.asset_id}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs uppercase tracking-wider font-bold">Hand To *</Label>
              <Select value={handoverData.next_holder_id} onValueChange={v => setHandoverData({...handoverData, next_holder_id: v})}>
                <SelectTrigger className="rounded-none border-2 mt-1" data-testid="qr-handover-user"><SelectValue placeholder="Select user" /></SelectTrigger>
                <SelectContent>{allUsers.filter(u => u.id !== user?.id).map(u => <SelectItem key={u.id} value={u.id}>{u.name} ({u.role})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs uppercase tracking-wider font-bold">Job Number *</Label><Input data-testid="qr-handover-job" className="rounded-none border-2 mt-1" value={handoverData.job_number} onChange={e => setHandoverData({...handoverData, job_number: e.target.value})} /></div>
            <div><Label className="text-xs uppercase tracking-wider font-bold">Site Manager *</Label><Input data-testid="qr-handover-manager" className="rounded-none border-2 mt-1" value={handoverData.site_manager} onChange={e => setHandoverData({...handoverData, site_manager: e.target.value})} /></div>
            <div><Label className="text-xs uppercase tracking-wider font-bold">Notes</Label><Textarea data-testid="qr-handover-notes" className="rounded-none border-2 mt-1" rows={2} value={handoverData.notes} onChange={e => setHandoverData({...handoverData, notes: e.target.value})} /></div>
            <Button onClick={handleHandover} className="w-full bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase font-bold tracking-wider h-12" data-testid="qr-confirm-handover">Confirm Handover</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
