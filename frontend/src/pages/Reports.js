import { useState, useEffect } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  FileText, Download, ArrowRight, RotateCcw, Users, Wrench,
  Clock, TrendingUp, BarChart3
} from "lucide-react";

export default function Reports() {
  const [period, setPeriod] = useState("week");
  const [summary, setSummary] = useState(null);
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState("");

  useEffect(() => {
    setLoading(true);
    const days = period === "week" ? 7 : 1;
    Promise.all([
      api.get('/reports/summary', { params: { period } }),
      api.get('/reports/tool-activity', { params: { days } }),
    ]).then(([sumRes, actRes]) => {
      setSummary(sumRes.data);
      setActivity(actRes.data);
    }).catch(() => toast.error("Failed to load reports")).finally(() => setLoading(false));
  }, [period]);

  const downloadPdf = async (reportType) => {
    setDownloading(reportType);
    try {
      const days = period === "week" ? 7 : 1;
      const res = await api.get('/reports/export-pdf', {
        params: { report_type: reportType, days },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${reportType}_report.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("PDF downloaded");
    } catch (err) {
      toast.error("Failed to generate PDF");
    } finally {
      setDownloading("");
    }
  };

  const downloadCsv = async () => {
    try {
      const res = await api.get('/reports/export', { params: { format: 'csv' }, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'tools_export.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("CSV exported");
    } catch (err) {
      toast.error("Export failed");
    }
  };

  if (loading) {
    return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-sm" />)}</div>;
  }

  return (
    <div className="space-y-6" data-testid="reports-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-['Barlow_Condensed'] text-3xl md:text-4xl font-black uppercase tracking-tight">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">Activity summaries and exportable reports</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-36 rounded-none border-2" data-testid="report-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="rounded-sm shadow-none border-2 border-border">
            <CardContent className="pt-5 pb-4">
              <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Checkouts</p>
              <p className="text-3xl font-black font-['Barlow_Condensed'] mt-1">{summary.activity.checkouts}</p>
              <p className="text-xs text-muted-foreground mt-1">{period === "week" ? "last 7 days" : "today"}</p>
            </CardContent>
          </Card>
          <Card className="rounded-sm shadow-none border-2 border-border">
            <CardContent className="pt-5 pb-4">
              <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Returns</p>
              <p className="text-3xl font-black font-['Barlow_Condensed'] mt-1">{summary.activity.returns}</p>
            </CardContent>
          </Card>
          <Card className="rounded-sm shadow-none border-2 border-border">
            <CardContent className="pt-5 pb-4">
              <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Handovers</p>
              <p className="text-3xl font-black font-['Barlow_Condensed'] mt-1">{summary.activity.handovers}</p>
            </CardContent>
          </Card>
          <Card className="rounded-sm shadow-none border-2 border-border">
            <CardContent className="pt-5 pb-4">
              <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Maintenance</p>
              <p className="text-3xl font-black font-['Barlow_Condensed'] mt-1">{summary.activity.maintenance_actions}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Download Buttons */}
      <Card className="rounded-sm shadow-none border border-border" data-testid="download-reports-card">
        <CardHeader className="pb-2">
          <CardTitle className="font-['Barlow_Condensed'] text-lg uppercase tracking-tight flex items-center gap-2">
            <Download size={16} /> Download Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Button variant="outline" onClick={() => downloadPdf('inventory')} disabled={!!downloading}
              className="rounded-none uppercase text-xs font-bold tracking-wider border-2 h-12 justify-start" data-testid="download-inventory-pdf">
              <FileText size={14} className="mr-2 shrink-0" />
              {downloading === 'inventory' ? "Generating..." : "Inventory PDF"}
            </Button>
            <Button variant="outline" onClick={() => downloadPdf('activity')} disabled={!!downloading}
              className="rounded-none uppercase text-xs font-bold tracking-wider border-2 h-12 justify-start" data-testid="download-activity-pdf">
              <BarChart3 size={14} className="mr-2 shrink-0" />
              {downloading === 'activity' ? "Generating..." : "Activity PDF"}
            </Button>
            <Button variant="outline" onClick={() => downloadPdf('overdue')} disabled={!!downloading}
              className="rounded-none uppercase text-xs font-bold tracking-wider border-2 h-12 justify-start" data-testid="download-overdue-pdf">
              <Clock size={14} className="mr-2 shrink-0" />
              {downloading === 'overdue' ? "Generating..." : "Overdue PDF"}
            </Button>
            <Button variant="outline" onClick={downloadCsv}
              className="rounded-none uppercase text-xs font-bold tracking-wider border-2 h-12 justify-start" data-testid="download-csv">
              <Download size={14} className="mr-2 shrink-0" /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Snapshot */}
      {summary && (
        <Card className="rounded-sm shadow-none border border-border" data-testid="inventory-snapshot">
          <CardHeader className="pb-2">
            <CardTitle className="font-['Barlow_Condensed'] text-lg uppercase tracking-tight flex items-center gap-2">
              <Wrench size={16} /> Inventory Snapshot
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3 border border-border bg-emerald-500/5">
                <p className="text-xs uppercase font-bold text-muted-foreground">Available</p>
                <p className="text-2xl font-black font-['Barlow_Condensed'] text-emerald-500">{summary.inventory.available}</p>
              </div>
              <div className="p-3 border border-border bg-blue-500/5">
                <p className="text-xs uppercase font-bold text-muted-foreground">Checked Out</p>
                <p className="text-2xl font-black font-['Barlow_Condensed'] text-blue-500">{summary.inventory.checked_out}</p>
              </div>
              <div className="p-3 border border-border bg-rose-500/5">
                <p className="text-xs uppercase font-bold text-muted-foreground">Maintenance</p>
                <p className="text-2xl font-black font-['Barlow_Condensed'] text-rose-500">{summary.inventory.maintenance}</p>
              </div>
              <div className="p-3 border border-border">
                <p className="text-xs uppercase font-bold text-muted-foreground">Total</p>
                <p className="text-2xl font-black font-['Barlow_Condensed']">{summary.inventory.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Users & Tools */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="rounded-sm shadow-none border border-border" data-testid="top-users-card">
            <CardHeader className="pb-2">
              <CardTitle className="font-['Barlow_Condensed'] text-lg uppercase tracking-tight flex items-center gap-2">
                <Users size={16} /> Most Active Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summary.top_users.length > 0 ? (
                <div className="space-y-2">
                  {summary.top_users.map((u, i) => (
                    <div key={i} className="flex items-center justify-between p-2 border-b border-border last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}.</span>
                        <span className="text-sm font-medium">{u.name}</span>
                      </div>
                      <Badge variant="outline" className="rounded-full text-xs">{u.actions} actions</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No activity in this period</p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-sm shadow-none border border-border" data-testid="top-tools-card">
            <CardHeader className="pb-2">
              <CardTitle className="font-['Barlow_Condensed'] text-lg uppercase tracking-tight flex items-center gap-2">
                <TrendingUp size={16} /> Most Used Tools
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summary.top_tools.length > 0 ? (
                <div className="space-y-2">
                  {summary.top_tools.map((t, i) => (
                    <div key={i} className="flex items-center justify-between p-2 border-b border-border last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}.</span>
                        <span className="text-sm font-['JetBrains_Mono'] font-medium">{t.asset_id}</span>
                      </div>
                      <Badge variant="outline" className="rounded-full text-xs">{t.uses} uses</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No activity in this period</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Overdue Section */}
      {summary?.overdue_count > 0 && (
        <Card className="rounded-sm shadow-none border-2 border-amber-500/30 bg-amber-500/5" data-testid="overdue-report-section">
          <CardHeader className="pb-2">
            <CardTitle className="font-['Barlow_Condensed'] text-lg uppercase tracking-tight flex items-center gap-2">
              <Clock size={16} className="text-amber-500" /> Overdue Tools
              <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-full text-xs font-bold">{summary.overdue_count}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {summary.overdue_details.map(co => (
                <div key={co.id} className="flex items-center justify-between p-2 border border-border bg-card rounded-sm text-sm">
                  <div>
                    <span className="font-['JetBrains_Mono'] font-medium">{co.tool_asset_id}</span>
                    <span className="text-muted-foreground ml-2">{co.tool_description}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-amber-600 dark:text-amber-400">{co.checked_out_by_name}</p>
                    <p className="text-xs text-muted-foreground">Due: {co.expected_return_date?.slice(0,10)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
