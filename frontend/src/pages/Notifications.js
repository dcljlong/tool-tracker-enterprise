import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Bell, CheckCheck, ShieldAlert, Clock, Users, Wrench, AlertTriangle
} from "lucide-react";

const typeConfig = {
  tag_expiry: { icon: ShieldAlert, color: "text-rose-500", bg: "bg-rose-500/10" },
  overdue: { icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
  handover: { icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
  maintenance: { icon: Wrench, color: "text-rose-500", bg: "bg-rose-500/10" },
};

export default function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifs = () => {
    api.get('/notifications').then(res => setNotifications(res.data)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetchNotifs(); }, []);

  const markRead = async (id) => {
    await api.put(`/notifications/${id}/read`);
    setNotifications(notifications.map(n => n.id === id ? {...n, read: true} : n));
  };

  const markAllRead = async () => {
    await api.put('/notifications/read-all');
    setNotifications(notifications.map(n => ({...n, read: true})));
    toast.success("All marked as read");
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="space-y-6" data-testid="notifications-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-['Barlow_Condensed'] text-3xl md:text-4xl font-black uppercase tracking-tight">Notifications</h1>
          <p className="text-muted-foreground text-sm mt-1">{unreadCount} unread</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={markAllRead} className="rounded-none uppercase text-xs font-bold tracking-wider border-2 h-10" data-testid="mark-all-read-btn">
            <CheckCheck size={14} className="mr-2" /> Mark All Read
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-sm" />)}</div>
      ) : notifications.length === 0 ? (
        <Card className="rounded-sm shadow-none border border-border">
          <CardContent className="py-12 text-center">
            <Bell size={48} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No notifications</p>
            <p className="text-sm text-muted-foreground mt-1">You're all caught up</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => {
            const tc = typeConfig[n.type] || typeConfig.maintenance;
            const Icon = tc.icon;
            return (
              <Card
                key={n.id}
                className={`rounded-sm shadow-none border border-border cursor-pointer transition-all duration-150 hover:border-[hsl(38,92%,50%)]/50 ${!n.read ? 'border-l-4 border-l-[hsl(38,92%,50%)]' : ''}`}
                onClick={() => { markRead(n.id); if (n.tool_id) navigate(`/tools/${n.tool_id}`); }}
                data-testid={`notification-${n.id}`}
              >
                <CardContent className="p-4 flex items-start gap-3">
                  <div className={`w-8 h-8 flex items-center justify-center shrink-0 ${tc.bg}`}>
                    <Icon size={16} className={tc.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!n.read ? 'font-medium' : 'text-muted-foreground'}`}>{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString('en-NZ')}</p>
                  </div>
                  {!n.read && <div className="w-2 h-2 rounded-full bg-[hsl(38,92%,50%)] shrink-0 mt-2" />}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
