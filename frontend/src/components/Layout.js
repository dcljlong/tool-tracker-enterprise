import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Calendar,
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
          "group flex items-center gap-3 border-l-2 px-4 py-3 text-sm transition-colors duration-150",
          isActive
            ? "border-[hsl(38,92%,50%)] bg-[hsl(38,92%,50%)]/10 text-[hsl(38,92%,50%)]"
            : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
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

  const SidebarContent = ({ onNav }) => (
    <div className="flex h-full flex-col bg-card">
      <div className="border-b border-border px-5 py-5">
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
            <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-[hsl(38,92%,50%)] bg-[hsl(38,92%,50%)] text-sm font-black text-black">
              TT
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-['Barlow_Condensed'] text-xl font-black uppercase tracking-widest text-[hsl(38,92%,50%)]">
                Tool Tracker
              </h1>
              <p className="truncate text-xs uppercase tracking-wider text-muted-foreground">
                NZ Construction
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
      </nav>

      <div className="border-t border-border p-4">
        <div className="mb-3 flex items-center gap-3 rounded-sm border border-border bg-background/60 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-[hsl(38,92%,50%)] text-sm font-black text-black">
            {getUserInitial(user)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{displayName}</p>
            <p className="truncate text-xs uppercase tracking-wider text-muted-foreground">
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
            className="h-9 rounded-none border border-border text-xs uppercase tracking-wider"
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
            className="h-9 rounded-none border border-border text-xs uppercase tracking-wider text-destructive"
            data-testid="logout-btn"
          >
            <LogOut size={14} />
            <span className="ml-2">Logout</span>
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-72 border-r border-border bg-card lg:flex">
        <SidebarContent />
      </aside>

      <header className="fixed left-0 right-0 top-0 z-50 flex h-14 items-center gap-3 border-b border-border bg-card px-4 lg:hidden">
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
            <SidebarContent onNav={closeMobileNav} />
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
        <header className="hidden h-16 items-center justify-between border-b border-border bg-card px-8 lg:flex">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">
              Tool Tracker
            </p>
            <h2 className="font-['Barlow_Condensed'] text-2xl font-black uppercase tracking-tight">
              {currentPageTitle}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-none border-2 text-xs font-bold uppercase tracking-wider"
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
              className="h-9 rounded-none bg-[hsl(38,92%,50%)] px-4 text-xs font-black uppercase tracking-wider text-black hover:bg-[hsl(38,92%,45%)]"
              onClick={() => navigate("/scan")}
              data-testid="desktop-scan-btn"
            >
              <ScanLine size={15} className="mr-2" />
              Scan QR
            </Button>
          </div>
        </header>

        <main className="min-h-screen pt-14 lg:pt-0">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="page-enter">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
