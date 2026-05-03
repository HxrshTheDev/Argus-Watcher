import { Link, useLocation } from "wouter";
import { useRef, useState, useEffect, useMemo } from "react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupContent, SidebarHeader, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarMenuBadge,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, MessageSquare, CheckSquare, Search, Mail,
  Share2, Zap, Moon, Sun, Bell, BarChart2, X, Clock, AlertCircle, CheckCircle2,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useListTasks } from "@workspace/api-client-react";
import { useNotifications } from "@/hooks/use-notifications";

const NAV_ITEMS = [
  { title: "Dashboard", url: "/",          icon: LayoutDashboard, gradient: "from-blue-500 to-indigo-600" },
  { title: "Chat",      url: "/chat",      icon: MessageSquare,   gradient: "from-violet-500 to-purple-600" },
  { title: "Tracker",   url: "/tracker",   icon: BarChart2,       gradient: "from-teal-500 to-emerald-600" },
  { title: "Research",  url: "/research",  icon: Search,          gradient: "from-purple-500 to-indigo-600" },
  { title: "Email",     url: "/email",     icon: Mail,            gradient: "from-red-500 to-rose-600" },
  { title: "Posts",     url: "/posts",     icon: Share2,          gradient: "from-pink-500 to-rose-500" },
  { title: "Workflows", url: "/workflows", icon: Zap,             gradient: "from-cyan-500 to-sky-600" },
] as const;

const NOTIF_ICON: Record<string, React.ElementType> = {
  overdue_task:    AlertCircle,
  workflow_done:   CheckCircle2,
  workflow_failed: AlertCircle,
};
const NOTIF_GRADIENT: Record<string, string> = {
  overdue_task:    "from-red-500 to-rose-600",
  workflow_done:   "from-emerald-500 to-green-600",
  workflow_failed: "from-red-500 to-rose-600",
};

