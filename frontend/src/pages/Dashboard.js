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
const VARIANT_STYLES = {
  default: {
    card: "border-border bg-card",
    icon: "text-muted-foreground",
    pill: "border-border bg-muted text-muted-foreground",
  },
  green: {
    card: "border-emerald-500/30 bg-emerald-500/5",
    icon: "text-emerald-500",
    pill: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  blue: {
    card: "border-blue-500/30 bg-blue-500/5",
    icon: "text-blue-500",
    pill: "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  amber: {
    card: "border-amber-500/30 bg-amber-500/5",
    icon: "text-amber-500",
    pill: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  red: {
    card: "border-rose-500/30 bg-rose-500/5",
    icon: "text-rose-500",
    pill: "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400",
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
    <Card
      className={`rounded-sm border-2 shadow-none transition-all duration-150 hover:-translate-y-0.5 ${styles.card} ${
        onClick ? "cursor-pointer" : ""
      }`}
      onClick={onClick}
      data-testid={`stat-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">
              {title}
            </p>
            <p className="mt-1 font-['Barlow_Condensed'] text-4xl font-black leading-none">
              {value}
            </p>
            {description && (
              <p className="mt-2 text-xs text-muted-foreground">
                {description}
              </p>
            )}
          </div>

          <div className={`shrink-0 p-2 ${styles.icon}`}>
            <Icon size={26} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6" data-testid="dashboard-loading">
      <div className="h-24 animate-pulse rounded-sm bg-muted" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-32 animate-pulse rounded-sm bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-48 animate-pulse rounded-sm bg-muted" />
        <div className="h-48 animate-pulse rounded-sm bg-muted" />
      </div>
    </div>
  );
}

function EmptyPanel({ icon: Icon, title, description }) {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center border border-dashed border-border bg-background/50 p-6 text-center">
      <Icon size={28} className="mb-3 text-muted-foreground" />
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function OverduePanel({ stats, navigate }) {
  const overdueCount = numberValue(stats?.overdue);
  const overdueTools = Array.isArray(stats?.overdue_tools) ? stats.overdue_tools : [];

  return (
    <Card className="rounded-sm border-2 border-amber-500/30 bg-amber-500/5 shadow-none" data-testid="overdue-section">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-3 font-['Barlow_Condensed'] text-xl uppercase tracking-tight">
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
                className="flex w-full items-center justify-between gap-3 border border-border bg-card p-3 text-left text-sm transition-colors hover:border-amber-500/40"
              >
                <div className="min-w-0">
                  <p className="truncate font-['JetBrains_Mono'] text-xs font-bold">
                    {getToolLabel(item)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.tool_description || item.description || "No description"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-black uppercase text-amber-600 dark:text-amber-400">
                    {item.checked_out_by_name || item.user_name || "Unknown holder"}
                  </p>
                  {item.site && (
                    <p className="text-[11px] text-muted-foreground">{item.site}</p>
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
    <Card className="rounded-sm border-2 border-rose-500/30 bg-rose-500/5 shadow-none" data-testid="expiring-tags-section">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-3 font-['Barlow_Condensed'] text-xl uppercase tracking-tight">
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
            <p className="text-sm text-muted-foreground">
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
    <Card className="rounded-sm border border-border shadow-none" data-testid="recent-activity-section">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="font-['Barlow_Condensed'] text-xl uppercase tracking-tight">
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
                  <div className="mt-0.5 shrink-0 text-muted-foreground">
                    <Icon size={16} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      <span className="font-bold">{item.user_name || "System"}</span>{" "}
                      <span className="text-muted-foreground">
                        {item.details || item.action || "recorded activity"}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
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
    <Card className="rounded-sm border border-border shadow-none" data-testid="quick-actions-section">
      <CardHeader className="pb-2">
        <CardTitle className="font-['Barlow_Condensed'] text-xl uppercase tracking-tight">
          Quick Actions
        </CardTitle>
      </CardHeader>

      <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          className="h-11 rounded-none bg-[hsl(38,92%,50%)] text-xs font-black uppercase tracking-wider text-black hover:bg-[hsl(38,92%,45%)]"
          onClick={() => navigate("/scan")}
          data-testid="quick-scan-btn"
        >
          Scan QR <ArrowRight size={15} className="ml-2" />
        </Button>

        <Button
          variant="outline"
          className="h-11 rounded-none border-2 text-xs font-black uppercase tracking-wider"
          onClick={() => navigate("/tools")}
          data-testid="quick-tools-btn"
        >
          Open Tools <ArrowRight size={15} className="ml-2" />
        </Button>

        <Button
          variant="outline"
          className="h-11 rounded-none border-2 text-xs font-black uppercase tracking-wider"
          onClick={() => navigate("/reports")}
          data-testid="quick-reports-btn"
        >
          Reports <ArrowRight size={15} className="ml-2" />
        </Button>

        <Button
          variant="outline"
          className="h-11 rounded-none border-2 text-xs font-black uppercase tracking-wider"
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

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      {widgets.hero && (
      <section className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-muted-foreground">
            Tool control dashboard
          </p>
          <h1 className="mt-1 font-['Barlow_Condensed'] text-4xl font-black uppercase tracking-tight md:text-5xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome back, {displayName(user)}. Review fleet status, returns, tags, and recent movements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge className={`${VARIANT_STYLES[healthStatus.variant].pill} rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider`}>
            {healthStatus.label}
          </Badge>

          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-none border-2 text-xs font-black uppercase tracking-wider"
            onClick={() => fetchDashboard({ showRefresh: true })}
            disabled={refreshing}
            data-testid="refresh-dashboard-btn"
          >
            <RefreshCw size={14} className={`mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </section>
      )}

      {errorMessage && (
        <Card className="rounded-sm border-2 border-rose-500/30 bg-rose-500/5 shadow-none" data-testid="dashboard-error">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="mt-0.5 shrink-0 text-rose-500" />
              <div>
                <p className="text-sm font-bold">Dashboard data issue</p>
                <p className="text-sm text-muted-foreground">{errorMessage}</p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="rounded-none border-2 text-xs font-black uppercase tracking-wider"
              onClick={() => fetchDashboard({ showRefresh: true })}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {widgets.stats && (
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
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
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {widgets.overdueReturns && <OverduePanel stats={stats} navigate={navigate} />}
        {widgets.safetyTags && <SafetyPanel stats={stats} navigate={navigate} />}
      </section>
      )}

      {(widgets.recentActivity || widgets.fleetHealth || widgets.quickActions) && (
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        {widgets.recentActivity && <RecentActivity activity={activity} />}
        {(widgets.fleetHealth || widgets.quickActions) && (
        <div className="space-y-4">
          {widgets.fleetHealth && (
          <Card className={`rounded-sm border-2 shadow-none ${VARIANT_STYLES[healthStatus.variant].card}`} data-testid="fleet-health-section">
            <CardHeader className="pb-2">
              <CardTitle className="font-['Barlow_Condensed'] text-xl uppercase tracking-tight">
                Fleet Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{healthStatus.text}</p>
            </CardContent>
          </Card>
          )}

          {widgets.quickActions && <QuickActions navigate={navigate} />}
        </div>
        )}
      </section>
      )}
    </div>
  );
}
