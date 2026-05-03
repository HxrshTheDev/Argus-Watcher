import { useState, useEffect, useMemo } from "react";
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

const MODULES = [
  { url: "/chat",      label: "Chat",      desc: "AI conversations",    icon: MessageSquare, gradient: "from-violet-500 to-purple-600",   glow: "shadow-violet-500/30" },
  { url: "/tracker",   label: "Tracker",   desc: "Tasks & goals",       icon: BarChart2,     gradient: "from-teal-500 to-emerald-600",    glow: "shadow-teal-500/30" },
  { url: "/research",  label: "Research",  desc: "Notebooks & sources", icon: BookOpen,      gradient: "from-orange-500 to-amber-600",    glow: "shadow-orange-500/30" },
  { url: "/email",     label: "Email",     desc: "Inbox & drafts",      icon: Mail,          gradient: "from-red-500 to-rose-600",        glow: "shadow-red-500/30" },
  { url: "/posts",     label: "Posts",     desc: "Social content",      icon: Share2,        gradient: "from-pink-500 to-rose-500",       glow: "shadow-pink-500/30" },
  { url: "/workflows", label: "Flows",     desc: "Automations",         icon: Zap,           gradient: "from-yellow-500 to-amber-500",    glow: "shadow-yellow-500/30" },
];

/* ── Live clock widget (isolated so only IT re-renders every second) ── */
function LiveClockWidget() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = format(now, "HH:mm");
  const secsStr = format(now, "ss");
  const dayStr  = format(now, "EEE");

  return (
    <div
      className="shrink-0 rounded-2xl px-4 py-3 text-right hidden sm:block relative overflow-hidden"
      style={{
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        background: "rgba(255,255,255,0.45)",
        border: "1px solid rgba(255,255,255,0.65)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.5)",
      }}
    >
      <div className="hidden dark:block absolute inset-0 rounded-2xl pointer-events-none"
        style={{ background: "rgba(30,10,16,0.52)", border: "1px solid rgba(255,255,255,0.06)" }}
      />
      <div className="relative">
        <div className="tabular-nums text-[28px] font-black tracking-tight leading-none text-foreground">
          {timeStr}
          <span className="text-foreground/25 text-[16px] ml-0.5">:{secsStr}</span>
        </div>
        <p className="text-[10px] font-semibold text-foreground/40 dark:text-muted-foreground/60 mt-1 uppercase tracking-widest">{dayStr}</p>
      </div>
    </div>
  );
}

/* ── Greeting (computed once per render, not every second) ── */
function useGreeting() {
  return useMemo(() => {
    const h = new Date().getHours();
    return {
      text:  h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening",
      emoji: h < 5 ? "🌙" : h < 12 ? "☀️" : h < 17 ? "🌤️" : "🌇",
      date:  format(new Date(), "EEEE, MMMM d"),
    };
  }, []);
}

