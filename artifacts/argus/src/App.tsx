import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
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

const queryClient = new QueryClient();

function Router() {
  return (
    <SidebarProvider>
      <div className="flex h-[100dvh] w-full bg-background overflow-hidden text-foreground">
        <AppSidebar />
        <main className="flex-1 flex flex-col h-full relative overflow-hidden">
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
