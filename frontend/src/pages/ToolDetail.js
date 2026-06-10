import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle,
  Clock,
  FileText,
  ImageIcon,
  QrCode,
  Printer,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Upload,
  Users as UsersIcon,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToolCertificates } from "@/components/ToolCertificates";

const EMPTY_CHECKOUT = {
  job_number: "",
  site: "",
  site_manager: "",
  expected_return_date: "",
  notes: "",
};

const EMPTY_RETURN = {
  condition: "good",
  notes: "",
};

const EMPTY_HANDOVER = {
  next_holder_id: "",
  job_number: "",
  site_manager: "",
  notes: "",
};

const EMPTY_MAINTENANCE = {
  action_type: "inspection",
  description: "",
  safety_tag_expiry: "",
  next_maintenance_date: "",
  condition: "",
};

const STATUS_CONFIG = {
  available: {
    label: "Available",
    className: "border-emerald-500/20 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    icon: CheckCircle,
    tone: "green",
  },
  checked_out: {
    label: "Checked Out",
    className: "border-blue-500/20 bg-blue-500/15 text-blue-600 dark:text-blue-400",
    icon: UsersIcon,
    tone: "blue",
  },
  maintenance_required: {
    label: "Maintenance Required",
    className: "border-rose-500/20 bg-rose-500/15 text-rose-600 dark:text-rose-400",
    icon: ShieldAlert,
    tone: "red",
  },
};

const CONDITION_CONFIG = {
  good: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  fair: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  poor: "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  damaged: "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

const AUDIT_DOT = {
  created: "bg-muted-foreground",
  updated: "bg-blue-500",
  checkout: "bg-blue-500",
  return: "bg-emerald-500",
  handover: "bg-amber-500",
  maintenance: "bg-rose-500",
  photo_upload: "bg-purple-500",
  certificate_added: "bg-emerald-500",
  deleted: "bg-rose-500",
};

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function clean(value) {
  return String(value || "").trim();
}

function errorMessage(error, fallback) {
  return error?.response?.data?.detail || fallback;
}

function formatStatus(value) {
  return STATUS_CONFIG[value]?.label || String(value || "Unknown").replace(/_/g, " ");
}

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

  return date.toLocaleDateString("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isPastDate(value) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return date < today;
}

function daysUntil(value) {
  if (!value) return null;

  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function resolveMediaUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;

  if (url.startsWith("/api")) {
    const base = process.env.REACT_APP_BACKEND_URL || api.defaults?.baseURL || "";
    const cleanBase = String(base || "").replace(/\/api\/?$/, "");
    return cleanBase ? `${cleanBase}${url}` : url;
  }

  return url;
}

function getUserRoleLabel(role) {
  return String(role || "worker").replace(/_/g, " ");
}

function FieldError({ message }) {
  if (!message) return null;

  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
      <AlertTriangle size={12} />
      {message}
    </p>
  );
}

function LoadingToolDetail() {
  return (
    <div className="space-y-4" data-testid="tool-detail-loading">
      <div className="h-10 w-40 animate-pulse rounded-sm bg-muted" />
      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="h-72 animate-pulse rounded-sm bg-muted" />
        <div className="h-72 animate-pulse rounded-sm bg-muted" />
      </div>
      <div className="h-48 animate-pulse rounded-sm bg-muted" />
    </div>
  );
}

function DetailItem({ label, value, mono = false, danger = false }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className={`mt-0.5 truncate text-sm font-bold ${mono ? "font-['JetBrains_Mono']" : ""} ${danger ? "text-rose-500" : ""}`}>
        {value || "-"}
      </p>
    </div>
  );
}

function HealthCard({ icon: Icon, title, value, tone = "default", description }) {
  const toneClass = {
    default: "border-border bg-card text-muted-foreground",
    green: "border-emerald-500/30 bg-emerald-500/5 text-emerald-500",
    blue: "border-blue-500/30 bg-blue-500/5 text-blue-500",
    amber: "border-amber-500/30 bg-amber-500/5 text-amber-500",
    red: "border-rose-500/30 bg-rose-500/5 text-rose-500",
  }[tone];

  return (
    <Card className={`rounded-sm border-2 shadow-none ${toneClass}`}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">
            {title}
          </p>
          <p className="mt-1 truncate text-sm font-bold text-foreground">{value}</p>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
        <Icon size={22} className="shrink-0" />
      </CardContent>
    </Card>
  );
}

