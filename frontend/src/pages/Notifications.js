import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CheckCircle,
  Clock,
  RefreshCw,
  ShieldAlert,
  Users,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TYPE_CONFIG = {
  tag_expiry: {
    label: "Safety Tag",
    icon: ShieldAlert,
    iconClass: "text-rose-500",
    bgClass: "bg-rose-500/10",
    borderClass: "border-rose-500/30",
  },
  cert_expiry: {
    label: "Certificate",
    icon: ShieldAlert,
    iconClass: "text-rose-500",
    bgClass: "bg-rose-500/10",
    borderClass: "border-rose-500/30",
  },
  overdue: {
    label: "Overdue",
    icon: Clock,
    iconClass: "text-amber-500",
    bgClass: "bg-amber-500/10",
    borderClass: "border-amber-500/30",
  },
  handover: {
    label: "Handover",
    icon: Users,
    iconClass: "text-blue-500",
    bgClass: "bg-blue-500/10",
    borderClass: "border-blue-500/30",
  },
  maintenance: {
    label: "Maintenance",
    icon: Wrench,
    iconClass: "text-rose-500",
    bgClass: "bg-rose-500/10",
    borderClass: "border-rose-500/30",
  },
  default: {
    label: "Alert",
    icon: Bell,
    iconClass: "text-muted-foreground",
    bgClass: "bg-muted",
    borderClass: "border-border",
  },
};

function getTypeConfig(type) {
  return TYPE_CONFIG[type] || TYPE_CONFIG.default;
}

function formatType(type) {
  return getTypeConfig(type).label;
}

