import { useState } from "react";
import { useGetDashboardStats, useGetActivityFeed } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow, format } from "date-fns";
import { Link, useLocation } from "wouter";
import {
  CheckSquare, MessageSquare, Search, Mail, Share2, Zap,
  Sparkles, Loader2, RefreshCw, Sun, X,
  TrendingUp, ChevronRight, Clock, Flag,
  ArrowUpRight, BookOpen, BarChart2,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Briefing { id: number; date: string; headline: string; content: string; priorities: string; createdAt: string; }

function useTodayBriefing() {
  return useQuery<Briefing | null>({
    queryKey: ["briefing", "today"],
    queryFn: async () => { const r = await fetch(`${BASE}/api/briefing/today`); if (!r.ok) return null; return r.json(); },
    staleTime: 5 * 60_000,
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

const ACTIVITY_CFG: Record<string, { icon: React.ElementType; gradient: string; route: string; label: string }> = {
  task:     { icon: CheckSquare,   gradient: "from-emerald-500 to-green-600",   route: "/tracker",   label: "Task" },
  chat:     { icon: MessageSquare, gradient: "from-violet-500 to-violet-600",   route: "/chat",      label: "Chat" },
  research: { icon: Search,        gradient: "from-orange-500 to-amber-600",    route: "/research",  label: "Research" },
  email:    { icon: Mail,          gradient: "from-red-500 to-rose-600",        route: "/email",     label: "Email" },
  post:     { icon: Share2,        gradient: "from-pink-500 to-rose-500",       route: "/posts",     label: "Post" },
  workflow: { icon: Zap,           gradient: "from-yellow-500 to-amber-500",    route: "/workflows", label: "Workflow" },
};

/* ── Quick access modules ─────────────────────── */
const MODULES = [
  { url: "/chat",      label: "Chat",      desc: "AI conversations",    icon: MessageSquare, gradient: "from-violet-500 to-violet-600",   glow: "shadow-violet-500/25" },
  { url: "/tracker",   label: "Tracker",   desc: "Tasks & goals",       icon: BarChart2,     gradient: "from-teal-500 to-emerald-600",    glow: "shadow-teal-500/25" },
  { url: "/research",  label: "Research",  desc: "Notebooks & sources", icon: BookOpen,      gradient: "from-orange-500 to-amber-600",    glow: "shadow-orange-500/25" },
  { url: "/email",     label: "Email",     desc: "Inbox & drafts",      icon: Mail,          gradient: "from-red-500 to-rose-600",        glow: "shadow-red-500/25" },
  { url: "/posts",     label: "Posts",     desc: "Social content",      icon: Share2,        gradient: "from-pink-500 to-rose-500",       glow: "shadow-pink-500/25" },
  { url: "/workflows", label: "Flows",     desc: "Automations",         icon: Zap,           gradient: "from-yellow-500 to-amber-500",    glow: "shadow-yellow-500/25" },
];

/* ── Activity item detail modal ─────────────────────── */
function ActivityModal({ item, onClose }: { item: any; onClose: () => void }) {
  const [, setLocation] = useLocation();
  const cfg = ACTIVITY_CFG[item.type] ?? ACTIVITY_CFG.task;
  const Icon = cfg.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 pt-5 pb-4">
          <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shadow-sm shrink-0`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{cfg.label}</p>
            <p className="text-[14px] font-black leading-tight tracking-tight mt-0.5">{item.description}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-muted text-muted-foreground transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 pb-2">
          <p className="text-[12px] text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
            <span>·</span>
            {format(new Date(item.createdAt), "MMM d, yyyy 'at' h:mm a")}
          </p>
        </div>
        <div className="px-5 pb-5 pt-3 flex gap-2">
          <button onClick={() => { setLocation(cfg.route); onClose(); }}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-black hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-[0.98]">
            <ArrowUpRight className="w-4 h-4" /> Go to {cfg.label}
          </button>
          <button onClick={onClose} className="px-4 py-3 rounded-2xl bg-muted hover:bg-muted/80 text-sm font-bold transition-all active:scale-[0.98]">Close</button>
        </div>
      </div>
    </div>
  );
}

/* ── Glass Stat Card ─────────────────────────── */
function StatCard({ label, value, sub, icon: Icon, gradient, glow, alert = false, href }: {
  label: string; value: number | string; sub?: string;
  icon: React.ElementType; gradient: string; glow?: string; alert?: boolean; href?: string;
}) {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    href ? <Link href={href} className="block">{children}</Link> : <div>{children}</div>;

  return (
    <Wrapper>
      <div className={`
        relative overflow-hidden rounded-2xl border p-4 transition-all duration-200
        hover:scale-[1.02] hover:-translate-y-0.5 cursor-pointer group
        backdrop-blur-sm
        ${alert
          ? "border-red-500/20 bg-red-500/5"
          : "border-white/10 dark:border-white/8 bg-white/60 dark:bg-white/[0.04]"}
      `} style={{ boxShadow: alert ? "0 4px 24px rgba(239,68,68,0.12)" : "0 4px 24px rgba(0,0,0,0.06)" }}>
        {/* Background glow blob */}
        <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br ${gradient} opacity-[0.12] blur-2xl group-hover:opacity-[0.18] transition-opacity`} />
        <div className="relative">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">{label}</span>
            <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg ${glow ?? ""} group-hover:scale-110 transition-transform`}>
              <Icon className="w-4 h-4 text-white" />
            </div>
          </div>
          <p className={`text-[32px] font-black tracking-tight leading-none ${alert ? "text-red-500" : "text-foreground"}`}>{value}</p>
          {sub && <p className={`text-[11px] mt-1.5 font-semibold ${alert ? "text-red-500/70" : "text-muted-foreground/60"}`}>{sub}</p>}
        </div>
      </div>
    </Wrapper>
  );
}

/* ── Briefing card ─────────────────────────── */
function BriefingCard() {
  const { data: briefing, isLoading } = useTodayBriefing();
  const generate = useGenerateBriefing();
  const dismiss = useDismissBriefing();
  const [expanded, setExpanded] = useState(false);
  const priorities = briefing?.priorities.split("\n").map(p => p.trim()).filter(Boolean) ?? [];

  if (isLoading) return <div className="h-28 rounded-2xl shimmer" />;

  if (!briefing) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-500/8 via-orange-500/5 to-transparent p-5 backdrop-blur-sm"
        style={{ boxShadow: "0 8px 32px rgba(251,146,60,0.10)" }}>
        <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 opacity-[0.08] blur-2xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30 shrink-0">
              <Sun className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-black text-[15px] tracking-tight">No briefing yet today</p>
              <p className="text-[12px] text-muted-foreground mt-0.5">Let Argus summarise your day</p>
            </div>
          </div>
          <button onClick={() => generate.mutate()} disabled={generate.isPending}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-xs font-black disabled:opacity-50 hover:opacity-90 transition-all shadow-lg shadow-orange-400/30 active:scale-95 shrink-0">
            {generate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Generate
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/15 backdrop-blur-sm"
      style={{ background: "linear-gradient(135deg, hsl(var(--card)) 60%, hsl(var(--primary)/0.04))", boxShadow: "0 8px 32px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <div className="absolute -top-12 -left-8 w-40 h-40 rounded-full bg-gradient-to-br from-primary/10 to-violet-500/5 blur-3xl" />

      <div className="relative px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/25 shrink-0">
              <Sun className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-widest bg-primary/10 text-primary px-2.5 py-0.5 rounded-full border border-primary/15">Today's Briefing</span>
                <span className="text-[11px] text-muted-foreground/60">{format(new Date(briefing.date), "MMMM d")}</span>
              </div>
              <h3 className="text-[15px] font-black leading-snug tracking-tight">{briefing.headline}</h3>
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
        <p className={`text-sm text-muted-foreground leading-relaxed ml-[58px] ${!expanded ? "line-clamp-2" : ""}`}>{briefing.content}</p>
        {briefing.content.length > 120 && (
          <button onClick={() => setExpanded(e => !e)} className="ml-[58px] mt-1 text-xs text-primary font-semibold hover:underline">
            {expanded ? "Show less" : "Read more"}
          </button>
        )}
      </div>

      {priorities.length > 0 && (
        <div className="border-t border-border/40 px-5 py-4 bg-muted/10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-4 h-4 rounded-md bg-primary/15 flex items-center justify-center">
              <Flag className="w-2.5 h-2.5 text-primary" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-primary/80">Today's Priorities</span>
          </div>
          <ol className="space-y-2">
            {priorities.map((p, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 text-primary text-[10px] flex items-center justify-center font-black mt-0.5 border border-primary/15">{i + 1}</span>
                <span className="leading-relaxed text-muted-foreground">{p.replace(/^\d+\.\s*/, "")}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/* ── Main Dashboard ─────────────────────────── */
export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: feed, isLoading: feedLoading } = useGetActivityFeed();
  const [selectedActivity, setSelectedActivity] = useState<any>(null);

  const now = new Date();
  const h = now.getHours();
  const greeting = h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const greetingEmoji = h < 5 ? "🌙" : h < 12 ? "☀️" : h < 17 ? "🌤️" : "🌇";

  return (
    <>
      <div className="relative h-full overflow-hidden">
        {/* Ambient gradient background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-gradient-to-br from-blue-500/10 to-violet-600/8 blur-3xl" />
          <div className="absolute top-1/3 -right-32 w-[400px] h-[400px] rounded-full bg-gradient-to-br from-orange-500/6 to-pink-500/5 blur-3xl" />
          <div className="absolute -bottom-16 left-1/4 w-[350px] h-[350px] rounded-full bg-gradient-to-br from-teal-500/6 to-emerald-500/4 blur-3xl" />
        </div>

        <ScrollArea className="h-full">
          <div className="relative px-4 sm:px-6 lg:px-8 pt-8 pb-12 max-w-3xl mx-auto space-y-7">

            {/* ── Hero greeting ── */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">{greetingEmoji}</span>
                  <span className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-widest">{format(now, "EEEE, MMMM d")}</span>
                </div>
                <h1 className="text-[30px] sm:text-[36px] font-black tracking-tight leading-tight">
                  {greeting}
                </h1>
                <p className="text-[13px] text-muted-foreground mt-1 font-medium">Here's your personal AI overview.</p>
              </div>
            </div>

            {/* ── Daily Briefing ── */}
            <BriefingCard />

            {/* ── Stats ── */}
            {statsLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => <div key={i} className="h-[100px] rounded-2xl shimmer" />)}
              </div>
            ) : stats ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Tasks" value={stats.tasks?.pending ?? 0} icon={CheckSquare}
                  gradient="from-emerald-500 to-green-600" glow="shadow-emerald-500/30" href="/tracker"
                  alert={(stats.tasks?.overdue ?? 0) > 0}
                  sub={(stats.tasks?.overdue ?? 0) > 0 ? `${stats.tasks.overdue} overdue` : `${stats.tasks?.completed ?? 0} done`}
                />
                <StatCard label="Chats" value={stats.totalConversations ?? 0} icon={MessageSquare}
                  gradient="from-violet-500 to-violet-600" glow="shadow-violet-500/30" href="/chat" />
                <StatCard label="Research" value={stats.totalResearchNotes ?? 0} icon={Search}
                  gradient="from-orange-500 to-amber-600" glow="shadow-orange-500/30" href="/research" />
                <StatCard label="Workflows" value={stats.activeWorkflows ?? 0} icon={Zap}
                  gradient="from-yellow-500 to-amber-500" glow="shadow-yellow-500/30" href="/workflows"
                  sub={`of ${stats.totalWorkflows ?? 0} total`}
                />
              </div>
            ) : null}

            {/* ── Quick Access ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Quick Access</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {MODULES.map((m) => {
                  const Icon = m.icon;
                  return (
                    <Link key={m.url} href={m.url}
                      className="group relative overflow-hidden flex items-center gap-3 p-3.5 rounded-2xl border border-white/10 dark:border-white/6 backdrop-blur-sm transition-all duration-200 hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98]"
                      style={{ background: "var(--card-glass, hsl(var(--card)))", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                      <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-gradient-to-br opacity-[0.10] blur-xl group-hover:opacity-[0.18] transition-opacity" style={{ backgroundImage: `linear-gradient(to bottom right, var(--g-from), var(--g-to))` }} />
                      <div className={`relative w-10 h-10 rounded-xl bg-gradient-to-br ${m.gradient} flex items-center justify-center shadow-lg ${m.glow} shrink-0 group-hover:scale-110 transition-transform duration-200`}>
                        <Icon className="w-5 h-5 text-white" />
                        <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-white/20 to-transparent" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold tracking-tight">{m.label}</p>
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5 truncate">{m.desc}</p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* ── Activity Feed ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Recent Activity</p>
                {feed && feed.length > 0 && (
                  <span className="text-[11px] text-muted-foreground/40 font-semibold">{feed.length} event{feed.length !== 1 ? "s" : ""}</span>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 dark:border-white/6 overflow-hidden backdrop-blur-sm"
                style={{ background: "hsl(var(--card))", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
                {feedLoading ? (
                  <div className="divide-y divide-border/40">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3.5 p-4">
                        <div className="w-9 h-9 rounded-xl shimmer shrink-0" />
                        <div className="space-y-2 flex-1">
                          <div className="h-3 w-3/4 shimmer rounded-full" />
                          <div className="h-2.5 w-1/3 shimmer rounded-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : feed?.length ? (
                  <div className="divide-y divide-border/30">
                    {feed.map((item, i) => {
                      const cfg = ACTIVITY_CFG[item.type] ?? ACTIVITY_CFG.task;
                      const Icon = cfg.icon;
                      return (
                        <button key={item.id}
                          className="w-full flex items-start gap-3.5 px-4 py-3.5 hover:bg-muted/20 transition-colors duration-150 text-left group"
                          style={{ animationDelay: `${i * 25}ms` }}
                          onClick={() => setSelectedActivity(item)}>
                          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shrink-0 shadow-sm mt-0.5 group-hover:scale-105 transition-transform`}>
                            <Icon className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold leading-snug">{item.description}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40">{cfg.label}</span>
                              <span className="text-[10px] text-muted-foreground/30">·</span>
                              <p className="text-[11px] text-muted-foreground/50 flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/20 group-hover:text-muted-foreground/50 group-hover:translate-x-0.5 shrink-0 mt-1.5 transition-all" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <div className="w-14 h-14 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
                      <TrendingUp className="w-6 h-6 opacity-20" />
                    </div>
                    <p className="font-black text-sm text-foreground/40 tracking-tight">No activity yet</p>
                    <p className="text-xs mt-1 opacity-40 text-center max-w-[160px]">Start using Argus to see your timeline here</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </ScrollArea>
      </div>

      {selectedActivity && (
        <ActivityModal item={selectedActivity} onClose={() => setSelectedActivity(null)} />
      )}
    </>
  );
}
