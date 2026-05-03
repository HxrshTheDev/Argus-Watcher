import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { Link } from "wouter";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import Chat from "@/pages/chat";
import Tasks from "@/pages/tasks";
import Research from "@/pages/research";
import Email from "@/pages/email";
import Posts from "@/pages/posts";
import Workflows from "@/pages/workflows";
import AppSidebar from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { NotificationsMonitor } from "@/components/notifications-monitor";
import {
  LayoutDashboard, MessageSquare, CheckSquare, Search, Mail, Share2, Zap,
} from "lucide-react";
import { useListTasks } from "@workspace/api-client-react";
import { useMemo } from "react";

const queryClient = new QueryClient();

const NAV = [
  { url: "/",          icon: LayoutDashboard, label: "Home",     color: "bg-blue-500" },
  { url: "/chat",      icon: MessageSquare,   label: "Chat",     color: "bg-violet-500" },
  { url: "/tasks",     icon: CheckSquare,     label: "Tasks",    color: "bg-green-500" },
  { url: "/research",  icon: Search,          label: "Research", color: "bg-orange-500" },
  { url: "/email",     icon: Mail,            label: "Email",    color: "bg-red-500" },
  { url: "/posts",     icon: Share2,          label: "Posts",    color: "bg-pink-500" },
  { url: "/workflows", icon: Zap,             label: "Workflows", color: "bg-yellow-500" },
];

function MobileBottomNav() {
  const [location] = useLocation();
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

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around px-1 py-1">
        {NAV.map((item) => {
          const active = isCurrent(item.url);
          const Icon = item.icon;
          const showBadge = item.url === "/tasks" && overdueCount > 0;
          return (
            <Link key={item.url} href={item.url}
              className={`relative flex flex-col items-center gap-0.5 px-2 py-2 rounded-xl transition-all min-w-0 flex-1 ${active ? "text-primary" : "text-muted-foreground"}`}
            >
              <div className={`relative w-8 h-8 rounded-xl flex items-center justify-center transition-all ${active ? item.color + " shadow-sm" : ""}`}>
                <Icon className={`w-4 h-4 ${active ? "text-white" : ""}`} />
                {showBadge && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-destructive text-white text-[8px] font-bold flex items-center justify-center leading-none">
                    {overdueCount > 9 ? "9+" : overdueCount}
                  </span>
                )}
              </div>
              <span className={`text-[9px] font-semibold leading-none truncate transition-all ${active ? "text-primary" : "text-muted-foreground/60"}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function Router() {
  return (
    <SidebarProvider>
      <NotificationsMonitor />
      <div className="flex h-[100dvh] w-full bg-background overflow-hidden text-foreground">
        {/* Desktop sidebar — hidden on mobile */}
        <div className="hidden md:contents">
          <AppSidebar />
        </div>

        {/* Main content — extra bottom padding on mobile for the tab bar */}
        <main className="flex-1 flex flex-col h-full relative overflow-hidden pb-[calc(3.75rem+env(safe-area-inset-bottom))] md:pb-0">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/chat" component={Chat} />
            <Route path="/chat/:id" component={Chat} />
            <Route path="/tasks" component={Tasks} />
            <Route path="/research" component={Research} />
            <Route path="/email" component={Email} />
            <Route path="/posts" component={Posts} />
            <Route path="/workflows" component={Workflows} />
            <Route component={NotFound} />
          </Switch>
        </main>

        {/* Mobile bottom nav */}
        <MobileBottomNav />
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="argus-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
