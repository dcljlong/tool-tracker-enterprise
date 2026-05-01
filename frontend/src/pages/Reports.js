import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Clock,
  Download,
  FileText,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PERIOD_OPTIONS = [
  { value: "day", label: "Today", days: 1 },
  { value: "week", label: "This Week", days: 7 },
];

const REPORT_TYPES = [
  {
    type: "inventory",
    label: "Inventory PDF",
    description: "Full tool register, holder, site, status, and condition.",
    icon: FileText,
    testId: "download-inventory-pdf",
  },
  {
    type: "activity",
    label: "Activity PDF",
    description: "Checkouts, returns, handovers, and maintenance activity.",
    icon: BarChart3,
    testId: "download-activity-pdf",
  },
  {
    type: "overdue",
    label: "Overdue PDF",
    description: "Active overdue tools, holders, sites, and due dates.",
    icon: Clock,
    testId: "download-overdue-pdf",
  },
];

function getNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPeriodConfig(period) {
  return PERIOD_OPTIONS.find((item) => item.value === period) || PERIOD_OPTIONS[1];
}

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }

  return date.toLocaleDateString("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getFilenameFromHeaders(headers, fallback) {
  const disposition = headers?.["content-disposition"] || headers?.["Content-Disposition"];
  const match = disposition?.match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallback;
}

function downloadBlob(blobData, filename, mimeType) {
  const blob = new Blob([blobData], mimeType ? { type: mimeType } : undefined);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.URL.revokeObjectURL(url);
}

function StatCard({ title, value, icon: Icon, tone = "default", description }) {
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
          <p className="mt-1 font-['Barlow_Condensed'] text-3xl font-black leading-none text-foreground">
            {value}
          </p>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <Icon size={24} className="shrink-0" />
      </CardContent>
    </Card>
  );
}

function LoadingReports() {
  return (
    <div className="space-y-4" data-testid="reports-loading">
      <div className="h-24 animate-pulse rounded-sm bg-muted" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-28 animate-pulse rounded-sm bg-muted" />
        ))}
      </div>
      <div className="h-52 animate-pulse rounded-sm bg-muted" />
    </div>
  );
}

