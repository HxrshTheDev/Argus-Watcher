import { useState } from "react";
import { useGetDashboardStats, useGetActivityFeed } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatDistanceToNow, format } from "date-fns";
import { Link } from "wouter";
import {
  CheckSquare, MessageSquare, Search, Mail, Share2, Zap, Activity,
  Sparkles, Loader2, RefreshCw, Sun, ListChecks, X,
  AlertTriangle, Clock, TrendingUp,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Briefing {
  id: number; date: string; headline: string; content: string;
  priorities: string; createdAt: string;
}

function useTodayBriefing() {
  return useQuery<Briefing | null>({
    queryKey: ["briefing", "today"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/briefing/today`);
      if (!res.ok) throw new Error("Failed to fetch briefing");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useGenerateBriefing() {
  const qc = useQueryClient();
  return useMutation<Briefing>({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/briefing/generate`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to generate briefing");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["briefing", "today"] }),
  });
}

function useDismissBriefing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => { await fetch(`${BASE}/api/briefing/today`, { method: "DELETE" }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["briefing", "today"] }),
  });
}

function BriefingCard() {
  const { data: briefing, isLoading } = useTodayBriefing();
  const generate = useGenerateBriefing();
  const dismiss = useDismissBriefing();

  const priorities = briefing?.priorities.split("\n").map(p => p.trim()).filter(Boolean) ?? [];

  if (isLoading) {
    return <div className="h-24 rounded-2xl bg-muted animate-pulse" />;
  }

  if (!briefing) {
    return (
      <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-primary/10 text-primary p-2 rounded-xl shrink-0"><Sun className="w-5 h-5" /></div>
          <div className="min-w-0">
            <p className="font-semibold text-sm">No briefing yet today</p>
            <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">Generate your AI morning briefing — priorities, overdue tasks, and focus.</p>
          </div>
        </div>
        <button onClick={() => generate.mutate()} disabled={generate.isPending}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 hover:bg-primary/90 transition-all shrink-0"
        >
          {generate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">Generate</span>
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent overflow-hidden">
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="bg-primary/15 text-primary p-2 rounded-xl mt-0.5 shrink-0"><Sun className="w-4 h-4" /></div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary px-2 py-0.5 rounded-full">Today's Briefing</span>
                <span className="text-xs text-muted-foreground">{format(new Date(briefing.date), "MMMM d, yyyy")}</span>
              </div>
              <h3 className="text-base font-semibold leading-snug">{briefing.headline}</h3>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => generate.mutate()} disabled={generate.isPending}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all"
            >
              {generate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => dismiss.mutate()} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-white/10 transition-all">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed mt-3 ml-11">{briefing.content}</p>
      </div>
      {priorities.length > 0 && (
        <>
          <Separator className="bg-primary/10" />
          <div className="px-5 py-3">
            <div className="flex items-center gap-2 mb-2">
              <ListChecks className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">Today's Priorities</span>
            </div>
            <ol className="space-y-1.5">
              {priorities.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center font-bold mt-0.5">{i + 1}</span>
                  <span className="leading-relaxed">{p.replace(/^\d+\.\s*/, "")}</span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}

const MODULE_LINKS = [
  { url: "/chat",      label: "Chat",      icon: MessageSquare, color: "bg-violet-500" },
  { url: "/tasks",     label: "Tasks",     icon: CheckSquare,   color: "bg-green-500" },
  { url: "/research",  label: "Research",  icon: Search,        color: "bg-orange-500" },
  { url: "/email",     label: "Email",     icon: Mail,          color: "bg-red-500" },
  { url: "/posts",     label: "Posts",     icon: Share2,        color: "bg-pink-500" },
  { url: "/workflows", label: "Workflows", icon: Zap,           color: "bg-yellow-500" },
];

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: feed, isLoading: feedLoading } = useGetActivityFeed();

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <ScrollArea className="h-full">
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6 pb-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{greeting} 👋</h1>
          <p className="text-muted-foreground mt-1 text-sm">Here's what's happening today.</p>
        </div>

        {/* Briefing */}
        <BriefingCard />

        {/* Stats grid */}
        {statsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-2xl" />)}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className={`rounded-2xl border p-4 ${(stats.tasks?.overdue ?? 0) > 0 ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground font-medium">Active Tasks</p>
                <CheckSquare className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{stats.tasks?.pending || 0}</p>
              {(stats.tasks?.overdue ?? 0) > 0 && (
                <p className="text-xs text-destructive font-medium mt-0.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {stats.tasks.overdue} overdue
                </p>
              )}
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground font-medium">Conversations</p>
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{stats.totalConversations || 0}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground font-medium">Research</p>
                <Search className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{stats.totalResearchNotes || 0}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground font-medium">Workflows</p>
                <Zap className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{stats.activeWorkflows || 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5">of {stats.totalWorkflows || 0} total</p>
            </div>
          </div>
        ) : null}

        {/* Quick access — only on mobile (sidebar handles this on desktop) */}
        <div className="md:hidden">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick access</h2>
          <div className="grid grid-cols-3 gap-2">
            {MODULE_LINKS.map((m) => {
              const Icon = m.icon;
              return (
                <Link key={m.url} href={m.url}
                  className="flex flex-col items-center gap-2 p-3 rounded-2xl border border-border bg-card hover:bg-muted/50 transition-all"
                >
                  <div className={`w-10 h-10 rounded-xl ${m.color} flex items-center justify-center shadow-sm`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xs font-medium">{m.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Activity feed */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" /> Recent Activity
          </h2>
          <Card className="overflow-hidden">
            <div className="divide-y divide-border">
              {feedLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-4 p-4">
                    <div className="w-8 h-8 rounded-full bg-muted animate-pulse shrink-0" />
                    <div className="space-y-2 flex-1">
                      <div className="h-3.5 w-3/4 bg-muted animate-pulse rounded-full" />
                      <div className="h-3 w-1/4 bg-muted animate-pulse rounded-full" />
                    </div>
                  </div>
                ))
              ) : feed?.length ? (
                feed.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 p-4 hover:bg-muted/30 transition-colors">
                    <div className="mt-0.5 bg-primary/10 p-2 rounded-xl text-primary shrink-0">
                      {item.type === "task"     && <CheckSquare className="w-3.5 h-3.5" />}
                      {item.type === "chat"     && <MessageSquare className="w-3.5 h-3.5" />}
                      {item.type === "research" && <Search className="w-3.5 h-3.5" />}
                      {item.type === "email"    && <Mail className="w-3.5 h-3.5" />}
                      {item.type === "post"     && <Share2 className="w-3.5 h-3.5" />}
                      {item.type === "workflow" && <Zap className="w-3.5 h-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug">{item.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No recent activity yet</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </ScrollArea>
  );
}
