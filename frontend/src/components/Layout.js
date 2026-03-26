import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useState, useEffect } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard, Wrench, Users, Settings, Bell, LogOut,
  Menu, Sun, Moon, ChevronRight, FileText, FolderOpen, Calendar, ScanLine
} from "lucide-react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", roles: ["admin", "site_manager", "worker"] },
  { to: "/scan", icon: ScanLine, label: "Scan QR", roles: ["admin", "site_manager", "worker"] },
  { to: "/tools", icon: Wrench, label: "Tools", roles: ["admin", "site_manager", "worker"] },
  { to: "/calendar", icon: Calendar, label: "Calendar", roles: ["admin", "site_manager", "worker"] },
  { to: "/categories", icon: FolderOpen, label: "Categories", roles: ["admin"] },
  { to: "/reports", icon: FileText, label: "Reports", roles: ["admin", "site_manager"] },
  { to: "/users", icon: Users, label: "Users", roles: ["admin", "site_manager"] },
  { to: "/settings", icon: Settings, label: "Settings", roles: ["admin"] },
];

function NavItem({ to, icon: Icon, label, end, badge, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      data-testid={`nav-${label.toLowerCase()}`}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 text-sm font-medium uppercase tracking-wider transition-colors duration-150 border-l-2 ${
          isActive
            ? "border-[hsl(38,92%,50%)] bg-[hsl(38,92%,50%)]/10 text-[hsl(38,92%,50%)]"
            : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent"
        }`
      }
    >
      <Icon size={18} />
      <span>{label}</span>
      {badge > 0 && <Badge className="ml-auto bg-[hsl(346,77%,50%)] text-white text-xs px-1.5 py-0 min-w-[20px] h-5 flex items-center justify-center rounded-full">{badge}</Badge>}
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const fetchCount = () => {
      api.get('/notifications/unread-count').then(res => setUnreadCount(res.data.count)).catch(() => {});
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };
  const filtered = navItems.filter(n => n.roles.includes(user?.role));

  const SidebarContent = ({ onNav }) => (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <h1 className="font-['Barlow_Condensed'] text-xl font-black uppercase tracking-widest text-[hsl(38,92%,50%)]" data-testid="app-title">
          Tool Tracker
        </h1>
        <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">NZ Construction</p>
      </div>
      <nav className="flex-1 py-4 space-y-1">
        {filtered.map(item => (
          <NavItem key={item.to} {...item} end={item.to === "/"} onClick={onNav} />
        ))}
        <NavItem to="/notifications" icon={Bell} label="Notifications" badge={unreadCount} onClick={onNav} />
      </nav>
      <div className="p-4 border-t border-border space-y-3">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-sm bg-[hsl(38,92%,50%)] flex items-center justify-center text-black font-bold text-sm">
            {user?.name?.charAt(0)?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{user?.role?.replace('_', ' ')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={toggleTheme} className="flex-1 h-9 rounded-none" data-testid="theme-toggle">
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            <span className="ml-2 text-xs uppercase">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="flex-1 h-9 rounded-none text-destructive" data-testid="logout-btn">
            <LogOut size={14} />
            <span className="ml-2 text-xs uppercase">Logout</span>
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-border bg-card fixed h-screen">
        <SidebarContent />
      </aside>
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-card border-b border-border flex items-center px-4 gap-3">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm" className="rounded-none p-2" data-testid="mobile-menu-btn">
              <Menu size={20} />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <SidebarContent onNav={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
        <h1 className="font-['Barlow_Condensed'] text-lg font-black uppercase tracking-widest text-[hsl(38,92%,50%)]">
          Tool Tracker
        </h1>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" className="bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none px-3 h-9 uppercase text-xs font-bold tracking-wider" onClick={() => { navigate('/scan'); setMobileOpen(false); }} data-testid="mobile-scan-btn">
            <ScanLine size={16} className="mr-1" /> Scan
          </Button>
          <Button variant="ghost" size="sm" className="rounded-none p-2 relative" onClick={() => { navigate('/notifications'); setMobileOpen(false); }} data-testid="mobile-notifications-btn">
            <Bell size={18} />
            {unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[hsl(346,77%,50%)] text-white text-[10px] rounded-full flex items-center justify-center">{unreadCount}</span>}
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleTheme} className="rounded-none p-2">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </Button>
        </div>
      </div>
      {/* Main content */}
      <main className="flex-1 lg:ml-64 pt-14 lg:pt-0 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 page-enter">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
