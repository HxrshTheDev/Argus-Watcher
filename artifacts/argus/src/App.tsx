import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { Link } from "wouter";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import Chat from "@/pages/chat";
import Tracker from "@/pages/tracker";
import Research from "@/pages/research";
import Email from "@/pages/email";
import Posts from "@/pages/posts";
import Workflows from "@/pages/workflows";
import AppSidebar from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { NotificationsMonitor } from "@/components/notifications-monitor";
import {
  LayoutDashboard, MessageSquare, Search, Mail, Share2, Zap, BarChart2,
} from "lucide-react";
import { useListTasks } from "@workspace/api-client-react";
import { useMemo } from "react";

const queryClient = new QueryClient();

const NAV = [
  { url: "/",          icon: LayoutDashboard, label: "Home",     gradient: "from-blue-500 to-blue-600",     activeText: "text-blue-400" },
  { url: "/chat",      icon: MessageSquare,   label: "Chat",     gradient: "from-violet-500 to-violet-600", activeText: "text-violet-400" },
  { url: "/tracker",   icon: BarChart2,       label: "Tracker",  gradient: "from-teal-500 to-emerald-600",  activeText: "text-teal-400" },
  { url: "/research",  icon: Search,          label: "Research", gradient: "from-orange-500 to-amber-600",  activeText: "text-orange-400" },
  { url: "/email",     icon: Mail,            label: "Email",    gradient: "from-red-500 to-rose-600",      activeText: "text-red-400" },
  { url: "/posts",     icon: Share2,          label: "Posts",    gradient: "from-pink-500 to-rose-500",     activeText: "text-pink-400" },
  { url: "/workflows", icon: Zap,             label: "Flows",    gradient: "from-yellow-500 to-amber-500",  activeText: "text-yellow-400" },
];

function MobileBottomNav() {
  const [location] = useLocation();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tasks } = useListTasks({}, { query: { refetchInterval: 60_000 } as any });

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

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50">
      {/* Blur backdrop */}
      <div className="absolute inset-0 glass bg-background/80 border-t border-border/60" />

      <div className="relative flex items-center justify-around px-1 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {NAV.map((item) => {
          const active = isCurrent(item.url);
          const Icon = item.icon;
          const showBadge = item.url === "/tracker" && overdueCount > 0;

          return (
            <Link key={item.url} href={item.url}
              className="flex flex-col items-center gap-1 px-1 min-w-0 flex-1 transition-all duration-200 active:scale-90"
            >
              <div className="relative">
                <div className={`
                  w-9 h-9 rounded-2xl flex items-center justify-center transition-all duration-200
                  ${active
                    ? `bg-gradient-to-br ${item.gradient} shadow-lg shadow-black/20`
                    : "bg-transparent"
                  }
                `}>
                  <Icon className={`w-[18px] h-[18px] transition-all duration-200 ${active ? "text-white" : "text-muted-foreground"}`} />
                </div>
                {showBadge && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center leading-none border-2 border-background">
                    {overdueCount > 9 ? "9+" : overdueCount}
                  </span>
                )}
              </div>
              <span className={`
                text-[10px] font-semibold leading-none tracking-tight truncate transition-all duration-200
                ${active ? item.activeText : "text-muted-foreground/60"}
              `}>
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
        {/* Desktop sidebar */}
        <div className="hidden md:contents">
          <AppSidebar />
        </div>

        {/* Main content */}
        <main className="flex-1 flex flex-col h-full relative overflow-hidden pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/chat" component={Chat} />
            <Route path="/chat/:id" component={Chat} />
            <Route path="/tasks" component={Tracker} />
            <Route path="/tracker" component={Tracker} />
            <Route path="/research" component={Research} />
            <Route path="/email" component={Email} />
            <Route path="/posts" component={Posts} />
            <Route path="/workflows" component={Workflows} />
            <Route component={NotFound} />
          </Switch>
        </main>

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
