import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Calendar,
  ExternalLink,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ScanLine,
  Settings,
  Sun,
  Users,
  Wrench,
} from "lucide-react";

import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import toolTrackerLogo from "@/assets/tool-tracker-logo.png";

const NAV_ITEMS = [
  {
    to: "/",
    icon: LayoutDashboard,
    label: "Dashboard",
    description: "Fleet overview",
    roles: ["admin", "site_manager", "worker"],
    end: true,
  },
  {
    to: "/scan",
    icon: ScanLine,
    label: "Scan QR",
    description: "Fast checkout",
    roles: ["admin", "site_manager", "worker"],
  },
  {
    to: "/tools",
    icon: Wrench,
    label: "Tools",
    description: "Catalog & status",
    roles: ["admin", "site_manager", "worker"],
  },
  {
    to: "/calendar",
    icon: Calendar,
    label: "Calendar",
    description: "Returns & servicing",
    roles: ["admin", "site_manager", "worker"],
  },
  {
    to: "/categories",
    icon: FolderOpen,
    label: "Categories",
    description: "Tool groups",
    roles: ["admin"],
  },
  {
    to: "/reports",
    icon: FileText,
    label: "Reports",
    description: "Exports & audit",
    roles: ["admin", "site_manager"],
  },
  {
    to: "/users",
    icon: Users,
    label: "Users",
    description: "Crew access",
    roles: ["admin", "site_manager"],
  },
  {
    to: "/settings",
    icon: Settings,
    label: "Settings",
    description: "System setup",
    roles: ["admin"],
  },
];

const PAGE_TITLES = {
  "/": "Dashboard",
  "/scan": "Scan QR",
  "/tools": "Tool Catalog",
  "/calendar": "Calendar",
  "/categories": "Categories",
  "/reports": "Reports",
  "/users": "User Management",
  "/settings": "Settings",
  "/notifications": "Notifications",
};

const SUITE_LINKS = [
  {
    href: process.env.REACT_APP_LONG_LINE_DIARY_URL || "http://localhost:3003/dashboard",
    icon: LayoutDashboard,
    label: "Long Line Diary",
    description: "Site diary",
  },
];

function formatRole(role) {
  if (!role) return "User";
  return role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getDisplayName(user) {
  return user?.name || user?.full_name || user?.email || "Tool Tracker User";
}

function getUserInitial(user) {
  const value = getDisplayName(user).trim();
  return value ? value.charAt(0).toUpperCase() : "U";
}

function getCurrentPageTitle(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];

  if (pathname.startsWith("/tools/")) return "Tool Detail";

  const firstSegment = `/${pathname.split("/").filter(Boolean)[0] || ""}`;
  return PAGE_TITLES[firstSegment] || "Tool Tracker";
}

function canSeeItem(item, userRole) {
  if (!item.roles || item.roles.length === 0) return true;
  if (!userRole) return true;
  return item.roles.includes(userRole);
}

function NavItem({ item, badge, onClick }) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onClick}
      data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
      className={({ isActive }) =>
        [
          "group mx-3 flex items-center gap-3 rounded-2xl border-l-2 px-3 py-3 text-sm transition-all duration-150",
          isActive
            ? "border-[hsl(38,92%,50%)] bg-[linear-gradient(135deg,rgba(245,190,80,0.18),rgba(245,190,80,0.05))] text-[hsl(38,92%,50%)] shadow-[0_14px_34px_rgba(0,0,0,0.22)]"
            : "border-transparent text-slate-300 hover:bg-white/5 hover:text-white",
        ].join(" ")
      }
    >
      <Icon size={18} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold uppercase tracking-wider">
          {item.label}
        </span>
        {item.description && (
          <span className="mt-0.5 hidden truncate text-[11px] font-normal normal-case tracking-normal text-muted-foreground xl:block">
            {item.description}
          </span>
        )}
      </span>
      {badge > 0 && (
        <Badge className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[hsl(346,77%,50%)] px-1.5 py-0 text-xs text-white">
          {badge}
        </Badge>
      )}
    </NavLink>
  );
}

