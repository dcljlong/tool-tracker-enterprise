import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ClipboardList,
  Clock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";

import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ACTIVITY_ICONS = {
  created: ClipboardList,
  checkout: ArrowRight,
  return: CheckCircle,
  handover: Users,
  maintenance: Wrench,
  updated: Wrench,
  deleted: AlertTriangle,
};

const DASHBOARD_LAYOUT_STORAGE_KEY = "tool_tracker_dashboard_layout_v1";

const DEFAULT_DASHBOARD_LAYOUT = {
  preset: "standard",
  widgets: {
    hero: true,
    stats: true,
    overdueReturns: true,
    safetyTags: true,
    recentActivity: true,
    fleetHealth: true,
    quickActions: true,
  },
};

const readDashboardLayout = () => {
  try {
    const raw = localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_DASHBOARD_LAYOUT;

    const parsed = JSON.parse(raw);
    return {
      preset: parsed.preset || DEFAULT_DASHBOARD_LAYOUT.preset,
      widgets: {
        ...DEFAULT_DASHBOARD_LAYOUT.widgets,
        ...(parsed.widgets || {}),
      },
    };
  } catch {
    return DEFAULT_DASHBOARD_LAYOUT;
  }
};
// TOOL TRACKER DASHBOARD TRUE DARK V3
// TOOL TRACKER DASHBOARD FINAL DARK POLISH V4
const VARIANT_STYLES = {
  default: {
    card: "border-slate-200 bg-white dark:border-[rgba(245,190,80,0.24)] dark:bg-slate-950/95 hover:border-slate-300 dark:border-primary/20 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-800 dark:hover:border-primary/70",
    iconBox: "border-amber-300 bg-amber-100 text-amber-600 dark:border-primary/30 dark:bg-primary/10 dark:text-primary",
    support: "text-amber-700 dark:text-primary",
    pill: "border-primary/30 bg-primary/10 text-primary",
  },
  green: {
    card: "border-slate-200 bg-white dark:border-[rgba(245,190,80,0.24)] dark:bg-slate-950/95 hover:border-slate-300 dark:border-primary/20 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-800 dark:hover:border-primary/70",
    iconBox: "border-emerald-300 bg-emerald-100 text-emerald-600 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400",
    support: "text-amber-700 dark:text-primary",
    pill: "border-primary/30 bg-primary/10 text-primary",
  },
  blue: {
    card: "border-slate-200 bg-white dark:border-[rgba(245,190,80,0.24)] dark:bg-slate-950/95 hover:border-slate-300 dark:border-primary/20 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-800 dark:hover:border-primary/70",
    iconBox: "border-blue-300 bg-blue-100 text-blue-600 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-400",
    support: "text-amber-700 dark:text-primary",
    pill: "border-primary/30 bg-primary/10 text-primary",
  },
  amber: {
    card: "border-amber-200 bg-white hover:border-amber-300 dark:border-primary/35 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-primary/10 dark:hover:border-primary",
    iconBox: "border-amber-300 bg-amber-100 text-amber-600 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400",
    support: "text-amber-700 dark:text-primary",
    pill: "border-primary/30 bg-primary/10 text-primary",
  },
  red: {
    card: "border-red-200 bg-red-50 hover:border-red-300 dark:border-red-500/35 dark:bg-slate-950/95 dark:hover:border-red-400/60",
    iconBox: "border-red-300 bg-red-100 text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-500",
    support: "text-red-700 dark:text-red-500",
    pill: "border-red-300 bg-red-100 text-red-700 dark:border-red-400/55 dark:bg-red-500/15 dark:text-red-100",
  },
};

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function displayName(user) {
  return user?.name || user?.full_name || user?.email || "there";
}

