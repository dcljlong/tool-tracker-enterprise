import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Wrench, CheckCircle, AlertTriangle, Clock, Users, ShieldAlert,
  ArrowRight, Package
} from "lucide-react";

function StatCard({ title, value, icon: Icon, variant, description, onClick }) {
  const colors = {
    green: "border-emerald-500/30 bg-emerald-500/5",
    red: "border-rose-500/30 bg-rose-500/5",
    yellow: "border-amber-500/30 bg-amber-500/5",
    blue: "border-blue-500/30 bg-blue-500/5",
    default: "border-border",
  };
  const iconColors = {
    green: "text-emerald-500",
    red: "text-rose-500",
    yellow: "text-amber-500",
    blue: "text-blue-500",
    default: "text-muted-foreground",
  };
  return (
    <Card
      className={`rounded-sm shadow-none border-2 cursor-pointer transition-all duration-150 hover:-translate-y-0.5 ${colors[variant || "default"]}`}
      onClick={onClick}
      data-testid={`stat-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground">{title}</p>
            <p className="text-3xl font-black font-['Barlow_Condensed'] mt-1">{value}</p>
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
          <div className={`p-2 ${iconColors[variant || "default"]}`}>
            <Icon size={24} />
          </div>
        </div>
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

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/stats'),
      api.get('/dashboard/recent-activity')
    ]).then(([statsRes, actRes]) => {
      setStats(statsRes.data);
      setActivity(actRes.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1,2,3,4].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-sm" />)}
      </div>
    );
  }

  const actionIcons = { created: Package, checkout: ArrowRight, return: CheckCircle, handover: Users, maintenance: Wrench, updated: Wrench, deleted: AlertTriangle };

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      <div>
        <h1 className="font-['Barlow_Condensed'] text-3xl md:text-4xl font-black uppercase tracking-tight">
          Dashboard
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Welcome back, {user?.name}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Tools" value={stats?.total_tools || 0} icon={Wrench} variant="default" onClick={() => navigate('/tools')} />
        <StatCard title="Available" value={stats?.available || 0} icon={CheckCircle} variant="green" description="Ready for checkout" onClick={() => navigate('/tools?status=available')} />
        <StatCard title="Checked Out" value={stats?.checked_out || 0} icon={ArrowRight} variant="blue" onClick={() => navigate('/tools?status=checked_out')} />
        <StatCard title="Maintenance" value={stats?.maintenance_required || 0} icon={ShieldAlert} variant="red" description="Action required" onClick={() => navigate('/tools?status=maintenance_required')} />
      </div>

      {/* Action Required Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="rounded-sm shadow-none border-2 border-amber-500/30 bg-amber-500/5" data-testid="overdue-section">
          <CardHeader className="pb-2">
            <CardTitle className="font-['Barlow_Condensed'] text-lg uppercase tracking-tight flex items-center gap-2">
              <Clock size={18} className="text-amber-500" />
              Overdue Returns
              {(stats?.overdue || 0) > 0 && <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-full text-xs font-bold">{stats.overdue}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.overdue_tools?.length > 0 ? (
              <div className="space-y-2">
                {stats.overdue_tools.slice(0, 5).map(co => (
                  <div key={co.id} className="flex items-center justify-between p-2 border border-border bg-card rounded-sm text-sm">
                    <div>
                      <span className="font-medium">{co.tool_asset_id}</span>
                      <span className="text-muted-foreground ml-2">{co.tool_description}</span>
                    </div>
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-bold uppercase">
                      {co.checked_out_by_name}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No overdue tools</p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-sm shadow-none border-2 border-rose-500/30 bg-rose-500/5" data-testid="expiring-tags-section">
          <CardHeader className="pb-2">
            <CardTitle className="font-['Barlow_Condensed'] text-lg uppercase tracking-tight flex items-center gap-2">
              <ShieldAlert size={18} className="text-rose-500" />
              Expiring Safety Tags
              {(stats?.expiring_tags || 0) > 0 && <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20 rounded-full text-xs font-bold">{stats.expiring_tags}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {stats?.expiring_tags > 0
                ? `${stats.expiring_tags} tool(s) with tags expiring within 14 days`
                : "All safety tags current"}
            </p>
            {stats?.expiring_tags > 0 && (
              <Button variant="outline" size="sm" className="mt-3 rounded-none uppercase text-xs font-bold tracking-wider border-2"
                onClick={() => navigate('/tools')} data-testid="view-expiring-btn">
                View Tools <ArrowRight size={14} className="ml-1" />
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="rounded-sm shadow-none border border-border" data-testid="recent-activity-section">
        <CardHeader className="pb-2">
          <CardTitle className="font-['Barlow_Condensed'] text-lg uppercase tracking-tight">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length > 0 ? (
            <div className="space-y-2">
              {activity.slice(0, 10).map(a => {
                const Icon = actionIcons[a.action] || Wrench;
                return (
                  <div key={a.id} className="flex items-start gap-3 p-2 border-b border-border last:border-0 text-sm">
                    <Icon size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate"><span className="font-medium">{a.user_name}</span> <span className="text-muted-foreground">{a.details}</span></p>
                      <p className="text-xs text-muted-foreground mt-0.5">{new Date(a.timestamp).toLocaleString('en-NZ')}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No recent activity</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