function ExternalNavItem({ item, onClick }) {
  const Icon = item.icon;

  return (
    <a
      href={item.href}
      onClick={onClick}
      className="group mx-3 flex items-center gap-3 rounded-2xl border-l-2 border-transparent px-3 py-3 text-sm text-slate-300 transition-all duration-150 hover:bg-white/5 hover:text-white"
      data-testid={`suite-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
     target="_blank" rel="noopener noreferrer">
      <Icon size={18} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold uppercase tracking-wider">
          {item.label}
        </span>
        {item.description && (
          <span className="mt-0.5 hidden truncate text-[11px] font-normal normal-case tracking-normal text-muted-foreground xl:block">
            {item.description}
          </span>
        )}
      </span>
      <ExternalLink size={15} className="shrink-0 text-slate-500" />
    </a>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  const displayName = getDisplayName(user);
  const roleLabel = formatRole(user?.role);
  const currentPageTitle = getCurrentPageTitle(location.pathname);

  const visibleNavItems = useMemo(
    () => NAV_ITEMS.filter((item) => canSeeItem(item, user?.role)),
    [user?.role],
  );

  useEffect(() => {
    let active = true;

    const fetchUnreadCount = async () => {
      try {
        const response = await api.get("/notifications/unread-count");
        if (active) setUnreadCount(Number(response.data?.count || 0));
      } catch {
        if (active) setUnreadCount(0);
      }
    };

    fetchUnreadCount();
    const interval = window.setInterval(fetchUnreadCount, 30000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const closeMobileNav = () => setMobileOpen(false);

  const SidebarContent = ({ onNav, showFooterActions = false }) => (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      <div className="border-b border-[rgba(245,190,80,0.18)] bg-[radial-gradient(circle_at_top_left,rgba(245,190,80,0.18),transparent_38%),linear-gradient(135deg,rgba(15,23,42,1),rgba(2,6,23,1))] px-5 py-6">
        <button
          type="button"
          onClick={() => {
            navigate("/");
            if (onNav) onNav();
          }}
          className="block w-full text-left"
          data-testid="app-title"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[1.35rem] border border-[rgba(245,190,80,0.48)] bg-black/35 shadow-[0_18px_44px_rgba(0,0,0,0.34)]">
              <img src={toolTrackerLogo} alt="Tool Tracker logo" className="h-full w-full object-contain p-1" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.26em] text-[hsl(38,92%,50%)]">
                Long Line
              </p>
              <h1 className="truncate font-['Barlow_Condensed'] text-2xl font-black uppercase tracking-widest text-slate-50">
                Tool Tracker
              </h1>
              <p className="truncate text-xs uppercase tracking-wider text-slate-400">
                Tool & Asset Control
              </p>
            </div>
          </div>
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto py-4">
        {visibleNavItems.map((item) => (
          <NavItem key={item.to} item={item} onClick={onNav} />
        ))}

        <NavItem
          item={{
            to: "/notifications",
            icon: Bell,
            label: "Notifications",
            description: "Alerts & actions",
            roles: ["admin", "site_manager", "worker"],
          }}
          badge={unreadCount}
          onClick={onNav}
        />

        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="px-4 pb-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
            Long Line Suite
          </div>
          {SUITE_LINKS.map((item) => (
            <ExternalNavItem key={item.href} item={item} onClick={onNav} />
          ))}
        </div>
      </nav>

      {showFooterActions && (
        <div className="border-t border-white/10 p-4">
          <div className="mb-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[hsl(38,92%,50%)] text-sm font-black text-black">
              {getUserInitial(user)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-100">{displayName}</p>
              <p className="truncate text-xs uppercase tracking-wider text-slate-400">
                {roleLabel}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="h-9 rounded-xl border border-white/10 text-xs uppercase tracking-wider text-slate-200 hover:bg-white/5"
              data-testid="theme-toggle"
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
              <span className="ml-2">{theme === "dark" ? "Light" : "Dark"}</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="h-9 rounded-xl border border-white/10 text-xs uppercase tracking-wider text-red-300 hover:bg-red-500/10"
              data-testid="logout-btn"
            >
              <LogOut size={14} />
              <span className="ml-2">Log out</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-72 border-r border-[rgba(245,190,80,0.18)] bg-slate-950 lg:flex">
        <SidebarContent />
      </aside>

      <header className="fixed left-0 right-0 top-0 z-50 flex h-14 items-center gap-3 border-b border-[rgba(245,190,80,0.18)] bg-slate-950 px-4 text-slate-100 lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-none p-2"
              data-testid="mobile-menu-btn"
            >
              <Menu size={20} />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SidebarContent onNav={closeMobileNav} showFooterActions />
          </SheetContent>
        </Sheet>

        <div className="min-w-0 flex-1">
          <p className="truncate font-['Barlow_Condensed'] text-lg font-black uppercase tracking-widest text-[hsl(38,92%,50%)]">
            Tool Tracker
          </p>
          <p className="-mt-1 truncate text-[11px] uppercase tracking-wider text-muted-foreground">
            {currentPageTitle}
          </p>
        </div>

        <Button
          type="button"
          size="sm"
          className="h-9 rounded-none bg-[hsl(38,92%,50%)] px-3 text-xs font-black uppercase tracking-wider text-black hover:bg-[hsl(38,92%,45%)]"
          onClick={() => {
            navigate("/scan");
            closeMobileNav();
          }}
          data-testid="mobile-scan-btn"
        >
          <ScanLine size={16} className="mr-1" />
          Scan
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="relative rounded-none p-2"
          onClick={() => {
            navigate("/notifications");
            closeMobileNav();
          }}
          data-testid="mobile-notifications-btn"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[hsl(346,77%,50%)] text-[10px] text-white">
              {unreadCount}
            </span>
          )}
        </Button>
      </header>

      <div className="lg:pl-72">
        <header className="hidden h-18 items-center justify-between border-b border-[rgba(245,190,80,0.18)] bg-[rgba(255,255,255,0.86)] px-8 backdrop-blur-xl lg:flex">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[hsl(38,92%,42%)]">
              Long Line Tool Tracker
            </p>
            <h2 className="font-['Barlow_Condensed'] text-2xl font-black uppercase tracking-[0.06em]">
              {currentPageTitle}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="h-9 rounded-xl border border-slate-300 bg-slate-900 px-3 text-xs font-bold uppercase tracking-wider text-slate-100 hover:bg-slate-800"
              data-testid="theme-toggle"
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              <span className="ml-2">{theme === "dark" ? "Light" : "Dark"}</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="h-9 rounded-xl border border-slate-300 bg-slate-900 px-3 text-xs font-bold uppercase tracking-wider text-slate-100 hover:bg-slate-800"
              data-testid="logout-btn"
            >
              <LogOut size={15} className="mr-2" />
              Log out
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-xl border-2 text-xs font-bold uppercase tracking-wider"
              onClick={() => navigate("/notifications")}
              data-testid="desktop-notifications-btn"
            >
              <Bell size={15} className="mr-2" />
              Alerts
              {unreadCount > 0 && (
                <Badge className="ml-2 rounded-full bg-[hsl(346,77%,50%)] px-1.5 py-0 text-xs text-white">
                  {unreadCount}
                </Badge>
              )}
            </Button>

            <Button
              type="button"
              className="h-9 rounded-xl bg-[hsl(38,92%,50%)] px-4 text-xs font-black uppercase tracking-wider text-black shadow-sm hover:bg-[hsl(38,92%,45%)]"
              onClick={() => navigate("/scan")}
              data-testid="desktop-scan-btn"
            >
              <ScanLine size={15} className="mr-2" />
              Scan QR
            </Button>
          </div>
        </header>

        <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(245,190,80,0.14),transparent_30%),linear-gradient(180deg,#f8f5ee_0%,#f3efe4_100%)] pt-14 lg:pt-0">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
            <div className="page-enter">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