function formatDateTime(value) {
  if (!value) return "No timestamp";

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

function sortNewestFirst(items) {
  return [...items].sort((a, b) => {
    const aTime = new Date(a.created_at || 0).getTime();
    const bTime = new Date(b.created_at || 0).getTime();
    return bTime - aTime;
  });
}

function StatCard({ title, value, icon: Icon, tone = "default" }) {
  const toneClass = {
    default: "border-border bg-card text-muted-foreground",
    green: "border-emerald-500/30 bg-emerald-500/5 text-emerald-500",
    amber: "border-amber-500/30 bg-amber-500/5 text-amber-500",
    red: "border-rose-500/30 bg-rose-500/5 text-rose-500",
  }[tone];

  return (
    <Card className={`rounded-sm border-2 shadow-none ${toneClass}`}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">
            {title}
          </p>
          <p className="mt-1 font-['Barlow_Condensed'] text-3xl font-black leading-none text-foreground">
            {value}
          </p>
        </div>
        <Icon size={24} />
      </CardContent>
    </Card>
  );
}

function LoadingList() {
  return (
    <div className="space-y-3" data-testid="notifications-loading">
      {[1, 2, 3, 4].map((item) => (
        <div key={item} className="h-20 animate-pulse rounded-sm bg-muted" />
      ))}
    </div>
  );
}

function EmptyNotifications({ hasFilters }) {
  return (
    <Card className="rounded-sm border border-border shadow-none" data-testid="notifications-empty">
      <CardContent className="py-12 text-center">
        <Bell size={48} className="mx-auto mb-4 text-muted-foreground" />
        <p className="text-lg font-bold">
          {hasFilters ? "No notifications match the current filters" : "No notifications"}
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {hasFilters
            ? "Change the status or type filters to see more alerts."
            : "Safety tag alerts, overdue tool returns, handovers, and maintenance items will appear here."}
        </p>
      </CardContent>
    </Card>
  );
}

export default function Notifications() {
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const fetchNotifications = useCallback(async ({ showRefresh = false } = {}) => {
    if (showRefresh) setRefreshing(true);

    try {
      const response = await api.get("/notifications");
      const items = Array.isArray(response.data) ? response.data : [];
      setNotifications(sortNewestFirst(items));
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to load notifications.");
      setNotifications([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const stats = useMemo(() => {
    const unread = notifications.filter((item) => !item.read).length;
    const overdue = notifications.filter((item) => item.type === "overdue").length;
    const safety = notifications.filter((item) => item.type === "tag_expiry" || item.type === "cert_expiry").length;

    return {
      total: notifications.length,
      unread,
      read: notifications.length - unread,
      overdue,
      safety,
    };
  }, [notifications]);

  const availableTypes = useMemo(() => {
    const uniqueTypes = Array.from(new Set(notifications.map((item) => item.type).filter(Boolean)));
    return uniqueTypes.sort();
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      if (statusFilter === "unread" && item.read) return false;
      if (statusFilter === "read" && !item.read) return false;
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      return true;
    });
  }, [notifications, statusFilter, typeFilter]);

  const hasFilters = statusFilter !== "all" || typeFilter !== "all";

  const markRead = async (notification) => {
    if (!notification?.id || notification.read) return;

    setNotifications((current) =>
      current.map((item) => (item.id === notification.id ? { ...item, read: true } : item)),
    );

    try {
      await api.put(`/notifications/${notification.id}/read`);
    } catch (error) {
      setNotifications((current) =>
        current.map((item) => (item.id === notification.id ? { ...item, read: false } : item)),
      );
      toast.error(error?.response?.data?.detail || "Failed to mark notification as read.");
    }
  };

  const openNotification = async (notification) => {
    await markRead(notification);

    if (notification?.tool_id) {
      navigate(`/tools/${notification.tool_id}`);
    }
  };

  const markAllRead = async () => {
    if (stats.unread === 0) return;

    setBusyAction("mark-all");

    const previous = notifications;

    setNotifications((current) => current.map((item) => ({ ...item, read: true })));

    try {
      await api.put("/notifications/read-all");
      toast.success("All notifications marked as read");
    } catch (error) {
      setNotifications(previous);
      toast.error(error?.response?.data?.detail || "Failed to mark all notifications as read.");
    } finally {
      setBusyAction("");
    }
  };

  const clearFilters = () => {
    setStatusFilter("all");
    setTypeFilter("all");
  };

  return (
    <div className="space-y-6" data-testid="notifications-page">
      <section className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-muted-foreground">
            Alerts & actions
          </p>
          <h1 className="mt-1 font-['Barlow_Condensed'] text-4xl font-black uppercase tracking-tight md:text-5xl">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review safety tag alerts, overdue returns, handovers, and maintenance notices.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-10 rounded-none border-2 text-xs font-black uppercase tracking-wider"
            onClick={() => fetchNotifications({ showRefresh: true })}
            disabled={refreshing}
            data-testid="refresh-notifications-btn"
          >
            <RefreshCw size={14} className={`mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={markAllRead}
            disabled={stats.unread === 0 || busyAction === "mark-all"}
            className="h-10 rounded-none border-2 text-xs font-black uppercase tracking-wider"
            data-testid="mark-all-read-btn"
          >
            <CheckCheck size={14} className="mr-2" />
            {busyAction === "mark-all" ? "Marking..." : "Mark All Read"}
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard title="Total" value={stats.total} icon={Bell} />
        <StatCard title="Unread" value={stats.unread} icon={AlertTriangle} tone={stats.unread > 0 ? "amber" : "green"} />
        <StatCard title="Read" value={stats.read} icon={CheckCircle} tone="green" />
        <StatCard title="Safety" value={stats.safety} icon={ShieldAlert} tone={stats.safety > 0 ? "red" : "default"} />
        <StatCard title="Overdue" value={stats.overdue} icon={Clock} tone={stats.overdue > 0 ? "amber" : "default"} />
      </section>

      <section className="grid gap-3 md:grid-cols-[180px_220px_auto]">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="rounded-none border-2" data-testid="notification-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="unread">Unread Only</SelectItem>
            <SelectItem value="read">Read Only</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="rounded-none border-2" data-testid="notification-type-filter">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {availableTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {formatType(type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          className="h-10 rounded-none border-2 text-xs font-black uppercase tracking-wider md:w-28"
          onClick={clearFilters}
          disabled={!hasFilters}
          data-testid="clear-notification-filters-btn"
        >
          Clear
        </Button>
      </section>

      {loading ? (
        <LoadingList />
      ) : filteredNotifications.length === 0 ? (
        <EmptyNotifications hasFilters={hasFilters} />
      ) : (
        <section className="space-y-2" data-testid="notification-list">
          {filteredNotifications.map((notification) => {
            const config = getTypeConfig(notification.type);
            const Icon = config.icon;
            const unread = !notification.read;

            return (
              <Card
                key={notification.id}
                className={[
                  "rounded-sm border shadow-none transition-colors hover:border-[hsl(38,92%,50%)]/60",
                  unread ? "border-l-4 border-l-[hsl(38,92%,50%)] bg-[hsl(38,92%,50%)]/5" : "border-border bg-card",
                  notification.tool_id ? "cursor-pointer" : "",
                ].join(" ")}
                onClick={() => openNotification(notification)}
                data-testid={`notification-${notification.id}`}
              >
                <CardContent className="flex items-start gap-4 p-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center ${config.bgClass}`}>
                    <Icon size={18} className={config.iconClass} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        className={`rounded-full border px-2 py-0 text-[10px] font-black uppercase ${config.borderClass} ${config.bgClass} ${config.iconClass}`}
                      >
                        {formatType(notification.type)}
                      </Badge>

                      {unread ? (
                        <Badge className="rounded-full bg-[hsl(38,92%,50%)] px-2 py-0 text-[10px] font-black uppercase text-black">
                          Unread
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px] uppercase">
                          Read
                        </Badge>
                      )}

                      {notification.tool_id && (
                        <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px] uppercase">
                          Tool linked
                        </Badge>
                      )}
                    </div>

                    <p className={`mt-2 text-sm ${unread ? "font-bold" : "text-muted-foreground"}`}>
                      {notification.message || "Notification"}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(notification.created_at)}
                    </p>
                  </div>

                  {unread && (
                    <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[hsl(38,92%,50%)]" />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}
