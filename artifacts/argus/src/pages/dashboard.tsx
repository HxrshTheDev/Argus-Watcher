import { useState } from "react";
import { useGetDashboardStats, useGetActivityFeed } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatDistanceToNow, format } from "date-fns";
import {
  CheckSquare, MessageSquare, Search, Mail, Share2, Zap, Activity,
  Sparkles, Loader2, RefreshCw, Sun, AlertCircle, ListChecks, X,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Briefing {
  id: number;
  date: string;
  headline: string;
  content: string;
  priorities: string;
  createdAt: string;
}

function useTodayBriefing() {
  return useQuery<Briefing | null>({
    queryKey: ["briefing", "today"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/briefing/today`);
      if (!res.ok) throw new Error("Failed to fetch briefing");
      const data = await res.json();
      return data;
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
    mutationFn: async () => {
      await fetch(`${BASE}/api/briefing/today`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["briefing", "today"] }),
  });
}

function BriefingCard() {
  const { data: briefing, isLoading } = useTodayBriefing();
  const generate = useGenerateBriefing();
  const dismiss = useDismissBriefing();

  const priorities = briefing?.priorities
    .split("\n")
    .map(p => p.trim())
    .filter(Boolean) ?? [];

  if (isLoading) {
    return (
      <Card className="border-primary/20 bg-primary/5 animate-pulse">
        <CardContent className="py-4 flex items-center gap-3">
          <div className="w-5 h-5 rounded-full bg-primary/20" />
          <div className="h-4 w-48 bg-primary/20 rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!briefing) {
    return (
      <Card className="border-dashed border-primary/30 bg-primary/5">
        <CardContent className="py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary p-2 rounded-full">
              <Sun className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-sm">No briefing yet for today</p>
              <p className="text-xs text-muted-foreground">
                Generate your AI morning briefing — priorities, overdue tasks, and your day's focus.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="gap-2 shrink-0"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
          >
            {generate.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Sparkles className="w-4 h-4" />}
            Generate Briefing
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="bg-primary/15 text-primary p-2 rounded-full mt-0.5 shrink-0">
              <Sun className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wider font-bold px-2">
                  Today's Briefing
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(briefing.date), "MMMM d, yyyy")}
                </span>
              </div>
              <CardTitle className="text-base font-semibold leading-snug text-foreground">
                {briefing.headline}
              </CardTitle>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
              title="Regenerate"
            >
              {generate.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => dismiss.mutate()}
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0">
        <p className="text-sm text-muted-foreground leading-relaxed mb-3">
          {briefing.content}
        </p>
        {priorities.length > 0 && (
          <>
            <Separator className="my-3 bg-primary/10" />
            <div className="flex items-center gap-2 mb-2">
              <ListChecks className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">Today's Priorities</span>
            </div>
            <ol className="space-y-1.5">
              {priorities.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center font-bold mt-0.5">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{p.replace(/^\d+\.\s*/, "")}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: feed, isLoading: feedLoading } = useGetActivityFeed();

  return (
    <div className="p-8 h-full flex flex-col gap-5 overflow-y-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your activity and system status.</p>
      </div>

      <BriefingCard />

      {statsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className={stats.tasks?.overdue ? "border-destructive/30 bg-destructive/5" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Tasks</CardTitle>
              <CheckSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.tasks?.pending || 0}</div>
              <p className="text-xs text-muted-foreground">
                {stats.tasks?.completed || 0} completed
                {(stats.tasks?.overdue ?? 0) > 0 && (
                  <span className="text-destructive ml-2 font-medium">
                    · {stats.tasks.overdue} overdue
                  </span>
                )}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conversations</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalConversations || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Research Notes</CardTitle>
              <Search className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalResearchNotes || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Workflows</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeWorkflows || 0}</div>
              <p className="text-xs text-muted-foreground">
                out of {stats.totalWorkflows || 0} total
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="flex-1 flex flex-col min-h-0">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" /> Recent Activity
        </h2>
        <Card className="flex-1 overflow-hidden flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {feedLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
                    <div className="space-y-2 flex-1">
                      <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
                      <div className="h-3 w-1/4 bg-muted animate-pulse rounded" />
                    </div>
                  </div>
                ))
              ) : feed?.length ? (
                feed.map((item) => (
                  <div key={item.id} className="flex items-start gap-4 pb-4 border-b border-border last:border-0 last:pb-0">
                    <div className="mt-0.5 bg-primary/10 p-2 rounded-full text-primary">
                      {item.type === "task" && <CheckSquare className="w-4 h-4" />}
                      {item.type === "chat" && <MessageSquare className="w-4 h-4" />}
                      {item.type === "research" && <Search className="w-4 h-4" />}
                      {item.type === "email" && <Mail className="w-4 h-4" />}
                      {item.type === "post" && <Share2 className="w-4 h-4" />}
                      {item.type === "workflow" && <Zap className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">{item.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">No recent activity.</div>
              )}
            </div>
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}