function formatDateTime(value) {
  if (!value) return "No timestamp";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("en-NZ", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getToolLabel(item) {
  return item?.tool_asset_id || item?.asset_id || item?.tool_id || "Tool";
}

function StatCard({ title, value, icon: Icon, variant = "default", description, onClick }) {
  const styles = VARIANT_STYLES[variant] || VARIANT_STYLES.default;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left"
      data-testid={`stat-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <Card className={`ops-card overflow-hidden rounded-xl border shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:shadow-[0_18px_50px_rgba(0,0,0,0.14)] dark:hover:shadow-[0_24px_70px_rgba(0,0,0,0.22)] ${styles.card}`}>
        <CardContent className="p-0">
          <div className="flex items-start justify-between gap-3 px-5 pt-5">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground">
                {title}
              </p>
              <p className="mt-2 font-['Barlow_Condensed'] text-4xl font-black leading-none text-slate-950 dark:text-slate-50">
                {value}
              </p>
            </div>

            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border shadow-sm ${styles.iconBox}`}>
              <Icon size={28} strokeWidth={1.75} />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-200 px-5 py-3 dark:border-white/10">
            <span className={`text-[11px] font-bold uppercase tracking-[0.16em] ${styles.support}`}>
              Live overview
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              Open
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5 pt-1" data-testid="dashboard-loading">
      <div className="h-24 animate-pulse rounded-md bg-muted" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-32 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-48 animate-pulse rounded-md bg-muted" />
        <div className="h-48 animate-pulse rounded-md bg-muted" />
      </div>
    </div>
  );
}

function EmptyPanel({ icon: Icon, title, description }) {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center rounded-md border border-dashed border-[rgba(150,118,66,0.20)] bg-white p-6 text-center dark:border-[rgba(245,190,80,0.18)] dark:bg-slate-950/70 dark:text-slate-200">
      <Icon size={28} className="mb-3 text-slate-600 dark:text-slate-500" />
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-slate-600 dark:text-slate-400">{description}</p>
    </div>
  );
}

function OverduePanel({ stats, navigate }) {
  const overdueCount = numberValue(stats?.overdue);
  const overdueTools = Array.isArray(stats?.overdue_tools) ? stats.overdue_tools : [];

  return (
    <Card className="rounded-xl border border-amber-300/45 bg-white text-slate-950 shadow-sm dark:border-[rgba(245,190,80,0.24)] dark:bg-slate-950/95 dark:text-slate-50" data-testid="overdue-section">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-3 font-['Barlow_Condensed'] text-lg font-black uppercase tracking-[0.09em]">
          <span className="flex items-center gap-2">
            <Clock size={20} className="text-amber-500" />
            Overdue Returns
          </span>
          <Badge className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0 text-xs font-black text-amber-600 dark:text-amber-400">
            {overdueCount}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent>
        {overdueTools.length > 0 ? (
          <div className="space-y-2">
            {overdueTools.slice(0, 5).map((item, index) => (
              <button
                type="button"
                key={item.id || `${getToolLabel(item)}-${index}`}
                onClick={() => item.tool_id && navigate(`/tools/${item.tool_id}`)}
                className="flex w-full items-center justify-between gap-3 rounded-md border border-[rgba(150,118,66,0.22)] bg-white p-3 text-left text-sm transition-colors hover:border-amber-400/45 hover:bg-[#f3eadb] dark:border-[rgba(245,190,80,0.18)] dark:bg-slate-950/70 dark:text-slate-100 dark:hover:border-[rgba(245,190,80,0.34)] dark:hover:bg-white/5"
              >
                <div className="min-w-0">
                  <p className="truncate font-['JetBrains_Mono'] text-xs font-bold">
                    {getToolLabel(item)}
                  </p>
                  <p className="truncate text-xs text-slate-600">
                    {item.tool_description || item.description || "No description"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-black uppercase text-amber-600 dark:text-amber-400">
                    {item.checked_out_by_name || item.user_name || "Unknown holder"}
                  </p>
                  {item.site && (
                    <p className="text-[11px] text-slate-600">{item.site}</p>
                  )}
                </div>
              </button>
            ))}

            <Button
              variant="outline"
              size="sm"
              className="mt-3 rounded-none border-2 text-xs font-black uppercase tracking-wider"
              onClick={() => navigate("/reports")}
              data-testid="view-overdue-report-btn"
            >
              View Report <ArrowRight size={14} className="ml-1" />
            </Button>
          </div>
        ) : (
          <EmptyPanel
            icon={ShieldCheck}
            title="No overdue tools"
            description="All active tool returns are currently inside expected return dates."
          />
        )}
      </CardContent>
    </Card>
  );
}

function SafetyPanel({ stats, navigate }) {
  const expiringCount = numberValue(stats?.expiring_tags);

  return (
    <Card className="rounded-xl border border-rose-300/40 bg-white text-slate-950 shadow-sm dark:border-rose-500/30 dark:bg-slate-950/95 dark:text-slate-50" data-testid="expiring-tags-section">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-3 font-['Barlow_Condensed'] text-lg font-black uppercase tracking-[0.09em]">
          <span className="flex items-center gap-2">
            <ShieldAlert size={20} className="text-rose-500" />
            Safety Tags
          </span>
          <Badge className="rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0 text-xs font-black text-rose-600 dark:text-rose-400">
            {expiringCount}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent>
        {expiringCount > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {expiringCount} tool(s) have safety tags expiring within the next 14 days.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-none border-2 text-xs font-black uppercase tracking-wider"
              onClick={() => navigate("/tools")}
              data-testid="view-expiring-btn"
            >
              Review Tools <ArrowRight size={14} className="ml-1" />
            </Button>
          </div>
        ) : (
          <EmptyPanel
            icon={ShieldCheck}
            title="Safety tags current"
            description="No near-expiring tool safety tags are currently reported."
          />
        )}
      </CardContent>
    </Card>
  );
}

