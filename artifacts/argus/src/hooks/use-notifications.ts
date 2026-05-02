import { useEffect, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useListTasks } from "@workspace/api-client-react";

const NOTIFIED_KEY = "argus:notified-task-ids";
const CHECK_INTERVAL = 60_000;

function getNotifiedIds(): Set<number> {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveNotifiedId(id: number) {
  const ids = getNotifiedIds();
  ids.add(id);
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...ids]));
}

export function useNotifications() {
  const { toast } = useToast();
  const { data: tasks, refetch } = useListTasks(
    {},
    { refetchInterval: CHECK_INTERVAL }
  );
  const hasRunInitial = useRef(false);

  const checkOverdue = useCallback(() => {
    if (!tasks) return;
    const today = new Date().toISOString().split("T")[0];
    const notified = getNotifiedIds();

    const overdueNow = tasks.filter(
      (t) => !t.completed && t.dueDate && t.dueDate < today && !notified.has(t.id)
    );

    if (overdueNow.length === 0) return;

    if (overdueNow.length === 1) {
      const t = overdueNow[0];
      toast({
        title: "Task Overdue",
        description: `"${t.title}" was due ${t.dueDate}`,
        variant: "destructive",
      });
      saveNotifiedId(t.id);
    } else {
      toast({
        title: `${overdueNow.length} Tasks Overdue`,
        description: overdueNow.map((t) => `• ${t.title}`).join("\n"),
        variant: "destructive",
      });
      overdueNow.forEach((t) => saveNotifiedId(t.id));
    }
  }, [tasks, toast]);

  useEffect(() => {
    if (!tasks) return;
    if (!hasRunInitial.current) {
      hasRunInitial.current = true;
      setTimeout(checkOverdue, 3000);
    }
  }, [tasks, checkOverdue]);

  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [refetch]);

  const notify = useCallback(
    (title: string, description: string, variant: "default" | "destructive" = "default") => {
      toast({ title, description, variant });
    },
    [toast]
  );

  return { notify };
}
