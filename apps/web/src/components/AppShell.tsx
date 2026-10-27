import { useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import {
  LayoutDashboard,
  Package,
  Send,
  Route as RouteIcon,
  MapPin,
  Building2,
  Users,
  Truck,
  Waypoints,
  Fuel,
  BarChart3,
  ShieldCheck,
  UserCog,
  DatabaseZap,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronDown,
  Bell,
  Plus,
  Search,
} from "lucide-react";
import { useAuth, canWrite } from "../lib/auth";
import { ROLE_LABELS } from "@doxin/shared";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  roles?: string[];
}

const groups: { label: string; items: NavItem[] }[] = [
  {
    label: "Operations",
    items: [
      { to: "/", label: "Overview", icon: <LayoutDashboard className="h-[17px] w-[17px]" />, end: true },
      { to: "/loads", label: "Loads", icon: <Package className="h-[17px] w-[17px]" /> },
      { to: "/dispatch", label: "Dispatch board", icon: <Send className="h-[17px] w-[17px]" /> },
      { to: "/trips", label: "Trips", icon: <RouteIcon className="h-[17px] w-[17px]" /> },
      { to: "/tracking", label: "Tracking", icon: <MapPin className="h-[17px] w-[17px]" /> },
    ],
  },
  {
    label: "Network",
    items: [
      { to: "/customers", label: "Customers", icon: <Building2 className="h-[17px] w-[17px]" /> },
      { to: "/drivers", label: "Drivers", icon: <Users className="h-[17px] w-[17px]" /> },
      { to: "/fleet", label: "Fleet", icon: <Truck className="h-[17px] w-[17px]" /> },
      { to: "/network", label: "Lanes & facilities", icon: <Waypoints className="h-[17px] w-[17px]" /> },
    ],
  },
  {
    label: "Performance",
    items: [
      { to: "/fuel", label: "Fuel", icon: <Fuel className="h-[17px] w-[17px]" /> },
      { to: "/analytics", label: "Analytics", icon: <BarChart3 className="h-[17px] w-[17px]" /> },
      { to: "/safety", label: "Safety", icon: <ShieldCheck className="h-[17px] w-[17px]" /> },
    ],
  },
  {
    label: "Workspace",
    items: [
      { to: "/team", label: "Administrators", icon: <UserCog className="h-[17px] w-[17px]" />, roles: ["ADMIN"] },
      { to: "/imports", label: "Data imports", icon: <DatabaseZap className="h-[17px] w-[17px]" />, roles: ["ADMIN"] },
      { to: "/settings", label: "Settings", icon: <Settings className="h-[17px] w-[17px]" /> },
    ],
  },
];