/* ── Activity modal ─────────────────────────────── */
function ActivityModal({ item, onClose }: { item: any; onClose: () => void }) {
  const [, setLocation] = useLocation();
  const cfg = ACTIVITY_CFG[item.type] ?? ACTIVITY_CFG.task;
  const Icon = cfg.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-3xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
        style={{
          background: "rgba(255,255,255,0.72)",
          backdropFilter: "blur(32px) saturate(200%)",
          border: "1px solid rgba(255,255,255,0.7)",
          boxShadow: "0 32px 64px rgba(0,0,0,0.22)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="dark:hidden">
          <div className="flex items-center gap-3 px-5 pt-5 pb-4">
            <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shadow-sm shrink-0`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-foreground/40">{cfg.label}</p>
              <p className="text-[14px] font-black leading-tight tracking-tight text-foreground">{item.description}</p>
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-black/8 text-foreground/50 transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-5 pb-2">
            <p className="text-[12px] text-foreground/40 flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
              <span>·</span>
              {format(new Date(item.createdAt), "MMM d, yyyy 'at' h:mm a")}
            </p>
          </div>
          <div className="px-5 pb-5 pt-3 flex gap-2">
            <button onClick={() => { setLocation(cfg.route); onClose(); }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-black hover:bg-primary/90 transition-all shadow-lg shadow-primary/25 active:scale-[0.98]">
              <ArrowUpRight className="w-4 h-4" /> Go to {cfg.label}
            </button>
            <button onClick={onClose} className="px-4 py-3 rounded-2xl bg-black/8 hover:bg-black/12 text-sm font-bold transition-all active:scale-[0.98] text-foreground">Close</button>
          </div>
        </div>
        <div className="hidden dark:block">
          <div className="flex items-center gap-3 px-5 pt-5 pb-4">
            <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shadow-sm shrink-0`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{cfg.label}</p>
              <p className="text-[14px] font-black leading-tight tracking-tight">{item.description}</p>
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
      <div
        className={`
          relative overflow-hidden rounded-2xl p-4 transition-all duration-200
          hover:scale-[1.02] hover:-translate-y-0.5 cursor-pointer group
        `}
        style={{
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          background: alert
            ? "rgba(239,68,68,0.08)"
            : "rgba(255,255,255,0.50)",
          border: alert
            ? "1px solid rgba(239,68,68,0.25)"
            : "1px solid rgba(255,255,255,0.70)",
          boxShadow: alert
            ? "0 4px 24px rgba(239,68,68,0.12), inset 0 1px 0 rgba(255,255,255,0.5)"
            : "0 4px 24px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.6)",
        }}
      >
        {/* dark mode override via class */}
        <div className="hidden dark:block absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background: alert ? "rgba(239,68,68,0.07)" : "rgba(30,10,16,0.55)",
            border: alert ? "1px solid rgba(239,68,68,0.25)" : "1px solid rgba(255,255,255,0.07)",
            boxShadow: alert ? "0 4px 24px rgba(239,68,68,0.14)" : "0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        />

        {/* Background glow blob */}
        <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br ${gradient} opacity-[0.18] dark:opacity-[0.14] blur-2xl group-hover:opacity-[0.28] dark:group-hover:opacity-[0.22] transition-opacity`} />

        <div className="relative">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-foreground/40 dark:text-muted-foreground/70">{label}</span>
            <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg ${glow ?? ""} group-hover:scale-110 transition-transform relative overflow-hidden`}>
              <Icon className="w-4 h-4 text-white relative z-10" />
              <div className="absolute inset-0 bg-gradient-to-b from-white/25 to-transparent" />
            </div>
          </div>
          <p className={`text-[32px] font-black tracking-tight leading-none ${alert ? "text-red-500" : "text-foreground"}`}>{value}</p>
          {sub && <p className={`text-[11px] mt-1.5 font-semibold ${alert ? "text-red-500/70" : "text-foreground/40 dark:text-muted-foreground/60"}`}>{sub}</p>}
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
      <div
        className="relative overflow-hidden rounded-2xl p-5"
        style={{
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          background: "rgba(255,255,255,0.50)",
          border: "1px solid rgba(255,255,255,0.70)",
          boxShadow: "0 8px 32px rgba(251,146,60,0.10), inset 0 1px 0 rgba(255,255,255,0.6)",
        }}
      >
        <div className="dark:hidden absolute inset-0 rounded-2xl pointer-events-none" />
        <div
          className="hidden dark:block absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background: "rgba(30,10,16,0.55)",
            border: "1px solid rgba(255,255,255,0.07)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        />
        <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 opacity-[0.10] dark:opacity-[0.08] blur-2xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30 shrink-0 relative overflow-hidden">
              <Sun className="w-6 h-6 text-white relative z-10" />
              <div className="absolute inset-0 bg-gradient-to-b from-white/25 to-transparent" />
            </div>
            <div>
              <p className="font-black text-[15px] tracking-tight text-foreground">No briefing yet today</p>
              <p className="text-[12px] text-foreground/50 dark:text-muted-foreground mt-0.5 font-medium">Let Argus summarise your day</p>
            </div>
          </div>
          <button onClick={() => generate.mutate()} disabled={generate.isPending}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-xs font-black disabled:opacity-50 hover:opacity-90 transition-all shadow-lg shadow-orange-400/30 active:scale-95 shrink-0 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent rounded-xl" />
            {generate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin relative z-10" /> : <Sparkles className="w-3.5 h-3.5 relative z-10" />}
            <span className="relative z-10">Generate</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        background: "rgba(255,255,255,0.52)",
        border: "1px solid rgba(255,255,255,0.72)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.6)",
      }}
    >
      <div
        className="hidden dark:block absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          background: "rgba(30,10,16,0.55)",
          border: "1px solid rgba(255,255,255,0.07)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <div className="absolute -top-10 -left-6 w-36 h-36 rounded-full bg-gradient-to-br from-primary/15 to-violet-500/8 blur-3xl" />

      <div className="relative px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/25 shrink-0 relative overflow-hidden">
              <Sun className="w-5 h-5 text-white relative z-10" />
              <div className="absolute inset-0 bg-gradient-to-b from-white/25 to-transparent" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-widest bg-primary/10 text-primary px-2.5 py-0.5 rounded-full border border-primary/20">Today's Briefing</span>
                <span className="text-[11px] text-foreground/40 dark:text-muted-foreground/60">{format(new Date(briefing.date), "MMMM d")}</span>
              </div>
              <h3 className="text-[15px] font-black leading-snug tracking-tight">{briefing.headline}</h3>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => generate.mutate()} disabled={generate.isPending}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-foreground/40 hover:text-foreground hover:bg-black/8 dark:hover:bg-white/8 transition-all">
              {generate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => dismiss.mutate()} className="w-7 h-7 rounded-lg flex items-center justify-center text-foreground/40 hover:text-destructive hover:bg-black/8 dark:hover:bg-white/8 transition-all">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <p className={`text-sm text-foreground/60 dark:text-muted-foreground leading-relaxed ml-[58px] ${!expanded ? "line-clamp-2" : ""}`}>{briefing.content}</p>
        {briefing.content.length > 120 && (
          <button onClick={() => setExpanded(e => !e)} className="ml-[58px] mt-1 text-xs text-primary font-semibold hover:underline">
            {expanded ? "Show less" : "Read more"}
          </button>
        )}
      </div>

      {priorities.length > 0 && (
        <div className="border-t border-black/8 dark:border-white/8 px-5 py-4 bg-black/[0.03] dark:bg-white/[0.03]">
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
                <span className="leading-relaxed text-foreground/60 dark:text-muted-foreground">{p.replace(/^\d+\.\s*/, "")}</span>
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
  const { text: greeting, emoji: greetingEmoji, date: greetingDate } = useGreeting();

  return (
    <>
      <div className="relative h-full overflow-hidden">
        <ScrollArea className="h-full">
          <div className="relative px-4 sm:px-6 lg:px-8 pt-8 pb-12 max-w-3xl mx-auto space-y-6">

            {/* ── Hero ── */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{greetingEmoji}</span>
                  <span className="text-[11px] font-semibold text-foreground/40 dark:text-muted-foreground/60 uppercase tracking-widest">{greetingDate}</span>
                </div>
                <h1 className="text-[30px] sm:text-[36px] font-black tracking-tight leading-tight text-foreground">
                  {greeting}
                </h1>
                <p className="text-[13px] text-foreground/50 dark:text-muted-foreground mt-1 font-medium">Your personal AI overview.</p>
              </div>

              {/* Live clock — isolated component, only IT ticks */}
              <LiveClockWidget />
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
                  gradient="from-violet-500 to-purple-600" glow="shadow-violet-500/30" href="/chat" />
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
                <p className="text-[10px] font-black uppercase tracking-widest text-foreground/35 dark:text-muted-foreground/60">Quick Access</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {MODULES.map((m) => {
                  const Icon = m.icon;
                  return (
                    <Link key={m.url} href={m.url}
                      className="group relative overflow-hidden flex items-center gap-3 p-3.5 rounded-2xl transition-all duration-200 hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98]"
                      style={{
                        backdropFilter: "blur(20px) saturate(180%)",
                        WebkitBackdropFilter: "blur(20px) saturate(180%)",
                        background: "rgba(255,255,255,0.45)",
                        border: "1px solid rgba(255,255,255,0.65)",
                        boxShadow: "0 2px 14px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.5)",
                      }}
                    >
                      {/* Dark mode overlay */}
                      <div className="hidden dark:block absolute inset-0 rounded-2xl pointer-events-none"
                        style={{
                          background: "rgba(30,10,16,0.50)",
                          border: "1px solid rgba(255,255,255,0.07)",
                          boxShadow: "0 2px 14px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.05)",
                        }}
                      />
                      {/* Glow blob */}
                      <div className={`absolute -top-3 -right-3 w-14 h-14 rounded-full bg-gradient-to-br ${m.gradient} opacity-[0.12] dark:opacity-[0.10] blur-xl group-hover:opacity-[0.22] dark:group-hover:opacity-[0.18] transition-opacity`} />

                      <div className={`relative w-10 h-10 rounded-xl bg-gradient-to-br ${m.gradient} flex items-center justify-center shadow-lg ${m.glow} shrink-0 group-hover:scale-110 transition-transform duration-200 overflow-hidden`}>
                        <Icon className="w-5 h-5 text-white relative z-10" />
                        <div className="absolute inset-0 bg-gradient-to-b from-white/25 to-transparent" />
                      </div>
                      <div className="relative min-w-0 flex-1">
                        <p className="text-[13px] font-bold tracking-tight text-foreground">{m.label}</p>
                        <p className="text-[11px] text-foreground/45 dark:text-muted-foreground/60 mt-0.5 truncate font-medium">{m.desc}</p>
                      </div>
                      <ChevronRight className="relative w-3.5 h-3.5 text-foreground/25 dark:text-muted-foreground/30 group-hover:text-foreground/50 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* ── Activity Feed ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-foreground/35 dark:text-muted-foreground/60">Recent Activity</p>
                {feed && feed.length > 0 && (
                  <span className="text-[11px] text-foreground/35 dark:text-muted-foreground/40 font-semibold">{feed.length} event{feed.length !== 1 ? "s" : ""}</span>
                )}
              </div>

              <div
                className="rounded-2xl overflow-hidden"
                style={{
                  backdropFilter: "blur(24px) saturate(180%)",
                  WebkitBackdropFilter: "blur(24px) saturate(180%)",
                  background: "rgba(255,255,255,0.50)",
                  border: "1px solid rgba(255,255,255,0.68)",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.55)",
                }}
              >
                <div className="hidden dark:block absolute inset-0 rounded-2xl pointer-events-none"
                  style={{
                    background: "rgba(30,10,16,0.52)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)",
                  }}
                />
                <div className="relative">
                  {feedLoading ? (
                    <div className="divide-y divide-black/8 dark:divide-white/8">
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
                    <div className="divide-y divide-black/8 dark:divide-white/8">
                      {feed.map((item, i) => {
                        const cfg = ACTIVITY_CFG[item.type] ?? ACTIVITY_CFG.task;
                        const Icon = cfg.icon;
                        return (
                          <button key={item.id}
                            className="w-full flex items-start gap-3.5 px-4 py-3.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors duration-150 text-left group"
                            style={{ animationDelay: `${i * 25}ms` }}
                            onClick={() => setSelectedActivity(item)}>
                            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shrink-0 shadow-sm mt-0.5 group-hover:scale-105 transition-transform relative overflow-hidden`}>
                              <Icon className="w-4 h-4 text-white relative z-10" />
                              <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-semibold leading-snug text-foreground">{item.description}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/35 dark:text-muted-foreground/40">{cfg.label}</span>
                                <span className="text-[10px] text-foreground/25 dark:text-muted-foreground/30">·</span>
                                <p className="text-[11px] text-foreground/40 dark:text-muted-foreground/50 flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5" />
                                  {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                                </p>
                              </div>
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-foreground/20 dark:text-muted-foreground/20 group-hover:text-foreground/45 group-hover:translate-x-0.5 shrink-0 mt-1.5 transition-all" />
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <div className="w-14 h-14 rounded-2xl bg-black/6 dark:bg-white/6 flex items-center justify-center mb-4">
                        <TrendingUp className="w-6 h-6 opacity-25" />
                      </div>
                      <p className="font-black text-sm text-foreground/35 tracking-tight">No activity yet</p>
                      <p className="text-xs mt-1 text-foreground/25 text-center max-w-[160px]">Start using Argus to see your timeline here</p>
                    </div>
                  )}
                </div>
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
