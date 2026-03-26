import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, Wrench, ShieldAlert, FileCheck, Clock, ChevronLeft, ChevronRight } from "lucide-react";

const typeConfig = {
  maintenance: { color: "bg-blue-500", label: "Maintenance", textColor: "text-blue-600 dark:text-blue-400" },
  tag_expiry: { color: "bg-amber-500", label: "Tag Expiry", textColor: "text-amber-600 dark:text-amber-400" },
  certificate_expiry: { color: "bg-rose-500", label: "Cert Expiry", textColor: "text-rose-600 dark:text-rose-400" },
  expected_return: { color: "bg-emerald-500", label: "Due Back", textColor: "text-emerald-600 dark:text-emerald-400" },
};

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("");
  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());

  useEffect(() => {
    api.get('/calendar/events').then(res => setEvents(res.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  };

  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const filtered = filterType ? events.filter(e => e.type === filterType) : events;
  const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
  const monthEvents = filtered.filter(e => e.date?.startsWith(monthStr));
  const todayStr = now.toISOString().slice(0, 10);

  const getEventsForDay = (day) => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return monthEvents.filter(e => e.date === dateStr);
  };

  // Upcoming events list (next 30 days)
  const upcoming = filtered
    .filter(e => e.date >= todayStr && e.date <= new Date(Date.now() + 30*24*60*60*1000).toISOString().slice(0,10))
    .slice(0, 15);

  return (
    <div className="space-y-6" data-testid="calendar-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-['Barlow_Condensed'] text-3xl md:text-4xl font-black uppercase tracking-tight">Calendar</h1>
          <p className="text-muted-foreground text-sm mt-1">Maintenance, certificates & return dates</p>
        </div>
        <Select value={filterType} onValueChange={v => setFilterType(v === "all" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-48 rounded-none border-2" data-testid="calendar-filter">
            <SelectValue placeholder="All Events" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Events</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="tag_expiry">Tag Expiry</SelectItem>
            <SelectItem value="certificate_expiry">Certificate Expiry</SelectItem>
            <SelectItem value="expected_return">Expected Returns</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid */}
        <Card className="lg:col-span-2 rounded-sm shadow-none border border-border" data-testid="calendar-grid">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" className="rounded-none" onClick={prevMonth} data-testid="calendar-prev">
                <ChevronLeft size={16} />
              </Button>
              <CardTitle className="font-['Barlow_Condensed'] text-xl uppercase tracking-tight">
                {monthNames[currentMonth]} {currentYear}
              </CardTitle>
              <Button variant="ghost" size="sm" className="rounded-none" onClick={nextMonth} data-testid="calendar-next">
                <ChevronRight size={16} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-px mb-1">
              {dayNames.map(d => (
                <div key={d} className="text-center text-xs font-bold uppercase text-muted-foreground py-2">{d}</div>
              ))}
            </div>
            {/* Calendar cells */}
            <div className="grid grid-cols-7 gap-px">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[70px] bg-muted/30" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayEvents = getEventsForDay(day);
                const isToday = dateStr === todayStr;
                return (
                  <div key={day} className={`min-h-[70px] p-1 border border-border/50 ${isToday ? 'bg-[hsl(38,92%,50%)]/5 border-[hsl(38,92%,50%)]/30' : 'hover:bg-muted/50'}`}>
                    <p className={`text-xs font-bold ${isToday ? 'text-[hsl(38,92%,50%)]' : 'text-muted-foreground'}`}>{day}</p>
                    <div className="space-y-0.5 mt-0.5">
                      {dayEvents.slice(0, 3).map(ev => {
                        const tc = typeConfig[ev.type] || typeConfig.maintenance;
                        return (
                          <div key={ev.id} className={`text-[9px] leading-tight px-1 py-0.5 truncate cursor-pointer rounded-sm ${tc.color}/15 ${tc.textColor} hover:${tc.color}/25`}
                            onClick={() => navigate(`/tools/${ev.tool_id}`)} title={ev.title}>
                            {ev.title}
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && <p className="text-[9px] text-muted-foreground">+{dayEvents.length - 3} more</p>}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-border">
              {Object.entries(typeConfig).map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-1.5 text-xs">
                  <div className={`w-2.5 h-2.5 rounded-full ${cfg.color}`} />
                  <span className="text-muted-foreground">{cfg.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Events */}
        <Card className="rounded-sm shadow-none border border-border" data-testid="upcoming-events">
          <CardHeader className="pb-2">
            <CardTitle className="font-['Barlow_Condensed'] text-lg uppercase tracking-tight flex items-center gap-2">
              <Clock size={16} /> Upcoming (30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded-sm" />)}</div>
            ) : upcoming.length > 0 ? (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {upcoming.map(ev => {
                  const tc = typeConfig[ev.type] || typeConfig.maintenance;
                  const daysUntil = Math.ceil((new Date(ev.date) - now) / (1000*60*60*24));
                  return (
                    <div key={ev.id} className="p-2 border border-border hover:border-[hsl(38,92%,50%)]/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/tools/${ev.tool_id}`)}>
                      <div className="flex items-start gap-2">
                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${tc.color}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{ev.title}</p>
                          <p className="text-[10px] text-muted-foreground">{ev.description}</p>
                        </div>
                        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 shrink-0 ${daysUntil <= 7 ? 'border-rose-500/30 text-rose-500' : ''}`}>
                          {daysUntil === 0 ? 'Today' : daysUntil === 1 ? '1d' : `${daysUntil}d`}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming events</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