function EmptyPanel({ icon: Icon, title, description }) {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center border border-dashed border-border bg-background/50 p-6 text-center">
      <Icon size={30} className="mb-3 text-muted-foreground" />
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function RequiredLabel({ children }) {
  return (
    <Label className="text-xs font-black uppercase tracking-wider">
      {children} <span className="text-destructive">*</span>
    </Label>
  );
}

export default function ToolDetail() {
  const { toolId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tool, setTool] = useState(null);
  const [qrCode, setQrCode] = useState("");
  const [audit, setAudit] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [errors, setErrors] = useState({});

  const [showCheckout, setShowCheckout] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [showHandover, setShowHandover] = useState(false);
  const [showMaintenance, setShowMaintenance] = useState(false);

  const [checkoutData, setCheckoutData] = useState({
    ...EMPTY_CHECKOUT,
    expected_return_date: addDays(7),
  });
  const [returnData, setReturnData] = useState(EMPTY_RETURN);
  const [handoverData, setHandoverData] = useState(EMPTY_HANDOVER);
  const [maintData, setMaintData] = useState(EMPTY_MAINTENANCE);

  const canManage = user?.role === "admin" || user?.role === "site_manager";

  const handlePrintQrLabel = useCallback(() => {
    if (!tool || !qrCode) {
      toast.error("QR code is not ready to print yet.");
      return;
    }

    const htmlEscape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[char]));

    const safeAssetId = htmlEscape(tool.asset_id || "Tool");
    const safeDescription = htmlEscape(tool.description || "");
    const safeToolName = safeDescription || safeAssetId;
    const isPowerTool = String(tool.category || "").trim().toLowerCase() === "power tools";
    const labelPageSize = "A4";
    const labelSheetWidth = isPowerTool ? "58mm" : "70mm";
    const labelSheetHeight = isPowerTool ? "32mm" : "38mm";
    const labelPadding = isPowerTool ? "2.5mm" : "3mm";
    const qrSize = isPowerTool ? "22mm" : "26mm";
    const toolNameFontSize = isPowerTool ? "10.5pt" : "12pt";
    const assetIdFontSize = isPowerTool ? "8pt" : "9pt";
    const printWindow = window.open("", "_blank", "width=520,height=720");

    if (!printWindow) {
      toast.error("Pop-up blocked. Allow pop-ups to print QR labels.");
      return;
    }

    const labelHtml = [
      "<!doctype html>",
      "<html>",
      "<head>",
      "<meta charset='utf-8' />",
      "<title>QR Label - " + safeAssetId + "</title>",
      "<style>",
      "@page { size: " + labelPageSize + "; margin: 8mm; }",
      "html, body { width: 100%; min-height: 0; margin: 0; padding: 0; background: #fff; color: #111; font-family: Arial, Helvetica, sans-serif; overflow: hidden; }",
      "body { box-sizing: border-box; }",
      ".sheet { width: " + labelSheetWidth + "; height: " + labelSheetHeight + "; box-sizing: border-box; border: 2px solid #111; padding: " + labelPadding + "; display: flex; gap: 3mm; align-items: center; page-break-inside: avoid; break-inside: avoid; overflow: hidden; }",
      ".qr { width: " + qrSize + "; height: " + qrSize + "; object-fit: contain; flex: 0 0 auto; }",
      ".meta { min-width: 0; flex: 1; overflow: hidden; }",
      ".tool-name { font-size: " + toolNameFontSize + "; font-weight: 900; line-height: 1.05; margin: 0 0 1.5mm 0; word-break: break-word; max-height: 16mm; overflow: hidden; }",
      ".asset-id { font-size: " + assetIdFontSize + "; font-weight: 800; line-height: 1.05; margin: 0; text-transform: uppercase; letter-spacing: 0.04em; word-break: break-word; }",
      ".actions { margin: 12px; display: flex; gap: 8px; }",
      ".actions button { border: 2px solid #111; background: #fff; padding: 8px 12px; font-weight: 800; text-transform: uppercase; cursor: pointer; }",
      "@media print { html, body { width: 100%; height: auto; overflow: hidden !important; } .actions { display: none !important; } .sheet { margin: 0; page-break-after: avoid; break-after: avoid; page-break-inside: avoid; break-inside: avoid; } }",
      "</style>",
      "</head>",
      "<body>",
      "<div class='actions'><button onclick='window.print()'>Print</button><button onclick='window.close()'>Close</button></div>",
      "<section class='sheet' aria-label='Tool Tracker QR label'>",
      "<img class='qr' src='" + qrCode + "' alt='QR code' />",
      "<div class='meta'>",
      "<p class='tool-name'>" + safeToolName + "</p>",
      "<p class='asset-id'>" + safeAssetId + "</p>",
      "</div>",
      "</section>",
      "<script>window.onload=function(){setTimeout(function(){window.print();},250);};window.onafterprint=function(){window.close();};<\/script>",
      "</body>",
      "</html>"
    ].join("");

    printWindow.document.open();
    printWindow.document.write(labelHtml);
    printWindow.document.close();
  }, [qrCode, tool]);

  const loadToolDetail = useCallback(async ({ showRefresh = false } = {}) => {
    if (showRefresh) setRefreshing(true);
    setErrors({});

    try {
      const [toolResult, qrResult, auditResult, usersResult] = await Promise.allSettled([
        api.get(`/tools/${toolId}`),
        api.get(`/tools/${toolId}/qr`),
        api.get(`/audit/${toolId}`),
        api.get("/users"),
      ]);

      if (toolResult.status !== "fulfilled") {
        throw toolResult.reason;
      }

      setTool(toolResult.value.data);
      setQrCode(qrResult.status === "fulfilled" ? qrResult.value.data?.qr_code || "" : "");
      setAudit(auditResult.status === "fulfilled" && Array.isArray(auditResult.value.data) ? auditResult.value.data : []);
      setAllUsers(usersResult.status === "fulfilled" && Array.isArray(usersResult.value.data) ? usersResult.value.data : []);
    } catch (error) {
      toast.error(errorMessage(error, "Failed to load tool."));
      setTool(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toolId]);

  const reloadToolAndAudit = useCallback(async () => {
    const [toolResponse, auditResponse] = await Promise.all([
      api.get(`/tools/${toolId}`),
      api.get(`/audit/${toolId}`),
    ]);

    setTool(toolResponse.data);
    setAudit(Array.isArray(auditResponse.data) ? auditResponse.data : []);
  }, [toolId]);

  useEffect(() => {
    loadToolDetail();
  }, [loadToolDetail]);

  const statusConfig = STATUS_CONFIG[tool?.status] || {
    label: formatStatus(tool?.status),
    className: "border-border bg-muted text-muted-foreground",
    icon: Wrench,
    tone: "default",
  };

  const safetyDays = useMemo(() => daysUntil(tool?.safety_tag_expiry), [tool?.safety_tag_expiry]);
  const maintenanceDays = useMemo(() => daysUntil(tool?.next_maintenance_date), [tool?.next_maintenance_date]);

  const activeUsers = useMemo(() => {
    return allUsers.filter((item) => item?.is_active !== false && item?.id !== user?.id);
  }, [allUsers, user?.id]);

  const updateCheckout = (field, value) => {
    setCheckoutData((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [`checkout_${field}`]: "" }));
  };

  const updateReturn = (field, value) => {
    setReturnData((current) => ({ ...current, [field]: value }));
  };

  const updateHandover = (field, value) => {
    setHandoverData((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [`handover_${field}`]: "" }));
  };

  const updateMaintenance = (field, value) => {
    setMaintData((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [`maint_${field}`]: "" }));
  };

  const resetCheckout = () => {
    setCheckoutData({ ...EMPTY_CHECKOUT, expected_return_date: addDays(7) });
    setErrors({});
    setShowCheckout(false);
  };

  const resetReturn = () => {
    setReturnData(EMPTY_RETURN);
    setShowReturn(false);
  };

  const resetHandover = () => {
    setHandoverData(EMPTY_HANDOVER);
    setErrors({});
    setShowHandover(false);
  };

  const resetMaintenance = () => {
    setMaintData(EMPTY_MAINTENANCE);
    setErrors({});
    setShowMaintenance(false);
  };

  const validateCheckout = () => {
    const nextErrors = {};

    if (!clean(checkoutData.job_number)) nextErrors.checkout_job_number = "Job number is required.";
    if (!clean(checkoutData.site)) nextErrors.checkout_site = "Site is required.";
    if (!clean(checkoutData.site_manager)) nextErrors.checkout_site_manager = "Site manager is required.";
    if (!checkoutData.expected_return_date) nextErrors.checkout_expected_return_date = "Expected return date is required.";
    if (checkoutData.expected_return_date && checkoutData.expected_return_date < todayDate()) {
      nextErrors.checkout_expected_return_date = "Expected return date cannot be in the past.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateHandover = () => {
    const nextErrors = {};

    if (!handoverData.next_holder_id) nextErrors.handover_next_holder_id = "Select the next holder.";
    if (!clean(handoverData.job_number)) nextErrors.handover_job_number = "Job number is required.";
    if (!clean(handoverData.site_manager)) nextErrors.handover_site_manager = "Site manager is required.";

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateMaintenance = () => {
    const nextErrors = {};

    if (!clean(maintData.description)) nextErrors.maint_description = "Description is required.";

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handlePhotoUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Only JPEG, PNG, or WebP images are accepted.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Photo is too large. Maximum size is 5MB.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setBusyAction("photo");

    try {
      const response = await api.post(`/tools/${toolId}/photo`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setTool((current) => ({ ...current, photo_url: response.data.photo_url }));
      toast.success("Photo uploaded");
      await reloadToolAndAudit();
    } catch (error) {
      toast.error(errorMessage(error, "Photo upload failed."));
    } finally {
      setBusyAction("");
    }
  };

  const handleCheckout = async () => {
    if (!validateCheckout()) return;

    setBusyAction("checkout");

    try {
      await api.post("/checkout", {
        tool_id: toolId,
        job_number: clean(checkoutData.job_number),
        site: clean(checkoutData.site),
        site_manager: clean(checkoutData.site_manager),
        expected_return_date: checkoutData.expected_return_date,
        notes: clean(checkoutData.notes),
      });

      toast.success("Tool checked out");
      resetCheckout();
      await reloadToolAndAudit();
    } catch (error) {
      toast.error(errorMessage(error, "Checkout failed."));
    } finally {
      setBusyAction("");
    }
  };

  const handleReturn = async () => {
    setBusyAction("return");

    try {
      await api.post("/return", {
        tool_id: toolId,
        condition: returnData.condition,
        notes: clean(returnData.notes),
      });

      toast.success(returnData.condition === "damaged" ? "Tool returned and marked for maintenance" : "Tool returned");
      resetReturn();
      await reloadToolAndAudit();
    } catch (error) {
      toast.error(errorMessage(error, "Return failed."));
    } finally {
      setBusyAction("");
    }
  };

  const handleHandover = async () => {
    if (!validateHandover()) return;

    setBusyAction("handover");

    try {
      await api.post("/handover", {
        tool_id: toolId,
        next_holder_id: handoverData.next_holder_id,
        job_number: clean(handoverData.job_number),
        site_manager: clean(handoverData.site_manager),
        notes: clean(handoverData.notes),
      });

      toast.success("Handover complete");
      resetHandover();
      await reloadToolAndAudit();
    } catch (error) {
      toast.error(errorMessage(error, "Handover failed."));
    } finally {
      setBusyAction("");
    }
  };

  const handleMaintenance = async () => {
    if (!validateMaintenance()) return;

    setBusyAction("maintenance");

    try {
      await api.post("/maintenance", {
        tool_id: toolId,
        action_type: maintData.action_type,
        description: clean(maintData.description),
        safety_tag_expiry: maintData.safety_tag_expiry || null,
        next_maintenance_date: maintData.next_maintenance_date || null,
        condition: maintData.condition || null,
      });

      toast.success("Maintenance recorded");
      resetMaintenance();
      await reloadToolAndAudit();
    } catch (error) {
      toast.error(errorMessage(error, "Failed to record maintenance."));
    } finally {
      setBusyAction("");
    }
  };

  if (loading) return <LoadingToolDetail />;

  if (!tool) {
    return (
      <Card className="rounded-sm border-2 border-rose-500/30 bg-rose-500/5 shadow-none" data-testid="tool-not-found">
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle size={24} className="mt-0.5 shrink-0 text-rose-500" />
            <div>
              <p className="font-bold">Tool not found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This tool may have been deleted, or the link may be incorrect.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-fit rounded-none border-2 text-xs font-black uppercase tracking-wider"
            onClick={() => navigate("/tools")}
          >
            <ArrowLeft size={14} className="mr-2" />
            Back to Tools
          </Button>
        </CardContent>
      </Card>
    );
  }

  const StatusIcon = statusConfig.icon;
  const photoUrl = resolveMediaUrl(tool.photo_url);
  const conditionClass = CONDITION_CONFIG[tool.condition] || CONDITION_CONFIG.good;

  return (
    <div className="space-y-6" data-testid="tool-detail-page">
      <section className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Button
            variant="ghost"
            onClick={() => navigate("/tools")}
            className="-ml-2 mb-4 rounded-none text-xs font-black uppercase tracking-wider"
            data-testid="back-to-tools"
          >
            <ArrowLeft size={14} className="mr-2" />
            Back to Tools
          </Button>

          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-muted-foreground">
              Tool detail
            </p>
            <Badge className={`${statusConfig.className} rounded-full px-3 py-1 text-xs font-black uppercase`}>
              <StatusIcon size={12} className="mr-1" />
              {statusConfig.label}
            </Badge>
          </div>

          <h1 className="mt-1 font-['Barlow_Condensed'] text-4xl font-black uppercase tracking-tight md:text-5xl">
            {tool.asset_id}
          </h1>
          <p className="mt-1 max-w-3xl text-base text-muted-foreground">{tool.description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-10 rounded-none border-2 text-xs font-black uppercase tracking-wider"
            onClick={() => loadToolDetail({ showRefresh: true })}
            disabled={refreshing}
            data-testid="refresh-tool-detail-btn"
          >
            <RefreshCw size={14} className={`mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-10 rounded-none border-2 text-xs font-black uppercase tracking-wider"
            onClick={handlePrintQrLabel}
            disabled={!qrCode}
            data-testid="print-qr-label-btn"
          >
            <Printer size={14} className="mr-2" />
            Print QR Label
          </Button>

          {tool.status === "available" && (
            <Dialog open={showCheckout} onOpenChange={(open) => (open ? setShowCheckout(true) : resetCheckout())}>
              <DialogTrigger asChild>
                <Button
                  className="h-10 rounded-none bg-[hsl(38,92%,50%)] text-xs font-black uppercase tracking-wider text-black hover:bg-[hsl(38,92%,45%)]"
                  data-testid="checkout-btn"
                >
                  <ArrowRight size={14} className="mr-2" />
                  Check Out
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-sm">
                <DialogHeader>
                  <DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">
                    Check Out Tool
                  </DialogTitle>
                </DialogHeader>

                <div className="grid gap-3">
                  <div>
                    <RequiredLabel>Job Number</RequiredLabel>
                    <Input
                      data-testid="checkout-job"
                      className="mt-1 rounded-none border-2"
                      value={checkoutData.job_number}
                      onChange={(event) => updateCheckout("job_number", event.target.value)}
                    />
                    <FieldError message={errors.checkout_job_number} />
                  </div>

                  <div>
                    <RequiredLabel>Site</RequiredLabel>
                    <Input
                      data-testid="checkout-site"
                      className="mt-1 rounded-none border-2"
                      value={checkoutData.site}
                      onChange={(event) => updateCheckout("site", event.target.value)}
                    />
                    <FieldError message={errors.checkout_site} />
                  </div>

                  <div>
                    <RequiredLabel>Site Manager</RequiredLabel>
                    <Input
                      data-testid="checkout-manager"
                      className="mt-1 rounded-none border-2"
                      value={checkoutData.site_manager}
                      onChange={(event) => updateCheckout("site_manager", event.target.value)}
                    />
                    <FieldError message={errors.checkout_site_manager} />
                  </div>

                  <div>
                    <RequiredLabel>Expected Return</RequiredLabel>
                    <Input
                      data-testid="checkout-return-date"
                      type="date"
                      className="mt-1 rounded-none border-2"
                      value={checkoutData.expected_return_date}
                      onChange={(event) => updateCheckout("expected_return_date", event.target.value)}
                    />
                    <FieldError message={errors.checkout_expected_return_date} />
                  </div>

                  <div>
                    <Label className="text-xs font-black uppercase tracking-wider">Notes</Label>
                    <Textarea
                      data-testid="checkout-notes"
                      className="mt-1 rounded-none border-2"
                      rows={2}
                      value={checkoutData.notes}
                      onChange={(event) => updateCheckout("notes", event.target.value)}
                    />
                  </div>

                  <Button
                    onClick={handleCheckout}
                    disabled={busyAction === "checkout"}
                    className="h-11 rounded-none bg-[hsl(38,92%,50%)] text-xs font-black uppercase tracking-wider text-black hover:bg-[hsl(38,92%,45%)]"
                    data-testid="confirm-checkout-btn"
                  >
                    {busyAction === "checkout" ? "Checking Out..." : "Confirm Checkout"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {tool.status === "checked_out" && (
            <>
              <Dialog open={showReturn} onOpenChange={(open) => (open ? setShowReturn(true) : resetReturn())}>
                <DialogTrigger asChild>
                  <Button
                    className="h-10 rounded-none bg-emerald-600 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-700"
                    data-testid="return-btn"
                  >
                    <RotateCcw size={14} className="mr-2" />
                    Return
                  </Button>
                </DialogTrigger>
                <DialogContent className="rounded-sm">
                  <DialogHeader>
                    <DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">
                      Return Tool
                    </DialogTitle>
                  </DialogHeader>

                  <div className="grid gap-3">
                    <div>
                      <Label className="text-xs font-black uppercase tracking-wider">Condition</Label>
                      <Select value={returnData.condition} onValueChange={(value) => updateReturn("condition", value)}>
                        <SelectTrigger className="mt-1 rounded-none border-2" data-testid="return-condition">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="good">Good</SelectItem>
                          <SelectItem value="fair">Fair</SelectItem>
                          <SelectItem value="damaged">Damaged / Needs Maintenance</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs font-black uppercase tracking-wider">Notes</Label>
                      <Textarea
                        data-testid="return-notes"
                        className="mt-1 rounded-none border-2"
                        rows={2}
                        value={returnData.notes}
                        onChange={(event) => updateReturn("notes", event.target.value)}
                      />
                    </div>

                    <Button
                      onClick={handleReturn}
                      disabled={busyAction === "return"}
                      className="h-11 rounded-none bg-emerald-600 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-700"
                      data-testid="confirm-return-btn"
                    >
                      {busyAction === "return" ? "Returning..." : "Confirm Return"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={showHandover} onOpenChange={(open) => (open ? setShowHandover(true) : resetHandover())}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-10 rounded-none border-2 text-xs font-black uppercase tracking-wider"
                    data-testid="handover-btn"
                  >
                    <UsersIcon size={14} className="mr-2" />
                    Handover
                  </Button>
                </DialogTrigger>
                <DialogContent className="rounded-sm">
                  <DialogHeader>
                    <DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">
                      Handover Tool
                    </DialogTitle>
                  </DialogHeader>

                  <div className="grid gap-3">
                    <div>
                      <RequiredLabel>Hand To</RequiredLabel>
                      <Select value={handoverData.next_holder_id} onValueChange={(value) => updateHandover("next_holder_id", value)}>
                        <SelectTrigger className="mt-1 rounded-none border-2" data-testid="handover-user">
                          <SelectValue placeholder="Select user" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeUsers.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name} ({getUserRoleLabel(item.role)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldError message={errors.handover_next_holder_id} />
                    </div>

                    <div>
                      <RequiredLabel>Job Number</RequiredLabel>
                      <Input
                        data-testid="handover-job"
                        className="mt-1 rounded-none border-2"
                        value={handoverData.job_number}
                        onChange={(event) => updateHandover("job_number", event.target.value)}
                      />
                      <FieldError message={errors.handover_job_number} />
                    </div>

                    <div>
                      <RequiredLabel>Site Manager</RequiredLabel>
                      <Input
                        data-testid="handover-manager"
                        className="mt-1 rounded-none border-2"
                        value={handoverData.site_manager}
                        onChange={(event) => updateHandover("site_manager", event.target.value)}
                      />
                      <FieldError message={errors.handover_site_manager} />
                    </div>

                    <div>
                      <Label className="text-xs font-black uppercase tracking-wider">Notes</Label>
                      <Textarea
                        data-testid="handover-notes"
                        className="mt-1 rounded-none border-2"
                        rows={2}
                        value={handoverData.notes}
                        onChange={(event) => updateHandover("notes", event.target.value)}
                      />
                    </div>

                    <Button
                      onClick={handleHandover}
                      disabled={busyAction === "handover"}
                      className="h-11 rounded-none bg-[hsl(38,92%,50%)] text-xs font-black uppercase tracking-wider text-black hover:bg-[hsl(38,92%,45%)]"
                      data-testid="confirm-handover-btn"
                    >
                      {busyAction === "handover" ? "Handing Over..." : "Confirm Handover"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}

          {canManage && (
            <Dialog open={showMaintenance} onOpenChange={(open) => (open ? setShowMaintenance(true) : resetMaintenance())}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="h-10 rounded-none border-2 text-xs font-black uppercase tracking-wider"
                  data-testid="maintenance-btn"
                >
                  <Wrench size={14} className="mr-2" />
                  Maintenance
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-sm">
                <DialogHeader>
                  <DialogTitle className="font-['Barlow_Condensed'] text-xl uppercase">
                    Record Maintenance
                  </DialogTitle>
                </DialogHeader>

                <div className="grid gap-3">
                  <div>
                    <Label className="text-xs font-black uppercase tracking-wider">Action Type</Label>
                    <Select value={maintData.action_type} onValueChange={(value) => updateMaintenance("action_type", value)}>
                      <SelectTrigger className="mt-1 rounded-none border-2" data-testid="maint-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inspection">Inspection</SelectItem>
                        <SelectItem value="repair">Repair</SelectItem>
                        <SelectItem value="calibration">Calibration</SelectItem>
                        <SelectItem value="tag_renewal">Tag Renewal</SelectItem>
                        <SelectItem value="completed">Mark Completed / Return Available</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <RequiredLabel>Description</RequiredLabel>
                    <Textarea
                      data-testid="maint-description"
                      className="mt-1 rounded-none border-2"
                      rows={3}
                      value={maintData.description}
                      onChange={(event) => updateMaintenance("description", event.target.value)}
                    />
                    <FieldError message={errors.maint_description} />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label className="text-xs font-black uppercase tracking-wider">New Tag Expiry</Label>
                      <Input
                        data-testid="maint-tag"
                        type="date"
                        className="mt-1 rounded-none border-2"
                        value={maintData.safety_tag_expiry}
                        onChange={(event) => updateMaintenance("safety_tag_expiry", event.target.value)}
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-black uppercase tracking-wider">Next Maintenance</Label>
                      <Input
                        data-testid="maint-next"
                        type="date"
                        className="mt-1 rounded-none border-2"
                        value={maintData.next_maintenance_date}
                        onChange={(event) => updateMaintenance("next_maintenance_date", event.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-black uppercase tracking-wider">Condition After Action</Label>
                    <Select value={maintData.condition || "unchanged"} onValueChange={(value) => updateMaintenance("condition", value === "unchanged" ? "" : value)}>
                      <SelectTrigger className="mt-1 rounded-none border-2" data-testid="maint-condition">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unchanged">Leave Unchanged</SelectItem>
                        <SelectItem value="good">Good</SelectItem>
                        <SelectItem value="fair">Fair</SelectItem>
                        <SelectItem value="damaged">Damaged</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={handleMaintenance}
                    disabled={busyAction === "maintenance"}
                    className="h-11 rounded-none bg-[hsl(38,92%,50%)] text-xs font-black uppercase tracking-wider text-black hover:bg-[hsl(38,92%,45%)]"
                    data-testid="confirm-maint-btn"
                  >
                    {busyAction === "maintenance" ? "Saving..." : "Save Maintenance Record"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <HealthCard
              icon={statusConfig.icon}
              title="Current Status"
              value={statusConfig.label}
              tone={statusConfig.tone}
              description={tool.status === "checked_out" ? "Tool is currently in use" : tool.status === "available" ? "Ready for checkout" : "Action required before checkout"}
            />
            <HealthCard
              icon={ShieldCheck}
              title="Safety Tag"
              value={tool.safety_tag_expiry ? formatDate(tool.safety_tag_expiry) : "Not Set"}
              tone={safetyDays === null ? "default" : safetyDays < 0 ? "red" : safetyDays <= 14 ? "amber" : "green"}
              description={safetyDays === null ? "No expiry recorded" : safetyDays < 0 ? `${Math.abs(safetyDays)} days overdue` : `${safetyDays} days remaining`}
            />
            <HealthCard
              icon={Wrench}
              title="Maintenance"
              value={tool.next_maintenance_date ? formatDate(tool.next_maintenance_date) : "Not Set"}
              tone={maintenanceDays === null ? "default" : maintenanceDays < 0 ? "red" : maintenanceDays <= 14 ? "amber" : "green"}
              description={maintenanceDays === null ? "No date recorded" : maintenanceDays < 0 ? `${Math.abs(maintenanceDays)} days overdue` : `${maintenanceDays} days remaining`}
            />
          </section>

          <Card className="rounded-sm border border-border shadow-none" data-testid="tool-summary-card">
            <CardHeader className="pb-2">
              <CardTitle className="font-['Barlow_Condensed'] text-xl uppercase tracking-tight">
                Tool Information
              </CardTitle>
            </CardHeader>

            <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <DetailItem label="Category" value={tool.category} />
              <DetailItem label="Model" value={tool.model_name} />
              <DetailItem label="Serial" value={tool.serial_number} mono />
              <DetailItem label="Condition" value={tool.condition} danger={tool.condition === "damaged" || tool.condition === "poor"} />
              <DetailItem label="Safety Tag" value={formatDate(tool.safety_tag_expiry)} danger={isPastDate(tool.safety_tag_expiry)} />
              <DetailItem label="Next Maintenance" value={formatDate(tool.next_maintenance_date)} danger={isPastDate(tool.next_maintenance_date)} />

              {tool.notes && (
                <div className="col-span-2 md:col-span-3">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Notes
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{tool.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {tool.current_holder_name && (
            <Card className="rounded-sm border-2 border-blue-500/30 bg-blue-500/5 shadow-none" data-testid="current-holder-card">
              <CardContent className="flex items-start gap-3 p-4">
                <UsersIcon size={22} className="mt-0.5 shrink-0 text-blue-500" />
                <div className="min-w-0">
                  <p className="text-sm font-bold">
                    Currently with: <span>{tool.current_holder_name}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {tool.current_site ? `Site: ${tool.current_site}` : "Site not recorded"}
                    {tool.current_job ? ` | Job: ${tool.current_job}` : ""}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <ToolCertificates toolId={toolId} />

          <Card className="rounded-sm border border-border shadow-none" data-testid="audit-trail">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2 font-['Barlow_Condensed'] text-xl uppercase tracking-tight">
                <FileText size={17} />
                Audit Trail
              </CardTitle>
              <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px] uppercase">
                {audit.length} records
              </Badge>
            </CardHeader>

            <CardContent>
              {audit.length > 0 ? (
                <div className="divide-y divide-border">
                  {audit.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 py-3 text-sm">
                      <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${AUDIT_DOT[item.action] || "bg-muted-foreground"}`} />
                      <div className="min-w-0 flex-1">
                        <p>
                          <span className="font-bold">{item.user_name || "System"}</span>{" "}
                          <span className="text-muted-foreground">{item.details || "recorded activity"}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDateTime(item.timestamp)}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0 rounded-full px-2 py-0 text-[10px] uppercase">
                        {String(item.action || "").replace(/_/g, " ")}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyPanel
                  icon={FileText}
                  title="No activity recorded"
                  description="Checkout, return, handover, maintenance, photo, and certificate actions will appear here."
                />
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="rounded-sm border border-border shadow-none" data-testid="tool-photo-card">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-['Barlow_Condensed'] text-lg uppercase tracking-tight">
                <Camera size={16} />
                Tool Photo
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={tool.description}
                  className="h-44 w-full object-cover"
                  data-testid="tool-photo"
                />
              ) : (
                <div className="flex h-44 w-full items-center justify-center bg-muted">
                  <ImageIcon size={38} className="text-muted-foreground" />
                </div>
              )}

              <label className="block">
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handlePhotoUpload}
                  data-testid="photo-upload-input"
                  disabled={busyAction === "photo"}
                />
                <span className="inline-flex h-10 w-full cursor-pointer items-center justify-center border-2 border-border bg-background text-xs font-black uppercase tracking-wider transition-colors hover:bg-accent">
                  <Upload size={14} className="mr-2" />
                  {busyAction === "photo" ? "Uploading..." : "Upload Photo"}
                </span>
              </label>

              <p className="text-xs text-muted-foreground">
                JPEG, PNG, or WebP. Maximum 5MB.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-sm border border-border shadow-none" data-testid="qr-code-card">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-['Barlow_Condensed'] text-lg uppercase tracking-tight">
                <QrCode size={16} />
                QR Code
              </CardTitle>
            </CardHeader>

            <CardContent className="text-center">
              {qrCode ? (
                <img src={qrCode} alt="QR Code" className="mx-auto w-full max-w-[220px]" data-testid="qr-code-image" />
              ) : (
                <div className="flex h-48 items-center justify-center border border-dashed border-border">
                  <QrCode size={40} className="text-muted-foreground" />
                </div>
              )}
              <p className="mt-3 text-xs font-black uppercase tracking-wider text-muted-foreground">
                Scan to identify
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-sm border border-border shadow-none" data-testid="quick-state-card">
            <CardHeader className="pb-2">
              <CardTitle className="font-['Barlow_Condensed'] text-lg uppercase tracking-tight">
                Quick State
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Status</span>
                <Badge className={`${statusConfig.className} rounded-full px-2 py-0 text-[10px] font-black uppercase`}>
                  {statusConfig.label}
                </Badge>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Condition</span>
                <Badge className={`${conditionClass} rounded-full border px-2 py-0 text-[10px] font-black uppercase`}>
                  {tool.condition || "Unknown"}
                </Badge>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Holder</span>
                <span className="max-w-[150px] truncate text-right text-xs font-bold">
                  {tool.current_holder_name || "-"}
                </span>
              </div>
            </CardContent>
          </Card>
        </aside>
      </section>
    </div>
  );
}
