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
  SidebarMenuItem 
} from "@/components/ui/sidebar";
import { 
  LayoutDashboard, 
  MessageSquare, 
  CheckSquare, 
  Search, 
  Mail, 
  Share2, 
  Zap,
  Settings
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export default function AppSidebar() {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();

  const isCurrent = (path: string) => {
    if (path === "/" && location === "/") return true;
    if (path !== "/" && location.startsWith(path)) return true;
    return false;
  };

  const navItems = [
    { title: "Dashboard", url: "/", icon: LayoutDashboard },
    { title: "Chat", url: "/chat", icon: MessageSquare },
    { title: "Tasks", url: "/tasks", icon: CheckSquare },
    { title: "Research", url: "/research", icon: Search },
    { title: "Email", url: "/email", icon: Mail },
    { title: "Posts", url: "/posts", icon: Share2 },
    { title: "Workflows", url: "/workflows", icon: Zap },
  ];

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="px-4 py-6 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold">
            A
          </div>
          <span className="font-semibold text-lg tracking-tight">Argus</span>
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