const titles: Record<string, string> = {
  "/": "Overview",
  "/loads": "Loads",
  "/dispatch": "Dispatch board",
  "/trips": "Trips",
  "/tracking": "Tracking",
  "/customers": "Customers",
  "/drivers": "Drivers",
  "/fleet": "Fleet",
  "/network": "Lanes & facilities",
  "/fuel": "Fuel",
  "/analytics": "Analytics",
  "/safety": "Safety",
  "/team": "Administrators",
  "/imports": "Data imports",
  "/settings": "Settings",
};

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const workspaceName = user?.tenantName ?? "Platform administration";
  const title = titles[location.pathname] ?? user?.tenantName ?? "Doxin";

  const sidebar = (
    <div className="flex h-full flex-col bg-ink-950 text-ink-200">
      <div className="flex h-16 items-center justify-between px-5">
        <NavLink to="/" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white">
            <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
              <path d="M6 24V8h9c4.5 0 7.5 3 7.5 8s-3 8-7.5 8H6Zm5-4.2h3.7c2.1 0 3.4-1.3 3.4-3.8s-1.3-3.8-3.4-3.8H11v7.6Z" fill="#0E1520" />
              <circle cx="25" cy="24" r="3.4" fill="rgb(var(--signal-500))" />
            </svg>
          </span>
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-white">doxin</span>
          <span className="ml-1 rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-ink-400">ops</span>
        </NavLink>
        <button className="text-ink-400 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      </div>

      <button
        onClick={() => navigate("/settings")}
        className="mx-3 mb-4 flex items-center gap-2 rounded-lg border border-ink-800 bg-ink-900 px-3 py-2.5 text-left transition-colors hover:border-ink-700"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded bg-signal-500/15 text-[10px] font-bold text-signal-400">
          {user?.tenantName ? user.tenantName.slice(0, 2).toUpperCase() : "PA"}
        </span>
        <span className="flex-1">
          <span className="block truncate text-[12px] font-medium text-ink-100">{workspaceName}</span>
          <span className="block text-[10px] text-ink-500">
            {user?.role === "PLATFORM_ADMIN" ? "Platform console" : "Isolated tenant workspace"}
          </span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-ink-500" />
      </button>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {groups.map((group) => {
          const visible = group.items.filter((item) => !item.roles || (user && item.roles.includes(user.role)));
          if (!visible.length) return null;
          return (
            <div key={group.label}>
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-600">{group.label}</p>
              <div className="space-y-0.5">
                {visible.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      clsx(
                        "group flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors",
                        isActive
                          ? "nav-active bg-white/[0.07] text-white"
                          : "text-ink-400 hover:bg-white/[0.04] hover:text-ink-100",
                      )
                    }
                  >
                    {item.icon}
                    <span className="flex-1">{item.label}</span>
                    {item.label === "Dispatch board" ? (
                      <span className="rounded bg-signal-500/15 px-1.5 py-px font-mono text-[9px] font-medium text-signal-400">LIVE</span>
                    ) : null}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-ink-800/80 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-800 font-mono text-[11px] text-ink-200">
            {user?.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium text-ink-100">{user?.name}</p>
            <p className="truncate text-[10px] text-ink-500">{user ? ROLE_LABELS[user.role] : ""}</p>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="rounded p-1.5 text-ink-500 transition-colors hover:bg-ink-800 hover:text-ink-200"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-paper">
      <aside className="hidden w-[236px] shrink-0 lg:block">{sidebar}</aside>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[260px]">{sidebar}</div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-ink-100 bg-paper/90 px-4 backdrop-blur-sm sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-[13px]">
              <span className="hidden text-ink-400 sm:inline">Operations</span>
              <span className="hidden text-ink-300 sm:inline">/</span>
              <span className="font-medium text-ink-900">{title}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden md:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
              <button
                onClick={() => navigate("/loads")}
                className="flex h-8 w-56 items-center rounded-md border border-ink-200 bg-white pl-8 text-left text-[12px] text-ink-400 hover:border-ink-300"
              >
                Search loads…
                <span className="ml-auto mr-2 kbd">⌘K</span>
              </button>
            </div>
            <button
              className="relative rounded-md border border-ink-200 bg-white p-2 text-ink-500 hover:text-ink-800"
              onClick={() => navigate("/loads?status=EXCEPTION")}
              aria-label="Open exception queue"
              title="Open exception queue"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-signal-500" />
            </button>
            {canWrite(user?.role, "dispatch") ? (
              <button
                onClick={() => navigate("/loads?new=1")}
                className="btn-primary h-8 px-3 text-[12px]"
              >
                <Plus className="h-3.5 w-3.5" /> New load
              </button>
            ) : null}
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-900 font-mono text-[10px] font-medium text-white"
              >
                {user?.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)}
              </button>
              {menuOpen ? (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-10 z-20 w-52 rounded-lg border border-ink-100 bg-white p-1 shadow-lift animate-rise">
                    <div className="border-b border-ink-100 px-2.5 py-2">
                      <p className="text-[13px] font-medium text-ink-900">{user?.name}</p>
                      <p className="truncate text-[11px] text-ink-500">{user?.email}</p>
                    </div>
                    <button onClick={() => { setMenuOpen(false); navigate("/settings"); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] text-ink-700 hover:bg-ink-50">
                      <Settings className="h-3.5 w-3.5" /> Account settings
                    </button>
                    <button onClick={logout} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] text-red-600 hover:bg-red-50">
                      <LogOut className="h-3.5 w-3.5" /> Sign out
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