function EmptyPanel({ icon: Icon, title, description }) {
  return (
    <div className="flex min-h-[130px] flex-col items-center justify-center border border-dashed border-border bg-background/50 p-6 text-center">
      <Icon size={30} className="mb-3 text-muted-foreground" />
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function TopList({ title, icon: Icon, items, valueLabel, nameKey, valueKey, mono = false }) {
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <Card className="rounded-sm border border-border shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-['Barlow_Condensed'] text-xl uppercase tracking-tight">
          <Icon size={17} />
          {title}
        </CardTitle>
      </CardHeader>

      <CardContent>
        {safeItems.length > 0 ? (
          <div className="divide-y divide-border">
            {safeItems.map((item, index) => (
              <div key={`${item[nameKey] || index}-${index}`} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-6 shrink-0 text-xs font-black text-muted-foreground">
                    {index + 1}.
                  </span>
                  <span className={`truncate text-sm font-bold ${mono ? "font-['JetBrains_Mono']" : ""}`}>
                    {item[nameKey] || "Unknown"}
                  </span>
                </div>
                <Badge variant="outline" className="shrink-0 rounded-full px-2 py-0 text-xs">
                  {getNumber(item[valueKey])} {valueLabel}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <EmptyPanel
            icon={Icon}
            title="No activity in this period"
            description="This panel will populate once checkouts, returns, handovers, or maintenance records are created."
          />
        )}
      </CardContent>
    </Card>
  );
}

export default function Reports() {
  const [period, setPeriod] = useState("week");
  const [summary, setSummary] = useState(null);
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState("");

  const periodConfig = getPeriodConfig(period);

  const loadReports = useCallback(async ({ showRefresh = false } = {}) => {
    if (showRefresh) setRefreshing(true);
    setLoading((current) => (showRefresh ? current : true));

    try {
      const [summaryResponse, activityResponse] = await Promise.all([
        api.get("/reports/summary", { params: { period } }),
        api.get("/reports/tool-activity", { params: { days: periodConfig.days } }),
      ]);

      setSummary(summaryResponse.data || {});
      setActivity(activityResponse.data || {});
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to load reports.");
      setSummary(null);
      setActivity(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, periodConfig.days]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const inventory = summary?.inventory || {};
  const activitySummary = summary?.activity || {};
  const overdueDetails = Array.isArray(summary?.overdue_details) ? summary.overdue_details : [];
  const checkoutDetails = Array.isArray(activity?.checkout_details) ? activity.checkout_details : [];
  const handoverDetails = Array.isArray(activity?.handover_details) ? activity.handover_details : [];
  const maintenanceDetails = Array.isArray(activity?.maintenance_details) ? activity.maintenance_details : [];

  const health = useMemo(() => {
    const overdue = getNumber(summary?.overdue_count);
    const maintenance = getNumber(inventory.maintenance);

    if (overdue > 0) {
      return {
        label: "Overdue Action",
        tone: "amber",
        text: `${overdue} overdue tool(s) require follow-up.`,
      };
    }

    if (maintenance > 0) {
      return {
        label: "Maintenance Action",
        tone: "red",
        text: `${maintenance} tool(s) are marked for maintenance.`,
      };
    }

    return {
      label: "All Clear",
      tone: "green",
      text: "No overdue tools are reported for this period.",
    };
  }, [summary?.overdue_count, inventory.maintenance]);

  const downloadPdf = async (reportType) => {
    setDownloading(reportType);

    try {
      const response = await api.get("/reports/export-pdf", {
        params: { report_type: reportType, days: periodConfig.days },
        responseType: "blob",
      });

      const filename = getFilenameFromHeaders(
        response.headers,
        `${reportType}_report_${new Date().toISOString().slice(0, 10)}.pdf`,
      );

      downloadBlob(response.data, filename, "application/pdf");
      toast.success("PDF downloaded");
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to generate PDF.");
    } finally {
      setDownloading("");
    }
  };

  const downloadCsv = async () => {
    setDownloading("csv");

    try {
      const response = await api.get("/reports/export", {
        params: { format: "csv" },
        responseType: "blob",
      });

      const filename = getFilenameFromHeaders(response.headers, "tools_export.csv");
      downloadBlob(response.data, filename, "text/csv");
      toast.success("CSV exported");
    } catch (error) {
      toast.error(error?.response?.data?.detail || "CSV export failed.");
    } finally {
      setDownloading("");
    }
  };

  if (loading) return <LoadingReports />;

  return (
    <div className="space-y-6" data-testid="reports-page">
      <section className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-muted-foreground">
            Operational reporting
          </p>
          <h1 className="mt-1 font-['Barlow_Condensed'] text-4xl font-black uppercase tracking-tight md:text-5xl">
            Reports
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review tool movements, export registers, and generate PDF reports for site/admin follow-up.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-10 w-40 rounded-none border-2" data-testid="report-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            className="h-10 rounded-none border-2 text-xs font-black uppercase tracking-wider"
            onClick={() => loadReports({ showRefresh: true })}
            disabled={refreshing}
            data-testid="refresh-reports-btn"
          >
            <RefreshCw size={14} className={`mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          title="Checkouts"
          value={getNumber(activitySummary.checkouts)}
          icon={Wrench}
          tone="blue"
          description={periodConfig.label}
        />
        <StatCard
          title="Returns"
          value={getNumber(activitySummary.returns)}
          icon={CheckCircle}
          tone="green"
          description="Returned tools"
        />
        <StatCard
          title="Handovers"
          value={getNumber(activitySummary.handovers)}
          icon={Users}
          tone="amber"
          description="Transfers"
        />
        <StatCard
          title="Maintenance"
          value={getNumber(activitySummary.maintenance_actions)}
          icon={ShieldAlert}
          tone={getNumber(activitySummary.maintenance_actions) > 0 ? "red" : "default"}
          description="Actions logged"
        />
        <StatCard
          title="Overdue"
          value={getNumber(summary?.overdue_count)}
          icon={Clock}
          tone={getNumber(summary?.overdue_count) > 0 ? "amber" : "green"}
          description="Currently active"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <Card className="rounded-sm border border-border shadow-none" data-testid="download-reports-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 font-['Barlow_Condensed'] text-xl uppercase tracking-tight">
              <Download size={17} />
              Download Reports
            </CardTitle>
          </CardHeader>

          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {REPORT_TYPES.map((report) => {
              const Icon = report.icon;

              return (
                <Button
                  key={report.type}
                  variant="outline"
                  onClick={() => downloadPdf(report.type)}
                  disabled={Boolean(downloading)}
                  className="h-auto min-h-20 justify-start rounded-none border-2 p-4 text-left"
                  data-testid={report.testId}
                >
                  <span className="flex w-full items-start gap-3">
                    <Icon size={18} className="mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-xs font-black uppercase tracking-wider">
                        {downloading === report.type ? "Generating..." : report.label}
                      </span>
                      <span className="mt-1 block whitespace-normal text-xs font-normal normal-case tracking-normal text-muted-foreground">
                        {report.description}
                      </span>
                    </span>
                  </span>
                </Button>
              );
            })}

            <Button
              variant="outline"
              onClick={downloadCsv}
              disabled={Boolean(downloading)}
              className="h-auto min-h-20 justify-start rounded-none border-2 p-4 text-left"
              data-testid="download-csv"
            >
              <span className="flex w-full items-start gap-3">
                <Download size={18} className="mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-xs font-black uppercase tracking-wider">
                    {downloading === "csv" ? "Exporting..." : "Tool Register CSV"}
                  </span>
                  <span className="mt-1 block whitespace-normal text-xs font-normal normal-case tracking-normal text-muted-foreground">
                    Export raw tool register data for spreadsheet review.
                  </span>
                </span>
              </span>
            </Button>
          </CardContent>
        </Card>

        <Card className={`rounded-sm border-2 shadow-none ${
          health.tone === "green"
            ? "border-emerald-500/30 bg-emerald-500/5"
            : health.tone === "red"
              ? "border-rose-500/30 bg-rose-500/5"
              : "border-amber-500/30 bg-amber-500/5"
        }`} data-testid="report-health-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 font-['Barlow_Condensed'] text-xl uppercase tracking-tight">
              <AlertTriangle size={17} />
              Report Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className="mb-3 rounded-full bg-[hsl(38,92%,50%)] px-3 py-1 text-xs font-black uppercase text-black">
              {health.label}
            </Badge>
            <p className="text-sm text-muted-foreground">{health.text}</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4" data-testid="inventory-snapshot">
        <StatCard title="Available" value={getNumber(inventory.available)} icon={CheckCircle} tone="green" />
        <StatCard title="Checked Out" value={getNumber(inventory.checked_out)} icon={Wrench} tone="blue" />
        <StatCard title="Maintenance" value={getNumber(inventory.maintenance)} icon={ShieldAlert} tone={getNumber(inventory.maintenance) > 0 ? "red" : "default"} />
        <StatCard title="Total Tools" value={getNumber(inventory.total)} icon={BarChart3} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopList
          title="Most Active Users"
          icon={Users}
          items={summary?.top_users}
          nameKey="name"
          valueKey="actions"
          valueLabel="actions"
        />

        <TopList
          title="Most Used Tools"
          icon={TrendingUp}
          items={summary?.top_tools}
          nameKey="asset_id"
          valueKey="uses"
          valueLabel="uses"
          mono
        />
      </section>

      {getNumber(summary?.overdue_count) > 0 && (
        <Card className="rounded-sm border-2 border-amber-500/30 bg-amber-500/5 shadow-none" data-testid="overdue-report-section">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 font-['Barlow_Condensed'] text-xl uppercase tracking-tight">
              <Clock size={17} className="text-amber-500" />
              Overdue Tools
              <Badge className="rounded-full border border-amber-500/20 bg-amber-500/15 px-2 py-0 text-xs font-bold text-amber-600 dark:text-amber-400">
                {getNumber(summary?.overdue_count)}
              </Badge>
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="space-y-2">
              {overdueDetails.map((checkout, index) => (
                <div
                  key={checkout.id || `${checkout.tool_asset_id || "tool"}-${index}`}
                  className="flex flex-col gap-2 border border-border bg-card p-3 text-sm md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-['JetBrains_Mono'] text-xs font-black">
                      {checkout.tool_asset_id || "Unknown asset"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {checkout.tool_description || "No description"}
                    </p>
                  </div>

                  <div className="shrink-0 text-left md:text-right">
                    <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
                      {checkout.checked_out_by_name || "Unknown holder"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Due: {formatDate(checkout.expected_return_date)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="rounded-sm border border-border shadow-none" data-testid="activity-checkouts-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-['Barlow_Condensed'] text-xl uppercase tracking-tight">
              Checkout Detail
            </CardTitle>
          </CardHeader>
          <CardContent>
            {checkoutDetails.length > 0 ? (
              <div className="space-y-2">
                {checkoutDetails.slice(0, 6).map((checkout, index) => (
                  <div key={checkout.id || index} className="border-b border-border pb-2 last:border-0">
                    <p className="truncate font-['JetBrains_Mono'] text-xs font-black">
                      {checkout.tool_asset_id || "Unknown tool"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {checkout.checked_out_by_name || "Unknown user"} · {formatDate(checkout.checkout_time)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyPanel icon={Wrench} title="No checkouts" description="No checkout activity exists for this period." />
            )}
          </CardContent>
        </Card>

        <Card className="rounded-sm border border-border shadow-none" data-testid="activity-handovers-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-['Barlow_Condensed'] text-xl uppercase tracking-tight">
              Handover Detail
            </CardTitle>
          </CardHeader>
          <CardContent>
            {handoverDetails.length > 0 ? (
              <div className="space-y-2">
                {handoverDetails.slice(0, 6).map((handover, index) => (
                  <div key={handover.id || index} className="border-b border-border pb-2 last:border-0">
                    <p className="truncate font-['JetBrains_Mono'] text-xs font-black">
                      {handover.tool_asset_id || "Unknown tool"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {handover.from_user_name || "Unknown"} → {handover.to_user_name || "Unknown"} · {formatDate(handover.timestamp)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyPanel icon={Users} title="No handovers" description="No handover activity exists for this period." />
            )}
          </CardContent>
        </Card>

        <Card className="rounded-sm border border-border shadow-none" data-testid="activity-maintenance-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-['Barlow_Condensed'] text-xl uppercase tracking-tight">
              Maintenance Detail
            </CardTitle>
          </CardHeader>
          <CardContent>
            {maintenanceDetails.length > 0 ? (
              <div className="space-y-2">
                {maintenanceDetails.slice(0, 6).map((maintenance, index) => (
                  <div key={maintenance.id || index} className="border-b border-border pb-2 last:border-0">
                    <p className="truncate font-['JetBrains_Mono'] text-xs font-black">
                      {maintenance.tool_asset_id || maintenance.tool_id || "Unknown tool"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {maintenance.action_type || "Maintenance"} · {formatDate(maintenance.timestamp)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyPanel icon={ShieldAlert} title="No maintenance" description="No maintenance activity exists for this period." />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
