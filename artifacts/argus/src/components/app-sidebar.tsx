import { Link, useLocation } from "wouter";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupContent, SidebarHeader, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarMenuBadge,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, MessageSquare, CheckSquare, Search, Mail,
  Share2, Zap, Moon, Sun, Bell, BarChart2,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useListTasks } from "@workspace/api-client-react";
import { useNotifications } from "@/hooks/use-notifications";
import { useMemo } from "react";

const NAV_ITEMS = [
  { title: "Dashboard", url: "/",          icon: LayoutDashboard, gradient: "from-blue-500 to-indigo-600" },
  { title: "Chat",      url: "/chat",      icon: MessageSquare,   gradient: "from-violet-500 to-purple-600" },
  { title: "Tracker",   url: "/tracker",   icon: BarChart2,       gradient: "from-teal-500 to-emerald-600" },
  { title: "Research",  url: "/research",  icon: Search,          gradient: "from-purple-500 to-indigo-600" },
  { title: "Email",     url: "/email",     icon: Mail,            gradient: "from-red-500 to-rose-600" },
  { title: "Posts",     url: "/posts",     icon: Share2,          gradient: "from-pink-500 to-rose-500" },
  { title: "Workflows", url: "/workflows", icon: Zap,             gradient: "from-cyan-500 to-sky-600" },
] as const;

export default function AppSidebar() {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tasks } = useListTasks({}, { query: { refetchInterval: 60_000 } as any });
  const { notifications } = useNotifications();

  const overdueCount = useMemo(() => {
    if (!tasks) return 0;
    const today = new Date().toISOString().split("T")[0];
    return tasks.filter(t => !t.completed && t.dueDate && t.dueDate < today).length;
  }, [tasks]);

  const isCurrent = (path: string) => {
    if (path === "/" && location === "/") return true;
    if (path !== "/" && location.startsWith(path)) return true;
    return false;
  };

  const isDark = theme === "dark";

  return (
    <Sidebar variant="inset">
      {/* ── Brand header ─────────────────────────────────── */}
      <SidebarHeader className="px-4 pt-5 pb-4">
        {/* Gradient separator */}
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

          {/* Notification bell */}
          {notifications.length > 0 && (
            <div className="relative">
              <div className="w-8 h-8 rounded-xl glass-card flex items-center justify-center border-destructive/20">
                <Bell className="w-3.5 h-3.5 text-destructive" />
              </div>
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center leading-none">
                {notifications.length > 9 ? "9+" : notifications.length}
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      {/* ── Navigation ───────────────────────────────────── */}
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
                        {/* Icon container */}
                        <div className={`
                          relative w-7 h-7 rounded-[8px] flex items-center justify-center shrink-0
                          transition-all duration-200 shadow-sm
                          bg-gradient-to-br ${item.gradient}
                          ${active ? "opacity-100 scale-100" : "opacity-70 group-hover/nav:opacity-100 group-hover/nav:scale-105"}
                        `}>
                          <item.icon className="w-3.5 h-3.5 text-white" />
                          {/* Shine overlay */}
                          <div className="absolute inset-0 rounded-[8px] bg-gradient-to-b from-white/25 to-transparent" />
                        </div>

                        <span className={`text-[13.5px] font-medium tracking-tight flex-1 ${active ? "font-semibold" : ""}`}>
                          {item.title}
                        </span>

                        {/* Active indicator */}
                        {active && (
                          <div className="w-1.5 h-1.5 rounded-full bg-primary/70 shrink-0" />
                        )}
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

      {/* ── Footer ───────────────────────────────────────── */}
      <SidebarFooter className="px-3 pb-5">
        <div className="h-px bg-sidebar-border/50 mb-3" />
        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl hover:bg-white/10 dark:hover:bg-white/6 transition-colors duration-150 group/theme"
        >
          <div className={`
            w-7 h-7 rounded-[8px] flex items-center justify-center shadow-sm relative overflow-hidden shrink-0
            ${isDark
              ? "bg-gradient-to-br from-amber-400 to-orange-500"
              : "bg-gradient-to-br from-slate-600 to-slate-800"}
          `}>
            {isDark
              ? <Sun className="w-3.5 h-3.5 text-white" />
              : <Moon className="w-3.5 h-3.5 text-white" />}
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