function RecentActivity({ activity }) {
  const safeActivity = Array.isArray(activity) ? activity : [];

  return (
    <Card className="rounded-xl border border-[rgba(150,118,66,0.26)] bg-white text-slate-950 shadow-sm dark:border-[rgba(245,190,80,0.24)] dark:bg-slate-950/95 dark:text-slate-50" data-testid="recent-activity-section">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="font-['Barlow_Condensed'] text-xl font-black uppercase tracking-[0.10em]">
          Recent Activity
        </CardTitle>
        <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px] uppercase">
          {safeActivity.length} shown
        </Badge>
      </CardHeader>

      <CardContent>
        {safeActivity.length > 0 ? (
          <div className="divide-y divide-border">
            {safeActivity.slice(0, 10).map((item, index) => {
              const Icon = ACTIVITY_ICONS[item.action] || Wrench;

              return (
                <div key={item.id || `${item.timestamp || "activity"}-${index}`} className="flex items-start gap-3 py-3 text-sm">
                  <div className="mt-0.5 shrink-0 text-slate-600">
                    <Icon size={16} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      <span className="font-bold">{item.user_name || "System"}</span>{" "}
                      <span className="text-slate-600">
                        {item.details || item.action || "recorded activity"}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {formatDateTime(item.timestamp || item.created_at || item.checkout_time)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyPanel
            icon={ClipboardList}
            title="No recent activity"
            description="Tool movements, returns, maintenance, and catalogue changes will appear here."
          />
        )}
      </CardContent>
    </Card>
  );
}

function QuickActions({ navigate }) {
  return (
    <Card className="rounded-xl border border-[rgba(150,118,66,0.26)] bg-white text-slate-950 shadow-sm dark:border-[rgba(245,190,80,0.24)] dark:bg-slate-950/95 dark:text-slate-50" data-testid="quick-actions-section">
      <CardHeader className="pb-2">
        <CardTitle className="font-['Barlow_Condensed'] text-xl font-black uppercase tracking-[0.10em]">
          Quick Actions
        </CardTitle>
      </CardHeader>

      <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          className="h-11 rounded-xl bg-[hsl(38,92%,50%)] text-xs font-black uppercase tracking-wider text-black hover:bg-[hsl(38,92%,45%)]"
          onClick={() => navigate("/scan")}
          data-testid="quick-scan-btn"
        >
          Scan QR <ArrowRight size={15} className="ml-2" />
        </Button>

        <Button
          variant="outline"
          className="h-11 rounded-md border border-[rgba(150,118,66,0.28)] bg-white text-xs font-black uppercase tracking-wider text-slate-900 hover:bg-[#f3eadb] dark:border-[rgba(245,190,80,0.20)] dark:bg-slate-950/70 dark:text-slate-100 dark:hover:bg-white/5"
          onClick={() => navigate("/tools")}
          data-testid="quick-tools-btn"
        >
          Open Tools <ArrowRight size={15} className="ml-2" />
        </Button>

        <Button
          variant="outline"
          className="h-11 rounded-md border border-[rgba(150,118,66,0.28)] bg-white text-xs font-black uppercase tracking-wider text-slate-900 hover:bg-[#f3eadb] dark:border-[rgba(245,190,80,0.20)] dark:bg-slate-950/70 dark:text-slate-100 dark:hover:bg-white/5"
          onClick={() => navigate("/reports")}
          data-testid="quick-reports-btn"
        >
          Reports <ArrowRight size={15} className="ml-2" />
        </Button>

        <Button
          variant="outline"
          className="h-11 rounded-md border border-[rgba(150,118,66,0.28)] bg-white text-xs font-black uppercase tracking-wider text-slate-900 hover:bg-[#f3eadb] dark:border-[rgba(245,190,80,0.20)] dark:bg-slate-950/70 dark:text-slate-100 dark:hover:bg-white/5"
          onClick={() => navigate("/calendar")}
          data-testid="quick-calendar-btn"
        >
          Calendar <ArrowRight size={15} className="ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [dashboardLayout, setDashboardLayout] = useState(readDashboardLayout);

  const fetchDashboard = useCallback(async ({ showRefresh = false } = {}) => {
    if (showRefresh) setRefreshing(true);
    setErrorMessage("");

    try {
      const [statsResponse, activityResponse] = await Promise.all([
        api.get("/dashboard/stats"),
        api.get("/dashboard/recent-activity"),
      ]);

      setStats(statsResponse.data || {});
      setActivity(Array.isArray(activityResponse.data) ? activityResponse.data : []);
    } catch (error) {
      setStats({});
      setActivity([]);
      setErrorMessage(error?.response?.data?.detail || "Dashboard data could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    const refreshLayout = () => setDashboardLayout(readDashboardLayout());

    window.addEventListener("storage", refreshLayout);
    window.addEventListener("tool-tracker-dashboard-layout-updated", refreshLayout);

    return () => {
      window.removeEventListener("storage", refreshLayout);
      window.removeEventListener("tool-tracker-dashboard-layout-updated", refreshLayout);
    };
  }, []);

  const healthStatus = useMemo(() => {
    const overdue = numberValue(stats?.overdue);
    const expiringTags = numberValue(stats?.expiring_tags);
    const maintenance = numberValue(stats?.maintenance_required);

    if (overdue > 0 || expiringTags > 0 || maintenance > 0) {
      return {
        label: "Action Required",
        variant: "red",
        text: `${overdue + expiringTags + maintenance} item(s) need attention`,
      };
    }

    return {
      label: "All Clear",
      variant: "green",
      text: "No overdue returns, expiring tags, or maintenance alerts reported.",
    };
  }, [stats]);

  if (loading) return <LoadingSkeleton />;

  const widgets = dashboardLayout.widgets || DEFAULT_DASHBOARD_LAYOUT.widgets;

  const heroMetrics = [
    {
      label: "Total Tools",
      value: numberValue(stats?.total_tools),
    },
    {
      label: "Available",
      value: numberValue(stats?.available),
    },
    {
      label: "Checked Out",
      value: numberValue(stats?.checked_out),
    },
    {
      label: "Maintenance",
      value: numberValue(stats?.maintenance_required),
    },
  ];

  return (
    <div
      className="space-y-5 pt-8 text-slate-950 dark:text-slate-100"
      /* TOOL TRACKER DASHBOARD TRUE DARK V2 */
      data-testid="dashboard-page"
    >
      {widgets.hero && (
        <section className="relative z-0 rounded-none border-0 bg-transparent shadow-none dark:overflow-hidden dark:rounded-[1.6rem] dark:border dark:border-primary/35 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-black dark:shadow-[0_28px_90px_rgba(0,0,0,0.30)]">
          <div className="grid grid-cols-1 gap-5 p-0 dark:p-5 lg:grid-cols-[1fr_1.15fr]">
            <div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.26em] text-primary">
                  Long Line Tool Tracker
                </p>
                <h1 className="mt-2 font-['Barlow_Condensed'] text-2xl font-black uppercase tracking-[0.08em] text-slate-950 sm:text-3xl dark:text-slate-50">
                  Tool Control Room
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Review fleet status, returns, tags, and recent movements from one clear tool-control dashboard.
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <Badge className="rounded-md border border-orange-600 bg-orange-600 px-4 py-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-white shadow-sm hover:bg-orange-700">
                  {healthStatus.label}
                </Badge>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 dark:border-[rgba(245,190,80,0.24)] dark:bg-slate-950/95 dark:text-slate-100 dark:hover:bg-white/5"
                  onClick={() => fetchDashboard({ showRefresh: true })}
                  disabled={refreshing}
                  data-testid="refresh-dashboard-btn"
                >
                  <RefreshCw size={14} className={`mr-2 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:gap-4">
              {heroMetrics.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-[rgba(245,190,80,0.24)] dark:bg-slate-950/95"
                >
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground">
                    {metric.label}
                  </p>
                  <p className="mt-2 font-['Manrope'] text-2xl font-bold leading-none text-slate-950">
                    {metric.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {errorMessage && (
        <Card className="rounded-xl border border-rose-500/30 bg-rose-500/5 shadow-none" data-testid="dashboard-error">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="mt-0.5 shrink-0 text-rose-500" />
              <div>
                <p className="text-sm font-bold">Dashboard data issue</p>
                <p className="text-sm text-slate-600">{errorMessage}</p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-2 text-xs font-black uppercase tracking-wider"
              onClick={() => fetchDashboard({ showRefresh: true })}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {widgets.stats && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 items-start">
          <StatCard
            title="Total Tools"
            value={numberValue(stats?.total_tools)}
            icon={Wrench}
            description="Tracked in catalogue"
            onClick={() => navigate("/tools")}
          />
          <StatCard
            title="Available"
            value={numberValue(stats?.available)}
            icon={CheckCircle}
            variant="green"
            description="Ready for checkout"
            onClick={() => navigate("/tools?status=available")}
          />
          <StatCard
            title="Checked Out"
            value={numberValue(stats?.checked_out)}
            icon={ArrowRight}
            variant="blue"
            description="Currently in use"
            onClick={() => navigate("/tools?status=checked_out")}
          />
          <StatCard
            title="Maintenance"
            value={numberValue(stats?.maintenance_required)}
            icon={ShieldAlert}
            variant="red"
            description="Action required"
            onClick={() => navigate("/tools?status=maintenance_required")}
          />
        </section>
      )}

      {(widgets.overdueReturns || widgets.safetyTags) && (
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {widgets.overdueReturns && <OverduePanel stats={stats} navigate={navigate} />}
          {widgets.safetyTags && <SafetyPanel stats={stats} navigate={navigate} />}
        </section>
      )}

      {widgets.recentActivity && <RecentActivity activity={activity} />}

      {(widgets.fleetHealth || widgets.quickActions) && (
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {widgets.fleetHealth && (
            <Card className={`rounded-md border shadow-sm ${VARIANT_STYLES[healthStatus.variant].card}`} data-testid="fleet-health-section">
              <CardHeader className="pb-2">
                <CardTitle className="font-['Barlow_Condensed'] text-xl font-black uppercase tracking-[0.10em]">
                  Fleet Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600">{healthStatus.text}</p>
              </CardContent>
            </Card>
          )}

          {widgets.quickActions && <QuickActions navigate={navigate} />}
        </section>
      )}
    </div>
  );
}
