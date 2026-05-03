import { useState, useEffect } from "react";
import { useNotifications, type AppNotification, type Priority } from "@/hooks/use-notifications";
import { Link } from "wouter";
import { AlertTriangle, CheckCircle2, XCircle, X, BellOff, ChevronDown, ChevronUp, Flag, Zap, Clock } from "lucide-react";

const PRIORITY_BADGE: Record<Priority, string> = {
  high:   "text-red-400 bg-red-500/12 border-red-500/25",
  medium: "text-amber-400 bg-amber-500/12 border-amber-500/25",
  low:    "text-blue-400 bg-blue-500/12 border-blue-500/25",
};
const PRIORITY_DOT: Record<Priority, string> = {
  high: "bg-red-500", medium: "bg-amber-400", low: "bg-blue-400",
};
const SNOOZE_OPTIONS = [
  { label: "1 hour",   ms: 60 * 60_000 },
  { label: "4 hours",  ms: 4 * 60 * 60_000 },
  { label: "Tomorrow", ms: 24 * 60 * 60_000 },
];

function ToastCard({ notif, onDismiss, onSnooze }: {
  notif: AppNotification; onDismiss: () => void; onSnooze: (ms: number) => void;
}) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const handleDismiss = () => { setLeaving(true); setTimeout(onDismiss, 240); };
  const handleSnooze = (ms: number) => { setLeaving(true); setTimeout(() => onSnooze(ms), 240); };

  const isTask = notif.type === "overdue_task";
  const isSuccess = notif.type === "workflow_done";

  const config = isTask
    ? { Icon: AlertTriangle, iconBg: "bg-orange-500/15", iconColor: "text-orange-400", stripe: "bg-orange-500", border: "border-orange-500/20" }
    : isSuccess
    ? { Icon: CheckCircle2, iconBg: "bg-emerald-500/15", iconColor: "text-emerald-400", stripe: "bg-emerald-500", border: "border-emerald-500/20" }
    : { Icon: XCircle,      iconBg: "bg-red-500/15",     iconColor: "text-red-400",     stripe: "bg-red-500",    border: "border-red-500/20" };

  const { Icon } = config;

  return (
    <div className={`
      relative w-80 rounded-2xl border bg-card/96 glass shadow-2xl shadow-black/30 overflow-hidden
      transition-all duration-240 ease-out ${config.border}
      ${leaving ? "opacity-0 translate-x-3 scale-95" : "opacity-100 translate-x-0 scale-100"}
    `}>
      {/* Left accent stripe */}
      <div className={`absolute inset-y-0 left-0 w-[3px] rounded-l-2xl ${config.stripe}`} />
      {/* Top gradient shimmer */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="pl-4 pr-3.5 pt-3.5 pb-3">
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${config.iconBg}`}>
            <Icon className={`w-4 h-4 ${config.iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {isTask ? "Overdue Task" : isSuccess ? "Workflow Done" : "Workflow Failed"}
              </p>
              {notif.priority && (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase border ${PRIORITY_BADGE[notif.priority]}`}>
                  <span className={`w-1 h-1 rounded-full ${PRIORITY_DOT[notif.priority]}`} />
                  {notif.priority}
                </span>
              )}
            </div>
            <p className="text-[13px] font-bold leading-snug tracking-tight">{notif.title}</p>
            <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug">{notif.body}</p>
            {isTask && notif.taskId && (
              <Link href="/tasks" onClick={handleDismiss}
                className="inline-flex items-center gap-1 mt-2 text-[11px] text-primary font-bold hover:underline"
              >
                <Flag className="w-3 h-3" /> View in Tasks
              </Link>
            )}
            {!isTask && notif.workflowId && (
              <Link href="/workflows" onClick={handleDismiss}
                className="inline-flex items-center gap-1 mt-2 text-[11px] text-primary font-bold hover:underline"
              >
                <Zap className="w-3 h-3" /> View Workflow
              </Link>
            )}
          </div>
          <button onClick={handleDismiss}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-all mt-0.5 shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-border/40">
          {isTask && (
            <div className="relative">
              <button onClick={() => setSnoozeOpen(o => !o)}
                className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted transition-all"
              >
                <BellOff className="w-3 h-3" /> Snooze
                {snoozeOpen ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
              </button>
              {snoozeOpen && (
                <div className="absolute bottom-full left-0 mb-1.5 w-36 rounded-xl border border-border bg-popover shadow-xl overflow-hidden z-50">
                  {SNOOZE_OPTIONS.map(opt => (
                    <button key={opt.ms} onClick={() => handleSnooze(opt.ms)}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 text-[12px] font-medium hover:bg-muted transition-colors"
                    >
                      <Clock className="w-3 h-3 text-muted-foreground" /> {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button onClick={handleDismiss}
            className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-destructive px-2 py-1 rounded-lg hover:bg-muted transition-all"
          >
            <X className="w-3 h-3" /> Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export function NotificationBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-destructive text-white text-[9px] font-black flex items-center justify-center leading-none">
      {count > 9 ? "9+" : count}
    </span>
  );
}

const MAX_VISIBLE = 4;

export function NotificationToasts() {
  const result = useNotifications();
  const notifications: AppNotification[] = result?.notifications ?? [];
  const dismiss = result?.dismiss ?? (() => {});
  const snooze = result?.snooze ?? (() => {});
  const dismissAll = result?.dismissAll ?? (() => {});
  const [collapsed, setCollapsed] = useState(false);

  const visible = notifications.slice(0, MAX_VISIBLE);
  const overflow = notifications.length - MAX_VISIBLE;

  useEffect(() => {
    if (notifications.length > 0) setCollapsed(false);
  }, [notifications.length]);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed z-[100] bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-5 right-3 md:right-5 flex flex-col-reverse gap-2 items-end pointer-events-none">
      {/* Collapsed pill */}
      {collapsed && (
        <button onClick={() => setCollapsed(false)}
          className="pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-full bg-card/95 glass border border-border shadow-xl text-[12px] font-bold hover:bg-muted transition-all"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
          </span>
          {notifications.length} notification{notifications.length > 1 ? "s" : ""}
          <ChevronUp className="w-3 h-3 text-muted-foreground" />
        </button>
      )}

      {/* Dismiss bar */}
      {!collapsed && notifications.length > 1 && (
        <div className="pointer-events-auto flex items-center justify-between gap-3 w-80 px-4 py-2 rounded-2xl bg-card/85 glass border border-border shadow-lg">
          <span className="text-[11px] text-muted-foreground font-semibold">{notifications.length} notifications</span>
          <div className="flex items-center gap-3">
            <button onClick={() => setCollapsed(true)} className="text-[11px] text-muted-foreground hover:text-foreground font-semibold flex items-center gap-1 transition-colors">
              <ChevronDown className="w-3 h-3" /> Collapse
            </button>
            <span className="text-border/60 text-xs">·</span>
            <button onClick={dismissAll} className="text-[11px] text-muted-foreground hover:text-destructive font-semibold transition-colors">
              Dismiss all
            </button>
          </div>
        </div>
      )}

      {overflow > 0 && !collapsed && (
        <div className="pointer-events-none w-80 flex justify-center">
          <span className="text-[11px] text-muted-foreground bg-card/80 px-3 py-1 rounded-full border border-border">
            +{overflow} more
          </span>
        </div>
      )}

      {/* Toast cards */}
      {!collapsed && visible.map((notif, i) => (
        <div key={notif.id} className="pointer-events-auto animate-in fade-in slide-in-from-right-3 duration-300" style={{ animationDelay: `${i * 40}ms` }}>
          <ToastCard notif={notif} onDismiss={() => dismiss(notif.id)} onSnooze={(ms) => snooze(notif.id, ms)} />
        </div>
      ))}
    </div>
  );
}
