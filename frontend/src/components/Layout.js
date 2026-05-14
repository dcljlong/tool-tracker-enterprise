import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Calendar,
  BookOpen,
  Building2,
  Clock3,
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
    icon: BookOpen,
    label: "LLD",
    description: "Site diary",
  },
  {
    href: process.env.REACT_APP_TIMESHEET_MANAGER_URL || "http://localhost:3001",
    icon: Clock3,
    label: "Timesheet",
    description: "Labour control",
  },
  {
    href: process.env.REACT_APP_FITOUTOS_URL || "http://localhost:3004",
    icon: Building2,
    label: "FitoutOS",
    description: "Programme control",
  },
];

function SuiteIconMark({ icon: Icon }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.62rem] border border-[rgba(245,190,80,0.36)] bg-[radial-gradient(circle_at_35%_25%,rgba(245,190,80,0.18),transparent_48%),linear-gradient(135deg,rgba(245,190,80,0.11),rgba(255,255,255,0.035))] text-[hsl(38,92%,50%)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.045),0_8px_18px_rgba(0,0,0,0.14)] transition-colors duration-150 group-hover:border-[rgba(245,190,80,0.62)] group-hover:bg-[radial-gradient(circle_at_35%_25%,rgba(245,190,80,0.28),transparent_48%),linear-gradient(135deg,rgba(245,190,80,0.17),rgba(255,255,255,0.055))] group-hover:text-[hsl(38,92%,66%)]">
      <Icon size={16} strokeWidth={2.35} />
    </span>
  );
}
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
          "group mx-2 flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium tracking-normal transition-all duration-150",
          isActive
            ? "border-[rgba(245,190,80,0.42)] bg-[linear-gradient(135deg,rgba(245,190,80,0.18),rgba(245,190,80,0.05))] text-[hsl(38,92%,50%)] shadow-[0_12px_28px_rgba(0,0,0,0.18)]"
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
          <span className="hidden">
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
      className="group mx-2 flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium tracking-normal text-slate-300 transition-all duration-150 hover:bg-white/5 hover:text-white"
      data-testid={`suite-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
     target="_blank" rel="noopener noreferrer">
      <SuiteIconMark icon={Icon} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold uppercase tracking-wider">
          {item.label}
        </span>
        {item.description && (
          <span className="hidden">
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

  const SidebarContent = ({ onNav, showFooterActions = true }) => (
    <div className="flex h-full flex-col overflow-hidden bg-[linear-gradient(180deg,#050916_0%,#07111f_46%,#020617_100%)] text-slate-100">
      <div className="border-b border-[rgba(245,190,80,0.18)] bg-[radial-gradient(circle_at_top_left,rgba(245,190,80,0.22),transparent_42%),linear-gradient(135deg,rgba(15,23,42,1),rgba(2,6,23,1))] px-4 py-4">
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
            <img src={toolTrackerLogo} alt="Tool Tracker logo" className="h-[4.65rem] w-[4.65rem] shrink-0 object-contain drop-shadow-[0_14px_24px_rgba(0,0,0,0.38)]" />
            <div className="min-w-0">
              <p className="truncate text-[0.58rem] font-black uppercase tracking-[0.24em] text-[hsl(38,92%,58%)]">
                Long Line
              </p>
              <h1 className="truncate font-['Barlow_Condensed'] text-xl font-black uppercase tracking-widest text-slate-50">
                Tool Tracker
              </h1>
              <p className="truncate text-[0.57rem] font-bold uppercase tracking-[0.18em] text-[hsl(38,92%,62%)]">
                Tool & Asset Control
              </p>
            </div>
          </div>
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="px-3 pt-1.5 pb-1 text-[0.61rem] font-black uppercase tracking-[0.20em] text-slate-500">
            Operations
          </div>

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

        <div className="mt-2.5 border-t border-[rgba(245,190,80,0.16)] pt-2.5">
          <div className="px-4 pb-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
            Long Line Suite
          </div>
          {SUITE_LINKS.map((item) => (
            <ExternalNavItem key={item.href} item={item} onClick={onNav} />
          ))}
        </div>
      </nav>

      {showFooterActions && (
        <div className="mt-auto border-t border-[rgba(245,190,80,0.16)] p-3">
          {/* TOOL TRACKER RAIL FOOTER PARITY V1 */}
          {/* TOOL TRACKER RAIL RHYTHM V2 */}
          {/* TOOL TRACKER RAIL FINAL VISUAL POLISH V4 */}
          <div className="px-3 pb-2 text-[10px] font-black uppercase tracking-[0.22em] text-[hsl(38,92%,56%)]">
            Account
          </div>
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-[rgba(245,190,80,0.20)] bg-[linear-gradient(135deg,rgba(245,190,80,0.13),rgba(255,255,255,0.035))] px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.035)]">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(38,92%,50%)] text-sm font-black text-black shadow-[0_10px_22px_rgba(245,158,11,0.22)]">
              {getUserInitial(user)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-100">{displayName}</p>
              <p className="truncate text-xs uppercase tracking-wider text-slate-400">
                Tool Tracker
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="h-9 w-10 rounded-xl border border-[rgba(245,190,80,0.18)] p-0 text-xs font-bold uppercase tracking-wider text-slate-200 hover:border-[rgba(245,190,80,0.38)] hover:bg-[rgba(245,190,80,0.11)] hover:text-white"
              data-testid="theme-toggle"
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
              <span className="sr-only">{theme === "dark" ? "Light" : "Dark"}</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="h-9 w-full rounded-xl border border-[rgba(245,190,80,0.18)] text-xs font-bold uppercase tracking-wider text-slate-200 hover:border-[rgba(245,190,80,0.38)] hover:bg-[rgba(245,190,80,0.11)] hover:text-white"
              data-testid="logout-btn"
            >
              <LogOut size={14} />
              <span>Logout</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[272px] border-r border-[rgba(245,190,80,0.18)] bg-slate-950 lg:flex">
        <SidebarContent showFooterActions />
      </aside>
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-[rgba(245,190,80,0.20)] bg-[radial-gradient(circle_at_top_left,rgba(245,190,80,0.15),transparent_28%),linear-gradient(180deg,#050916_0%,#080d18_100%)] text-slate-100 shadow-[0_14px_34px_rgba(15,23,42,0.22)] backdrop-blur-md lg:hidden">
        <div className="flex min-h-[3.95rem] items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-lg border border-white/10 bg-white/5 text-slate-100 hover:border-[rgba(245,190,80,0.30)] hover:bg-[rgba(245,190,80,0.12)] sm:hidden"
                  data-testid="mobile-menu-btn"
                  aria-label="Open navigation"
                >
                  <Menu size={20} />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SidebarContent onNav={closeMobileNav} showFooterActions />
              </SheetContent>
            </Sheet>

            <button
              type="button"
              onClick={() => {
                navigate("/");
                closeMobileNav();
              }}
              className="flex min-w-0 items-center gap-3 text-left"
              data-testid="compact-logo-link"
            >
              <img src={toolTrackerLogo} alt="Tool Tracker logo" className="h-10 w-10 shrink-0 object-contain" />
              <span className="min-w-0 leading-none">
                <span className="block truncate text-[0.58rem] font-black uppercase tracking-[0.24em] text-[hsl(38,92%,50%)]">
                  Long Line
                </span>
                <span className="mt-0.5 block truncate text-[1.02rem] font-black uppercase tracking-[0.08em] text-white">
                  Tool Tracker
                </span>
                <span className="mt-0.5 block truncate text-[0.58rem] font-bold uppercase tracking-[0.20em] text-slate-400">
                  Tool &amp; Asset Control
                </span>
              </span>
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={toggleTheme}
              className="h-9 w-9 rounded-md border border-white/10 bg-white/5 text-slate-100 shadow-none hover:border-[rgba(245,190,80,0.30)] hover:bg-[rgba(245,190,80,0.12)]"
              data-testid="mobile-theme-toggle"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={handleLogout}
              className="h-9 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-semibold tracking-normal text-slate-200 shadow-none hover:border-[rgba(245,190,80,0.30)] hover:bg-[rgba(245,190,80,0.12)] hover:text-white"
              data-testid="mobile-logout-btn"
            >
              <LogOut size={16} />
              <span>Logout</span>
            </Button>
          </div>
        </div>

        <div className="border-t border-white/10 px-3 pb-2">
          <nav className="flex gap-1 overflow-x-auto py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Tool Tracker compact navigation">
            {visibleNavItems.filter((item) => !["users", "settings"].includes(String(item.label).toLowerCase())).map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={closeMobileNav}
                  className={({ isActive }) =>
                    `flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-sm font-semibold transition ${
                      isActive
                        ? "border-[rgba(245,190,80,0.34)] bg-[rgba(245,190,80,0.16)] text-[hsl(38,92%,56%)] shadow-none"
                        : "border-transparent bg-transparent text-slate-300 hover:border-white/10 hover:bg-white/5 hover:text-white"
                    }`
                  }
                >
                  <Icon size={14} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
              <span className="mx-1 h-5 w-px shrink-0 bg-white/10" aria-hidden="true" />

              <a
                href={process.env.REACT_APP_LONG_LINE_DIARY_URL || "http://localhost:3003/dashboard"}
                className="compact-suite-link shrink-0 rounded-md px-2.5 py-1.5 text-sm font-semibold text-[hsl(38,92%,56%)] transition hover:bg-white/5 hover:text-white"
                data-testid="compact-suite-lld"
              >
                LLD
              </a>

              <a
                href={process.env.REACT_APP_TIMESHEET_MANAGER_URL || "http://localhost:3001/dashboard"}
                className="compact-suite-link shrink-0 rounded-md px-2.5 py-1.5 text-sm font-semibold text-[hsl(38,92%,56%)] transition hover:bg-white/5 hover:text-white"
                data-testid="compact-suite-timesheet"
              >
                Timesheet
              </a>

              <a
                href={process.env.REACT_APP_FITOUTOS_URL || "http://localhost:3004/dashboard"}
                className="compact-suite-link shrink-0 rounded-md px-2.5 py-1.5 text-sm font-semibold text-[hsl(38,92%,56%)] transition hover:bg-white/5 hover:text-white"
                data-testid="compact-suite-fitoutos"
              >
                FitoutOS
              </a>
          </nav>
        </div>
      </header>
      <div className="lg:pl-[272px]">
        <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(245,190,80,0.14),transparent_30%),linear-gradient(180deg,#f8f5ee_0%,#f3efe4_100%)] pt-[7.6rem] dark:bg-[radial-gradient(circle_at_top_right,rgba(245,190,80,0.10),transparent_34%),linear-gradient(180deg,#07111f_0%,#020617_100%)] lg:pt-0">
          <div className="w-full px-4 py-5 sm:px-5 lg:px-7 lg:py-6">
            <div className="page-enter">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

