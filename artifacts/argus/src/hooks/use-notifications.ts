import { useState, useEffect, useCallback, useRef } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const SNOOZE_KEY    = "argus:notification-snooze";
const DISMISSED_KEY = "argus:notification-dismissed";
const NOTIFIED_KEY  = "argus:browser-notified";
const POLL_INTERVAL = 60_000;

export type NotifType = "overdue_task" | "due_soon" | "workflow_done" | "workflow_failed";
export type Priority  = "low" | "medium" | "high";

export interface AppNotification {
  id:          string;
  type:        NotifType;
  title:       string;
  body:        string;
  priority?:   Priority;
  taskId?:     number;
  workflowId?: number;
  at:          string;
}

/* ── localStorage helpers ── */
function getSnoozeMap():   Record<string, number> { try { return JSON.parse(localStorage.getItem(SNOOZE_KEY)    ?? "{}"); } catch { return {}; } }
function getDismissed():   Set<string>             { try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]")); } catch { return new Set(); } }
function getBrowserNotified(): Set<string>         { try { return new Set(JSON.parse(localStorage.getItem(NOTIFIED_KEY)  ?? "[]")); } catch { return new Set(); } }

function saveSnoozeMap(map: Record<string, number>) { localStorage.setItem(SNOOZE_KEY,    JSON.stringify(map)); }
function saveDismissed(set: Set<string>)            { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set])); }
function saveBrowserNotified(set: Set<string>)      { localStorage.setItem(NOTIFIED_KEY,  JSON.stringify([...set])); }

function isSnoozed(id: string):   boolean { const m = getSnoozeMap();   const u = m[id]; return !!u && Date.now() < u; }
function isDismissed(id: string): boolean { return getDismissed().has(id); }

/* ── Browser Notification API ── */
async function requestBrowserPermission(): Promise<void> {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
}

function fireBrowserNotif(n: AppNotification): void {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const alreadyFired = getBrowserNotified();
  if (alreadyFired.has(n.id)) return;
  alreadyFired.add(n.id);
  // Keep set bounded to 200 entries
  if (alreadyFired.size > 200) {
    const arr = [...alreadyFired];
    arr.splice(0, arr.length - 200);
    saveBrowserNotified(new Set(arr));
  } else {
    saveBrowserNotified(alreadyFired);
  }
  new Notification(n.title, {
    body: n.body,
    icon: `${BASE}/favicon.ico`,
    tag:  n.id,
    silent: false,
  });
}

/* ── Raw API shape ── */
interface RawNotification {
  overdueTasks:   Array<{ id: number; title: string; priority: string; dueDate: string }>;
  dueSoonTasks:   Array<{ id: number; title: string; priority: string; dueDate: string }>;
  recentWorkflows: Array<{ id: number; name: string; lastRunAt: string; lastRunStatus: string }>;
}

function buildNotifications(raw: RawNotification): AppNotification[] {
  const notifs: AppNotification[] = [];

  for (const task of raw.overdueTasks ?? []) {
    const id = `overdue-task-${task.id}`;
    if (isSnoozed(id) || isDismissed(id)) continue;
    const daysOverdue = Math.max(1, Math.floor((Date.now() - new Date(task.dueDate).getTime()) / 86_400_000));
    notifs.push({
      id, type: "overdue_task", title: "Overdue Task", priority: task.priority as Priority,
      body: `"${task.title}" was due ${daysOverdue === 1 ? "yesterday" : `${daysOverdue} days ago`}`,
      taskId: task.id, at: task.dueDate,
    });
  }

  for (const task of raw.dueSoonTasks ?? []) {
    const id = `due-soon-${task.id}`;
    if (isSnoozed(id) || isDismissed(id)) continue;
    // Don't double-show if already overdue
    if (notifs.find(n => n.taskId === task.id)) continue;
    notifs.push({
      id, type: "due_soon", title: "Due Today", priority: task.priority as Priority,
      body: `"${task.title}" is due today — don't forget!`,
      taskId: task.id, at: task.dueDate,
    });
  }

  for (const wf of raw.recentWorkflows ?? []) {
    const id   = `workflow-${wf.id}-${wf.lastRunAt}`;
    if (isSnoozed(id) || isDismissed(id)) continue;
    const type: NotifType = wf.lastRunStatus === "success" ? "workflow_done" : "workflow_failed";
    notifs.push({
      id, type, workflowId: wf.id, at: wf.lastRunAt,
      title: type === "workflow_done" ? "Workflow Completed" : "Workflow Failed",
      body:  `"${wf.name}" finished ${type === "workflow_done" ? "successfully" : "with errors"}`,
    });
  }

  return notifs;
}

export interface UseNotificationsReturn {
  notifications: AppNotification[];
  dismiss:    (id: string) => void;
  snooze:     (id: string, ms?: number) => void;
  dismissAll: () => void;
}

export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Request browser permission on mount */
  useEffect(() => { requestBrowserPermission(); }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/notifications`);
      if (!res.ok) return;
      const raw: RawNotification = await res.json();
      const built = buildNotifications(raw);
      setNotifications(built);
      // Fire browser notifications for new ones
      built.forEach(fireBrowserNotif);
    } catch { /* ignore network errors */ }
  }, []);

  useEffect(() => {
    fetchNotifications();
    timerRef.current = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchNotifications]);

  const dismiss = useCallback((id: string) => {
    const set = getDismissed(); set.add(id); saveDismissed(set);
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const snooze = useCallback((id: string, ms = 60 * 60_000) => {
    const map = getSnoozeMap(); map[id] = Date.now() + ms; saveSnoozeMap(map);
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setNotifications(prev => {
      const set = getDismissed(); prev.forEach(n => set.add(n.id)); saveDismissed(set);
      return [];
    });
  }, []);

  return { notifications, dismiss, snooze, dismissAll };
}