export default function AppSidebar() {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tasks } = useListTasks({}, { query: { refetchInterval: 60_000 } as any });
  const { notifications, dismiss, snooze, dismissAll } = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const overdueCount = useMemo(() => {
    if (!tasks) return 0;
    const today = new Date().toISOString().split("T")[0];
    return tasks.filter(t => !t.completed && t.dueDate && t.dueDate < today).length;
  }, [tasks]);

  /* Close panel on outside click */
  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notifOpen]);

  const isCurrent = (path: string) => {
    if (path === "/" && location === "/") return true;
    if (path !== "/" && location.startsWith(path)) return true;
    return false;
  };

  const isDark = theme === "dark";

  return (
    <Sidebar variant="inset">
      {/* ── Brand header ── */}
      <SidebarHeader className="px-4 pt-5 pb-4">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/50 to-transparent mb-4 rounded-full" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo orb */}
            <div className="relative w-9 h-9 shrink-0">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary to-violet-600 shadow-lg shadow-primary/30" />
              <div className="absolute inset-0 rounded-xl flex items-center justify-center">
                <span className="text-white font-black text-[15px] tracking-tight leading-none">A</span>
              </div>
              <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-white/25 to-transparent" />
              <div className="absolute inset-0 rounded-xl ring-1 ring-white/15" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-[15px] tracking-tight leading-none">Argus</span>
              </div>
              <span className="text-[11px] text-muted-foreground/60 mt-0.5 block font-medium">Personal AI</span>
            </div>
          </div>

          {/* Notification bell — clickable */}
          <div className="relative" ref={notifRef}>
            {notifications.length > 0 && (
              <button
                onClick={() => setNotifOpen(v => !v)}
                className="relative w-8 h-8 rounded-xl glass-card flex items-center justify-center hover:scale-105 transition-all duration-150 active:scale-95"
                aria-label="Notifications"
              >
                <Bell className={`w-3.5 h-3.5 ${notifOpen ? "text-primary" : "text-destructive"}`} />
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center leading-none">
                  {notifications.length > 9 ? "9+" : notifications.length}
                </span>
              </button>
            )}

            {/* Notifications panel */}
            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 z-50 glass-panel rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-black/8 dark:border-white/8">
                  <span className="text-[11px] font-black uppercase tracking-widest text-foreground/50">Notifications</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { dismissAll(); setNotifOpen(false); }}
                      className="text-[11px] text-primary font-bold hover:text-primary/80 transition-colors">
                      Clear all
                    </button>
                  </div>
                </div>

                {/* List */}
                <div className="divide-y divide-black/8 dark:divide-white/8 max-h-72 overflow-y-auto">
                  {notifications.map(n => {
                    const Icon = NOTIF_ICON[n.type] ?? AlertCircle;
                    const grad = NOTIF_GRADIENT[n.type] ?? "from-slate-400 to-slate-600";
                    return (
                      <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors">
                        <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center shrink-0 mt-0.5 relative overflow-hidden`}>
                          <Icon className="w-3.5 h-3.5 text-white relative z-10" />
                          <div className="absolute inset-0 bg-gradient-to-b from-white/25 to-transparent" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-bold text-foreground leading-tight">{n.title}</p>
                          <p className="text-[11px] text-foreground/50 dark:text-muted-foreground mt-0.5 leading-snug">{n.body}</p>
                          <div className="flex items-center gap-1 mt-1.5">
                            <button onClick={() => snooze(n.id)}
                              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg bg-black/8 dark:bg-white/8 hover:bg-black/12 dark:hover:bg-white/12 text-foreground/50 font-semibold transition-colors">
                              <Clock className="w-2.5 h-2.5" /> Snooze 1h
                            </button>
                          </div>
                        </div>
                        <button onClick={() => dismiss(n.id)}
                          className="w-6 h-6 rounded-lg flex items-center justify-center text-foreground/30 hover:text-foreground/60 hover:bg-black/8 dark:hover:bg-white/8 transition-all shrink-0 mt-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </SidebarHeader>

      {/* ── Navigation ── */}
      <SidebarContent className="px-3 pt-1">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {NAV_ITEMS.map((item) => {
                const active = isCurrent(item.url);
                const isTracker = item.url === "/tracker";
                const badge = isTracker && overdueCount > 0 ? overdueCount : null;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className={`
                        h-[42px] rounded-xl font-medium transition-all duration-200 group/nav
                        ${active
                          ? "bg-primary/12 text-primary hover:bg-primary/15"
                          : "text-sidebar-foreground/75 hover:bg-white/10 dark:hover:bg-white/6 hover:text-sidebar-foreground"
                        }
                      `}
                    >
                      <Link href={item.url} className="flex items-center gap-3 px-2.5">
                        <div className={`
                          relative w-7 h-7 rounded-[8px] flex items-center justify-center shrink-0
                          transition-all duration-200 shadow-sm bg-gradient-to-br ${item.gradient}
                          ${active ? "opacity-100 scale-100" : "opacity-70 group-hover/nav:opacity-100 group-hover/nav:scale-105"}
                        `}>
                          <item.icon className="w-3.5 h-3.5 text-white" />
                          <div className="absolute inset-0 rounded-[8px] bg-gradient-to-b from-white/25 to-transparent" />
                        </div>
                        <span className={`text-[13.5px] font-medium tracking-tight flex-1 ${active ? "font-semibold" : ""}`}>
                          {item.title}
                        </span>
                        {active && <div className="w-1.5 h-1.5 rounded-full bg-primary/70 shrink-0" />}
                      </Link>
                    </SidebarMenuButton>
                    {badge !== null && (
                      <SidebarMenuBadge className="bg-destructive text-white text-[9px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 leading-none">
                        {badge}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ── Footer ── */}
      <SidebarFooter className="px-3 pb-5">
        <div className="h-px bg-sidebar-border/50 mb-3" />
        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl hover:bg-white/10 dark:hover:bg-white/6 transition-colors duration-150 group/theme"
        >
          <div className={`
            w-7 h-7 rounded-[8px] flex items-center justify-center shadow-sm relative overflow-hidden shrink-0
            ${isDark ? "bg-gradient-to-br from-amber-400 to-orange-500" : "bg-gradient-to-br from-slate-600 to-slate-800"}
          `}>
            {isDark ? <Sun className="w-3.5 h-3.5 text-white" /> : <Moon className="w-3.5 h-3.5 text-white" />}
            <div className="absolute inset-0 rounded-[8px] bg-gradient-to-b from-white/25 to-transparent" />
          </div>
          <span className="text-[13.5px] font-medium text-sidebar-foreground/70 group-hover/theme:text-sidebar-foreground tracking-tight transition-colors">
            {isDark ? "Light Mode" : "Dark Mode"}
          </span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
