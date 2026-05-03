import { useState, useEffect } from "react";
import { useNotifications, type AppNotification, type Priority } from "@/hooks/use-notifications";
import { Link } from "wouter";
import {
  AlertTriangle, CheckCircle2, XCircle, X, BellOff, ChevronDown,
  ChevronUp, Flag, Zap, Clock,
} from "lucide-react";

/* ── Helpers ─────────────────────────────────────────────── */

const PRIORITY_COLOR: Record<Priority, string> = {
  high:   "text-red-500 bg-red-500/10 border-red-500/20",
  medium: "text-yellow-500 bg-yellow-500/10 border-yellow-500/20",
  low:    "text-blue-400 bg-blue-400/10 border-blue-400/20",
};

const PRIORITY_DOT: Record<Priority, string> = {
  high:   "bg-red-500",
  medium: "bg-yellow-500",
  low:    "bg-blue-400",
};

const SNOOZE_OPTIONS = [
  { label: "1 hour",   ms: 60 * 60_000 },
  { label: "4 hours",  ms: 4 * 60 * 60_000 },
  { label: "Tomorrow", ms: 24 * 60 * 60_000 },
];

/* ── Single toast card ──────────────────────────────────── */

function ToastCard({
  notif,
  onDismiss,
  onSnooze,
  style,
}: {
  notif: AppNotification;
  onDismiss: () => void;
  onSnooze: (ms: number) => void;
  style?: React.CSSProperties;
}) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const handleDismiss = () => {
    setLeaving(true);
    setTimeout(onDismiss, 250);
  };

  const handleSnooze = (ms: number) => {
    setLeaving(true);
    setTimeout(() => onSnooze(ms), 250);
  };

  const isTask = notif.type === "overdue_task";
  const isSuccess = notif.type === "workflow_done";
  const isFailed = notif.type === "workflow_failed";

  const IconEl = isTask
    ? AlertTriangle
    : isSuccess
    ? CheckCircle2
    : XCircle;

  const iconColor = isTask
    ? "text-orange-500"
    : isSuccess
    ? "text-green-500"
    : "text-red-500";

  const iconBg = isTask
    ? "bg-orange-500/10"
    : isSuccess
    ? "bg-green-500/10"
    : "bg-red-500/10";

  const accentBorder = isTask
    ? "border-orange-500/25"
    : isSuccess
    ? "border-green-500/25"
    : "border-red-500/25";

  return (
    <div
      style={style}
      className={`
        relative w-80 rounded-2xl border bg-card/95 backdrop-blur-xl shadow-xl
        transition-all duration-250 ease-out overflow-hidden
        ${accentBorder}
        ${leaving ? "opacity-0 translate-x-4 scale-95" : "opacity-100 translate-x-0 scale-100"}
      `}
    >
      {/* Accent stripe */}
      <div className={`absolute inset-y-0 left-0 w-1 rounded-l-2xl ${isTask ? "bg-orange-500" : isSuccess ? "bg-green-500" : "bg-red-500"}`} />

      <div className="pl-4 pr-3 pt-3 pb-3">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${iconBg} mt-0.5`}>
            <IconEl className={`w-4 h-4 ${iconColor}`} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {isTask ? "Overdue Task" : isSuccess ? "Workflow Done" : "Workflow Failed"}
              </p>
              {notif.priority && (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase border ${PRIORITY_COLOR[notif.priority]}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[notif.priority]}`} />
                  {notif.priority}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold leading-tight text-foreground">{notif.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{notif.body}</p>

            {/* CTA link */}
            {isTask && notif.taskId && (
              <Link href="/tasks" onClick={handleDismiss}
                className="inline-flex items-center gap-1 mt-2 text-xs text-primary font-semibold hover:underline"
              >
                <Flag className="w-3 h-3" /> View in Tasks
              </Link>
            )}
            {(isSuccess || isFailed) && notif.workflowId && (
              <Link href="/workflows" onClick={handleDismiss}
                className="inline-flex items-center gap-1 mt-2 text-xs text-primary font-semibold hover:underline"
              >
                <Zap className="w-3 h-3" /> View Workflow
              </Link>
            )}
          </div>

          {/* Dismiss */}
          <button onClick={handleDismiss}
            className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all mt-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-border/50">
          {isTask && (
            <div className="relative">
              <button
                onClick={() => setSnoozeOpen(o => !o)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg hover:bg-muted transition-all"
              >
                <BellOff className="w-3 h-3" />
                Snooze
                {snoozeOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {snoozeOpen && (
                <div className="absolute bottom-full left-0 mb-1 w-36 rounded-xl border border-border bg-popover shadow-lg overflow-hidden z-50">
                  {SNOOZE_OPTIONS.map(opt => (
                    <button key={opt.ms}
                      onClick={() => handleSnooze(opt.ms)}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors"
                    >
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button onClick={handleDismiss}
            className="ml-auto flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg hover:bg-muted transition-all"
          >
            <X className="w-3 h-3" /> Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Notification bell badge (header indicator) ─────────── */

export function NotificationBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center leading-none">
      {count > 9 ? "9+" : count}
    </span>
  );
}

/* ── Toast stack (the main export) ─────────────────────── */

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

  // Auto-expand when new notifications arrive
  useEffect(() => {
    if (notifications.length > 0) setCollapsed(false);
  }, [notifications.length]);

  if (notifications.length === 0) return null;

  return (
    /* Position: bottom-right on desktop; above mobile bottom-nav on mobile */
    <div className="fixed z-[100] bottom-[calc(3.75rem+env(safe-area-inset-bottom)+0.75rem)] md:bottom-5 right-3 md:right-5 flex flex-col-reverse gap-2 items-end pointer-events-none">
      {/* Collapsed indicator */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-card/95 backdrop-blur-xl border border-border shadow-xl text-sm font-semibold hover:bg-muted transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
          </span>
          {notifications.length} notification{notifications.length > 1 ? "s" : ""}
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      )}

      {/* Dismiss-all bar */}
      {!collapsed && notifications.length > 1 && (
        <div className="pointer-events-auto flex items-center justify-between gap-4 w-80 px-4 py-2 rounded-2xl bg-card/80 backdrop-blur-xl border border-border shadow-lg animate-in fade-in duration-200">
          <span className="text-xs text-muted-foreground font-medium">
            {notifications.length} notification{notifications.length > 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setCollapsed(true)}
              className="text-xs text-muted-foreground hover:text-foreground font-medium flex items-center gap-1 transition-all"
            >
              <ChevronDown className="w-3 h-3" /> Collapse
            </button>
            <span className="text-border">·</span>
            <button onClick={dismissAll}
              className="text-xs text-muted-foreground hover:text-destructive font-medium transition-all"
            >
              Dismiss all
            </button>
          </div>
        </div>
      )}

      {/* Overflow badge */}
      {!collapsed && overflow > 0 && (
        <div className="pointer-events-none w-80 flex justify-center">
          <span className="text-xs text-muted-foreground bg-card/80 px-3 py-1 rounded-full border border-border">
            +{overflow} more — scroll up to see all
          </span>
        </div>
      )}

      {/* Toast cards */}
      {!collapsed && visible.map((notif, i) => (
        <div
          key={notif.id}
          className="pointer-events-auto animate-in fade-in slide-in-from-bottom-3 duration-300"
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <ToastCard
            notif={notif}
            onDismiss={() => dismiss(notif.id)}
            onSnooze={(ms) => snooze(notif.id, ms)}
          />
        </div>
      ))}
    </div>
  );
}
