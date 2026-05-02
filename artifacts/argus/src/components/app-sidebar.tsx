import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  MessageSquare,
  CheckSquare,
  Search,
  Mail,
  Share2,
  Zap,
  Bell,
  Moon,
  Sun,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useListTasks } from "@workspace/api-client-react";
import { useMemo } from "react";

const NAV_ITEMS = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, color: "bg-blue-500", badge: null as number | null },
  { title: "Chat",      url: "/chat",      icon: MessageSquare, color: "bg-violet-500", badge: null as number | null },
  { title: "Tasks",     url: "/tasks",     icon: CheckSquare,   color: "bg-green-500",  badge: null as number | null },
  { title: "Research",  url: "/research",  icon: Search,        color: "bg-orange-500", badge: null as number | null },
  { title: "Email",     url: "/email",     icon: Mail,          color: "bg-red-500",    badge: null as number | null },
  { title: "Posts",     url: "/posts",     icon: Share2,        color: "bg-pink-500",   badge: null as number | null },
  { title: "Workflows", url: "/workflows", icon: Zap,           color: "bg-yellow-500", badge: null as number | null },
];

export default function AppSidebar() {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const { data: tasks } = useListTasks({}, { refetchInterval: 60_000 });

  const overdueCount = useMemo(() => {
    if (!tasks) return 0;
    const today = new Date().toISOString().split("T")[0];
    return tasks.filter((t) => !t.completed && t.dueDate && t.dueDate < today).length;
  }, [tasks]);

  const navItems = NAV_ITEMS.map(item =>
    item.url === "/tasks" ? { ...item, badge: overdueCount > 0 ? overdueCount : null } : item
  );

  const isCurrent = (path: string) => {
    if (path === "/" && location === "/") return true;
    if (path !== "/" && location.startsWith(path)) return true;
    return false;
  };

  const isDark = theme === "dark";

  return (
    <Sidebar variant="inset">
      {/* App header */}
      <SidebarHeader className="px-4 pt-6 pb-5 border-b border-sidebar-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
              <span className="text-white font-black text-base tracking-tight">A</span>
            </div>
            <div>
              <span className="font-bold text-base tracking-tight block leading-none">Argus</span>
              <span className="text-[11px] text-muted-foreground">Personal AI</span>
            </div>
          </div>
          {overdueCount > 0 && (
            <div className="flex items-center gap-1.5 bg-destructive/10 text-destructive rounded-full px-2 py-1">
              <Bell className="w-3 h-3" />
              <span className="text-[11px] font-bold">{overdueCount}</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="pt-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5 px-2">
              {navItems.map((item) => {
                const active = isCurrent(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className={`h-11 rounded-xl font-medium transition-all duration-150 ${
                        active
                          ? "bg-primary/10 text-primary hover:bg-primary/15"
                          : "text-sidebar-foreground hover:bg-sidebar-accent"
                      }`}
                    >
                      <Link href={item.url}>
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          active ? "bg-primary shadow-sm shadow-primary/30" : item.color + " shadow-sm opacity-85"
                        }`}>
                          <item.icon className="w-3.5 h-3.5 text-white" />
                        </div>
                        <span className="ml-2 text-sm">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.badge !== null && (
                      <SidebarMenuBadge className="bg-destructive text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
                        {item.badge}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sidebar-accent transition-colors text-sm text-sidebar-foreground"
        >
          <div className="w-7 h-7 rounded-lg bg-slate-500 flex items-center justify-center shadow-sm">
            {isDark ? <Sun className="w-3.5 h-3.5 text-white" /> : <Moon className="w-3.5 h-3.5 text-white" />}
          </div>
          <span className="font-medium">{isDark ? "Light Mode" : "Dark Mode"}</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
