import { Link, useLocation } from "wouter";
import { 
  Sidebar, 
  SidebarContent, 
  SidebarFooter, 
  SidebarGroup, 
  SidebarGroupContent, 
  SidebarGroupLabel, 
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
  Settings,
  Bell,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useListTasks } from "@workspace/api-client-react";
import { useMemo } from "react";

export default function AppSidebar() {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const { data: tasks } = useListTasks({}, { refetchInterval: 60_000 });

  const overdueCount = useMemo(() => {
    if (!tasks) return 0;
    const today = new Date().toISOString().split("T")[0];
    return tasks.filter((t) => !t.completed && t.dueDate && t.dueDate < today).length;
  }, [tasks]);

  const isCurrent = (path: string) => {
    if (path === "/" && location === "/") return true;
    if (path !== "/" && location.startsWith(path)) return true;
    return false;
  };

  const navItems = [
    { title: "Dashboard", url: "/", icon: LayoutDashboard, badge: null },
    { title: "Chat", url: "/chat", icon: MessageSquare, badge: null },
    { title: "Tasks", url: "/tasks", icon: CheckSquare, badge: overdueCount > 0 ? overdueCount : null },
    { title: "Research", url: "/research", icon: Search, badge: null },
    { title: "Email", url: "/email", icon: Mail, badge: null },
    { title: "Posts", url: "/posts", icon: Share2, badge: null },
    { title: "Workflows", url: "/workflows", icon: Zap, badge: null },
  ];

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="px-4 py-6 border-b border-sidebar-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold">
              A
            </div>
            <span className="font-semibold text-lg tracking-tight">Argus</span>
          </div>
          {overdueCount > 0 && (
            <div className="flex items-center gap-1 text-destructive">
              <Bell className="w-4 h-4 animate-pulse" />
              <span className="text-xs font-bold">{overdueCount}</span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider font-semibold text-sidebar-foreground/50">Modules</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={isCurrent(item.url)}
                    className="font-medium"
                  >
                    <Link href={item.url}>
                      <item.icon className="w-4 h-4 mr-2" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.badge !== null && (
                    <SidebarMenuBadge className="bg-destructive text-destructive-foreground text-xs">
                      {item.badge}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              <Settings className="w-4 h-4 mr-2" />
              <span>Theme: {theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
