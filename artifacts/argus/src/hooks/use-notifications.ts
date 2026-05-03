import { useState, useEffect, useCallback, useRef } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const SNOOZE_KEY = "argus:notification-snooze";
const DISMISSED_KEY = "argus:notification-dismissed";
const POLL_INTERVAL = 60_000;

export type NotifType = "overdue_task" | "workflow_done" | "workflow_failed";
export type Priority = "low" | "medium" | "high";

export interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  priority?: Priority;
  taskId?: number;
  workflowId?: number;
  at: string;
}

function getSnoozeMap(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? "{}"); } catch { return {}; }
}

function getDismissed(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]")); } catch { return new Set(); }
}

function saveSnoozeMap(map: Record<string, number>) {
  localStorage.setItem(SNOOZE_KEY, JSON.stringify(map));
}

function saveDismissed(set: Set<string>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
}

function isSnoozed(id: string): boolean {
  const map = getSnoozeMap();
  const until = map[id];
  return !!until && Date.now() < until;
}

function isDismissed(id: string): boolean {
  return getDismissed().has(id);
}

interface RawNotification {
  overdueTasks: Array<{ id: number; title: string; priority: string; dueDate: string }>;
  recentWorkflows: Array<{ id: number; name: string; lastRunAt: string; lastRunStatus: string }>;
}

function buildNotifications(raw: RawNotification): AppNotification[] {
  const notifs: AppNotification[] = [];

  for (const task of raw.overdueTasks) {
    const id = `overdue-task-${task.id}`;
    if (isSnoozed(id) || isDismissed(id)) continue;
    const daysOverdue = Math.floor(
      (Date.now() - new Date(task.dueDate).getTime()) / 86_400_000
    );
    notifs.push({
      id,
      type: "overdue_task",
      title: "Overdue Task",
      body: `"${task.title}" was due ${daysOverdue <= 1 ? "yesterday" : `${daysOverdue} days ago`}`,
      priority: task.priority as Priority,
      taskId: task.id,
      at: task.dueDate,
    });
  }

  for (const wf of raw.recentWorkflows) {
    const id = `workflow-${wf.id}-${wf.lastRunAt}`;
    if (isSnoozed(id) || isDismissed(id)) continue;
    const type: NotifType = wf.lastRunStatus === "success" ? "workflow_done" : "workflow_failed";
    notifs.push({
      id,
      type,
      title: type === "workflow_done" ? "Workflow Completed" : "Workflow Failed",
      body: `"${wf.name}" finished ${type === "workflow_done" ? "successfully" : "with errors"}`,
      workflowId: wf.id,
      at: wf.lastRunAt,
    });
  }

  return notifs;
}

export interface UseNotificationsReturn {
  notifications: AppNotification[];
  dismiss: (id: string) => void;
  snooze: (id: string, ms?: number) => void;
  dismissAll: () => void;
}

export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/notifications`);
      if (!res.ok) return;
      const raw: RawNotification = await res.json();
      setNotifications(buildNotifications(raw));
    } catch { /* ignore network errors */ }
  }, []);

  useEffect(() => {
    fetchNotifications();
    timerRef.current = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchNotifications]);

  const dismiss = useCallback((id: string) => {
    const set = getDismissed();
    set.add(id);
    saveDismissed(set);
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const snooze = useCallback((id: string, ms = 60 * 60 * 1000) => {
    const map = getSnoozeMap();
    map[id] = Date.now() + ms;
    saveSnoozeMap(map);
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setNotifications(prev => {
      const set = getDismissed();
      prev.forEach(n => set.add(n.id));
      saveDismissed(set);
      return [];
    });
  }, []);

  return { notifications, dismiss, snooze, dismissAll };
}
