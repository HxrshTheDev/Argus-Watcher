import { useState } from "react";
import { useGetDashboardStats, useGetActivityFeed } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow, format } from "date-fns";
import { Link } from "wouter";
import {
  CheckSquare, MessageSquare, Search, Mail, Share2, Zap,
  Sparkles, Loader2, RefreshCw, Sun, ListChecks, X,
  AlertTriangle, Clock, TrendingUp, ChevronRight,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Briefing { id: number; date: string; headline: string; content: string; priorities: string; createdAt: string; }

function useTodayBriefing() {
  return useQuery<Briefing | null>({
    queryKey: ["briefing", "today"],
    queryFn: async () => { const r = await fetch(`${BASE}/api/briefing/today`); if (!r.ok) return null; return r.json(); },
    staleTime: 5 * 60 * 1000,
  });
}
function useGenerateBriefing() {
  const qc = useQueryClient();
  return useMutation<Briefing>({
    mutationFn: async () => { const r = await fetch(`${BASE}/api/briefing/generate`, { method: "POST" }); if (!r.ok) throw new Error(); return r.json(); },
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

/* ── Stat card ─────────────────────────────────────────── */
function StatCard({ label, value, sub, icon: Icon, gradient, alert = false }: {
  label: string; value: number | string; sub?: string;
  icon: React.ElementType; gradient: string; alert?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 transition-all duration-200 hover:scale-[1.02] cursor-default ${alert ? "border-destructive/25 bg-destructive/5" : "border-border bg-card"}`}>
      {/* Subtle gradient blob */}
      <div className={`absolute -top-6 -right-6 w-20 h-20 rounded-full bg-gradient-to-br ${gradient} opacity-[0.07] blur-xl`} />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">{label}</span>
          <div className={`w-7 h-7 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm`}>
            <Icon className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
        <p className={`text-3xl font-black tracking-tight leading-none ${alert ? "text-destructive" : "text-foreground"}`}>{value}</p>
        {sub && <p className={`text-xs mt-1.5 font-medium ${alert ? "text-destructive/70" : "text-muted-foreground"}`}>{sub}</p>}
      </div>
    </div>
  );
}

/* ── Briefing card ─────────────────────────────────────── */
function BriefingCard() {
  const { data: briefing, isLoading } = useTodayBriefing();
  const generate = useGenerateBriefing();
  const dismiss = useDismissBriefing();
  const priorities = briefing?.priorities.split("\n").map(p => p.trim()).filter(Boolean) ?? [];

  if (isLoading) {
    return <div className="h-28 rounded-2xl shimmer" />;
  }

  if (!briefing) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/8 via-primary/4 to-transparent p-5">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-violet-500/5" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/25 shrink-0">
              <Sun className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-sm">No briefing yet today</p>
              <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">Let Argus summarise your day — tasks, priorities, and focus areas.</p>
            </div>
          </div>
          <button onClick={() => generate.mutate()} disabled={generate.isPending}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50 hover:bg-primary/90 transition-all shadow-lg shadow-primary/25 active:scale-95 shrink-0"
          >
            {generate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Generate</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-card">
      {/* Gradient header band */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-blue-500/0 via-primary/60 to-violet-500/0" />
      <div className="absolute -top-12 -left-8 w-40 h-40 rounded-full bg-gradient-to-br from-primary/10 to-violet-500/5 blur-2xl" />

      <div className="relative px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20 shrink-0">
              <Sun className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-widest bg-primary/12 text-primary px-2.5 py-0.5 rounded-full">Today's Briefing</span>
                <span className="text-[11px] text-muted-foreground">{format(new Date(briefing.date), "MMMM d, yyyy")}</span>
              </div>
              <h3 className="text-base font-bold leading-snug tracking-tight">{briefing.headline}</h3>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => generate.mutate()} disabled={generate.isPending}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
              {generate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => dismiss.mutate()} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted transition-all">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed ml-[52px]">{briefing.content}</p>
      </div>

      {priorities.length > 0 && (
        <div className="border-t border-border/60 px-5 py-3.5 bg-muted/20">
          <div className="flex items-center gap-2 mb-2.5">
            <ListChecks className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Today's Priorities</span>
          </div>
          <ol className="space-y-1.5">
            {priorities.map((p, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="shrink-0 w-5 h-5 rounded-full bg-primary/12 text-primary text-[10px] flex items-center justify-center font-black mt-0.5">{i + 1}</span>
                <span className="leading-relaxed text-muted-foreground">{p.replace(/^\d+\.\s*/, "")}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/* ── Quick access (mobile only) ────────────────────────── */
const MODULES = [
  { url: "/chat",      label: "Chat",      icon: MessageSquare, gradient: "from-violet-500 to-violet-600" },
  { url: "/tasks",     label: "Tasks",     icon: CheckSquare,   gradient: "from-emerald-500 to-green-600" },
  { url: "/research",  label: "Research",  icon: Search,        gradient: "from-orange-500 to-amber-600" },
  { url: "/email",     label: "Email",     icon: Mail,          gradient: "from-red-500 to-rose-600" },
  { url: "/posts",     label: "Posts",     icon: Share2,        gradient: "from-pink-500 to-rose-500" },
  { url: "/workflows", label: "Workflows", icon: Zap,           gradient: "from-yellow-500 to-amber-500" },
];

/* ── Activity icon map ─────────────────────────────────── */
const ACTIVITY_CONFIG: Record<string, { icon: React.ElementType; gradient: string }> = {
  task:     { icon: CheckSquare,  gradient: "from-emerald-500 to-green-600" },
  chat:     { icon: MessageSquare, gradient: "from-violet-500 to-violet-600" },
  research: { icon: Search,       gradient: "from-orange-500 to-amber-600" },
  email:    { icon: Mail,         gradient: "from-red-500 to-rose-600" },
  post:     { icon: Share2,       gradient: "from-pink-500 to-rose-500" },
  workflow: { icon: Zap,          gradient: "from-yellow-500 to-amber-500" },
};

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: feed, isLoading: feedLoading } = useGetActivityFeed();

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 5)  return "Good night";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const greetingEmoji = (() => {
    const h = new Date().getHours();
    if (h < 5) return "🌙"; if (h < 12) return "☀️"; if (h < 17) return "🌤️"; return "🌇";
  })();

  return (
    <ScrollArea className="h-full">
      <div className="px-4 sm:px-6 lg:px-8 pt-7 pb-8 max-w-3xl mx-auto space-y-6">

        {/* ── Hero greeting ── */}
        <div className="space-y-1">
          <h1 className="text-[28px] sm:text-[32px] font-black tracking-tight leading-tight">
            {greeting} {greetingEmoji}
          </h1>
          <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, MMMM d")} · Here's your overview</p>
        </div>

        {/* ── Daily briefing ── */}
        <BriefingCard />

        {/* ── Stats grid ── */}
        {statsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-2xl shimmer" />)}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Tasks" value={stats.tasks?.pending ?? 0} icon={CheckSquare}
              gradient="from-emerald-500 to-green-600"
              alert={(stats.tasks?.overdue ?? 0) > 0}
              sub={(stats.tasks?.overdue ?? 0) > 0 ? `${stats.tasks.overdue} overdue` : `${stats.tasks?.completed ?? 0} done`}
            />
            <StatCard label="Chats" value={stats.totalConversations ?? 0} icon={MessageSquare} gradient="from-violet-500 to-violet-600" />
            <StatCard label="Research" value={stats.totalResearchNotes ?? 0} icon={Search} gradient="from-orange-500 to-amber-600" />
            <StatCard label="Workflows" value={stats.activeWorkflows ?? 0} icon={Zap} gradient="from-yellow-500 to-amber-500" sub={`of ${stats.totalWorkflows ?? 0} total`} />
          </div>
        ) : null}

        {/* ── Quick access (mobile only) ── */}
        <div className="md:hidden">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Quick Access</p>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {MODULES.map((m) => {
              const Icon = m.icon;
              return (
                <Link key={m.url} href={m.url}
                  className="group flex flex-col items-center gap-2.5 p-3.5 rounded-2xl border border-border bg-card hover:border-primary/25 hover:bg-muted/30 transition-all duration-200 active:scale-95"
                >
                  <div className={`relative w-11 h-11 rounded-2xl bg-gradient-to-br ${m.gradient} flex items-center justify-center shadow-lg shadow-black/20`}>
                    <Icon className="w-5 h-5 text-white" />
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/20 to-transparent" />
                  </div>
                  <span className="text-xs font-semibold tracking-tight">{m.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* ── Activity feed ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Recent Activity</p>
            {feed && feed.length > 0 && (
              <span className="text-[11px] text-muted-foreground">{feed.length} event{feed.length !== 1 ? "s" : ""}</span>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {feedLoading ? (
              <div className="divide-y divide-border">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-4">
                    <div className="w-9 h-9 rounded-xl shimmer shrink-0" />
                    <div className="space-y-2 flex-1">
                      <div className="h-3 w-3/4 shimmer rounded-full" />
                      <div className="h-2.5 w-1/4 shimmer rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : feed?.length ? (
              <div className="divide-y divide-border/60">
                {feed.map((item, i) => {
                  const cfg = ACTIVITY_CONFIG[item.type] ?? ACTIVITY_CONFIG.task;
                  const Icon = cfg.icon;
                  return (
                    <div key={item.id}
                      className="flex items-start gap-3.5 px-4 py-3.5 hover:bg-muted/25 transition-colors duration-150"
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shrink-0 shadow-sm mt-0.5`}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug">{item.description}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0 mt-1.5" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
                <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                  <TrendingUp className="w-6 h-6 opacity-30" />
                </div>
                <p className="font-semibold text-sm text-foreground/60">No activity yet</p>
                <p className="text-xs mt-1 opacity-50">Start using Argus to see your timeline here</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
