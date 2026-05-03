import {
  useState, useEffect, useRef, useCallback, useMemo, memo,
} from "react";
import {
  useListTasks, useCreateTask, useUpdateTask, useDeleteTask,
  getListTasksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { format, parseISO, isToday, isTomorrow, isPast, addDays } from "date-fns";
import {
  Plus, Trash2, Flag, Check, X, Target, Flame, Repeat2,
  CheckCircle2, Circle, Timer, Play, Pause, RotateCcw,
  ChevronRight, ChevronLeft, CalendarDays, Clock, Pencil,
  Sparkles, LayoutDashboard, CheckSquare, BarChart2, Coffee,
  AlertCircle, Hourglass, CalendarClock,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────────────── */
type Priority   = "low" | "medium" | "high";
type TaskFilter = "all" | "today" | "upcoming" | "high";
type Tab        = "overview" | "tasks" | "habits";
type HabitFreq  = "daily" | "weekdays" | "weekly";
type TimerMode  = "work" | "short" | "long";
type Recurrence = "daily" | "weekdays" | "weekly" | "biweekly" | "monthly";

interface Goal      { id: string; text: string; }
interface FocusItem { id: string; text: string; done: boolean; }
interface Habit     { id: string; name: string; emoji: string; frequency: HabitFreq; completions: Record<string, boolean>; }
interface Subtask   { id: string; text: string; done: boolean; }
interface TimerState {
  taskId: number | null;
  remainingSeconds: number;
  running: boolean;
  startedAt: number | null;
  mode: TimerMode;
  cycleCount: number; // work sessions completed in current 4-session cycle
}

/* ─────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────── */
const POMODORO      = 25 * 60;
const SHORT_BREAK   = 5  * 60;
const LONG_BREAK    = 15 * 60;
const TIMER_KEY     = "argus_timer_v3";
const TIMES_KEY     = "argus_task_times";
const POMO_CNT_KEY  = "argus_pomo_counts";
const RECUR_KEY     = "argus_recurrence";
const GOALS_KEY     = "argus_goals";
const HABITS_KEY    = "argus_habits_v2";
const BASE          = import.meta.env.BASE_URL.replace(/\/$/, "");

const RECUR_LABELS: Record<Recurrence, string> = {
  daily:    "Daily",
  weekdays: "Weekdays",
  weekly:   "Weekly",
  biweekly: "Every 2 weeks",
  monthly:  "Monthly",
};
const RECUR_OPTS: Recurrence[] = ["daily", "weekdays", "weekly", "biweekly", "monthly"];

const MODE_DURATIONS: Record<TimerMode, number> = {
  work:  POMODORO,
  short: SHORT_BREAK,
  long:  LONG_BREAK,
};
const MODE_LABELS: Record<TimerMode, string> = {
  work:  "Focus · 25 min",
  short: "Short Break · 5 min",
  long:  "Long Break · 15 min",
};
const MODE_COLORS: Record<TimerMode, string> = {
  work:  "text-primary",
  short: "text-emerald-400",
  long:  "text-violet-400",
};

const P_CFG: Record<Priority, { label: string; color: string; ring: string; bg: string; dot: string; chip: string }> = {
  high:   { label: "High",   color: "text-rose-500",  ring: "border-rose-500",  bg: "bg-rose-500/10",  dot: "bg-rose-500",  chip: "bg-rose-500/10 text-rose-500 border-rose-500/20"   },
  medium: { label: "Med",    color: "text-amber-500", ring: "border-amber-500", bg: "bg-amber-500/10", dot: "bg-amber-500", chip: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  low:    { label: "Low",    color: "text-blue-400",  ring: "border-blue-400",  bg: "bg-blue-400/10",  dot: "bg-blue-400",  chip: "bg-blue-400/10 text-blue-400 border-blue-400/20"   },
};

const HABIT_EMOJIS = ["🏃", "📚", "💧", "🧘", "💪", "🎯", "🛌", "🥗", "✍️", "🌿", "🎵", "🧹"];
const FREQ_LABELS: Record<HabitFreq, string> = {
  daily: "Daily", weekdays: "Weekdays", weekly: "Weekly (Mon)",
};
const FILTERS: [TaskFilter, string][] = [
  ["all", "All"], ["today", "Today"], ["upcoming", "Upcoming"], ["high", "Priority"],
];
const TAB_DEFS: [Tab, string, React.ReactNode][] = [
  ["overview", "Overview", <LayoutDashboard className="w-3.5 h-3.5" />],
  ["tasks",    "Tasks",    <CheckSquare    className="w-3.5 h-3.5" />],
  ["habits",   "Habits",   <BarChart2      className="w-3.5 h-3.5" />],
];

/* ─────────────────────────────────────────────────────────
   STORAGE HELPERS
───────────────────────────────────────────────────────── */
function ls<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function lsSave(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* noop */ }
}
function getTaskTimes(): Record<string, string> { return ls(TIMES_KEY, {}); }
function saveTaskTime(id: number, t: string) {
  const map = getTaskTimes();
  if (t) { map[String(id)] = t; } else { delete map[String(id)]; }
  lsSave(TIMES_KEY, map);
}
function getTaskTime(id: number): string { return getTaskTimes()[String(id)] ?? ""; }

function getTaskPomoCounts(): Record<string, number> { return ls(POMO_CNT_KEY, {}); }
function getTaskPomoCount(id: number): number { return getTaskPomoCounts()[String(id)] ?? 0; }
function incTaskPomoCount(id: number) {
  const map = getTaskPomoCounts();
  map[String(id)] = (map[String(id)] ?? 0) + 1;
  lsSave(POMO_CNT_KEY, map);
}

function fmt12(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
function todayKey() { return new Date().toISOString().split("T")[0]; }

/* ── Recurrence helpers ── */
function getRecurrences(): Record<string, Recurrence> { return ls(RECUR_KEY, {}); }
function getRecurrence(id: number): Recurrence | null { return getRecurrences()[String(id)] ?? null; }
function setRecurrence(id: number, rule: Recurrence | null) {
  const map = getRecurrences();
  if (rule) { map[String(id)] = rule; } else { delete map[String(id)]; }
  lsSave(RECUR_KEY, map);
}
function transferRecurrence(fromId: number, toId: number) {
  const rule = getRecurrence(fromId);
  if (rule) { setRecurrence(fromId, null); setRecurrence(toId, rule); }
}

function nextDueDate(dueDate: string, rule: Recurrence): string {
  const d = new Date(dueDate + "T12:00:00");
  if (rule === "daily")    { d.setDate(d.getDate() + 1); }
  else if (rule === "weekdays") {
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  }
  else if (rule === "weekly")   { d.setDate(d.getDate() + 7); }
  else if (rule === "biweekly") { d.setDate(d.getDate() + 14); }
  else if (rule === "monthly")  { d.setMonth(d.getMonth() + 1); }
  return d.toISOString().split("T")[0];
}

/* ─────────────────────────────────────────────────────────
   AUDIO — gentle beep when timer ends
───────────────────────────────────────────────────────── */
function playDone(mode: TimerMode) {
  try {
    const ctx = new AudioContext();
    const freqs = mode === "work" ? [523, 659, 784] : [784, 659, 523];
    freqs.forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, ctx.currentTime + i * 0.15);
      g.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.15 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.4);
      o.start(ctx.currentTime + i * 0.15);
      o.stop(ctx.currentTime + i * 0.15 + 0.45);
    });
  } catch { /* no audio context */ }
}

/* ─────────────────────────────────────────────────────────
   HOOKS
───────────────────────────────────────────────────────── */
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function initTimerState(): TimerState {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    if (raw) {
      const p: TimerState = JSON.parse(raw);
      if (p.running && p.startedAt) {
        const elapsed = Math.floor((Date.now() - p.startedAt) / 1000);
        const rem = Math.max(0, p.remainingSeconds - elapsed);
        return { ...p, remainingSeconds: rem, running: rem > 0 };
      }
      return p;
    }
  } catch { /* noop */ }
  return { taskId: null, remainingSeconds: POMODORO, running: false, startedAt: null, mode: "work", cycleCount: 0 };
}

function useTaskTimer() {
  const [st, setSt] = useState<TimerState>(initTimerState);
  const stRef = useRef(st);
  stRef.current = st;

  // Countdown tick
  useEffect(() => {
    if (!st.running) return;
    const id = setInterval(() => {
      const s = stRef.current;
      if (!s.running || !s.startedAt) return;
      const elapsed  = Math.floor((Date.now() - s.startedAt) / 1000);
      const rem      = Math.max(0, s.remainingSeconds - elapsed);
      if (rem <= 0) {
        playDone(s.mode);
        // Advance mode
        let nextMode: TimerMode;
        let nextCycle = s.cycleCount;
        if (s.mode === "work") {
          nextCycle = s.cycleCount + 1;
          if (nextCycle >= 4) { nextMode = "long"; nextCycle = 0; }
          else                { nextMode = "short"; }
          if (s.taskId !== null) incTaskPomoCount(s.taskId);
        } else {
          nextMode = "work";
        }
        const next: TimerState = {
          taskId: s.taskId,
          remainingSeconds: MODE_DURATIONS[nextMode],
          running: false,
          startedAt: null,
          mode: nextMode,
          cycleCount: nextCycle,
        };
        lsSave(TIMER_KEY, next);
        setSt(next);
      }
    }, 500);
    return () => clearInterval(id);
  }, [st.running]);

  const getRem = useCallback(() => {
    const s = stRef.current;
    if (s.running && s.startedAt) {
      return Math.max(0, s.remainingSeconds - Math.floor((Date.now() - s.startedAt) / 1000));
    }
    return s.remainingSeconds;
  }, []);

  const start = useCallback((taskId: number, mode: TimerMode = "work") => {
    const next: TimerState = {
      taskId,
      remainingSeconds: MODE_DURATIONS[mode],
      running: true,
      startedAt: Date.now(),
      mode,
      cycleCount: stRef.current.cycleCount,
    };
    setSt(next); lsSave(TIMER_KEY, next);
  }, []);

  const pause = useCallback(() => {
    setSt(p => {
      const rem  = p.startedAt ? Math.max(0, p.remainingSeconds - Math.floor((Date.now() - p.startedAt) / 1000)) : p.remainingSeconds;
      const next = { ...p, remainingSeconds: rem, running: false, startedAt: null };
      lsSave(TIMER_KEY, next); return next;
    });
  }, []);

  const resume = useCallback(() => {
    setSt(p => { const next = { ...p, running: true, startedAt: Date.now() }; lsSave(TIMER_KEY, next); return next; });
  }, []);

  const reset = useCallback(() => {
    const next: TimerState = { taskId: null, remainingSeconds: POMODORO, running: false, startedAt: null, mode: "work", cycleCount: 0 };
    setSt(next); lsSave(TIMER_KEY, next);
  }, []);

  const skipBreak = useCallback(() => {
    setSt(p => {
      const next = { ...p, mode: "work" as TimerMode, remainingSeconds: POMODORO, running: false, startedAt: null };
      lsSave(TIMER_KEY, next); return next;
    });
  }, []);

  return { taskId: st.taskId, running: st.running, mode: st.mode, cycleCount: st.cycleCount, getRem, fmt: fmtTime, start, pause, resume, reset, skipBreak };
}

function fmtTime(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function useSubtasks(taskId: number | null) {
  const key = taskId ? `argus_subtasks_${taskId}` : null;
  const [items, setItems] = useState<Subtask[]>(() => key ? ls(key, []) : []);
  useEffect(() => { setItems(key ? ls(key, []) : []); }, [key]);
  const save = (next: Subtask[]) => { setItems(next); if (key) lsSave(key, next); };
  return {
    items,
    add:    (text: string) => save([...items, { id: crypto.randomUUID(), text, done: false }]),
    toggle: (id: string)   => save(items.map(s => s.id === id ? { ...s, done: !s.done } : s)),
    remove: (id: string)   => save(items.filter(s => s.id !== id)),
    doneCount: items.filter(s => s.done).length,
  };
}

function useTaskTime(taskId: number | null) {
  const [time, setTime] = useState(() => taskId ? getTaskTime(taskId) : "");
  useEffect(() => { setTime(taskId ? getTaskTime(taskId) : ""); }, [taskId]);
  const save = (t: string) => { setTime(t); if (taskId !== null) saveTaskTime(taskId, t); };
  return { time, save };
}

/* ─────────────────────────────────────────────────────────
   SHARED UI ATOMS
───────────────────────────────────────────────────────── */
function TimerRing({ remaining, total, mode = "work", size = 96, stroke = 7 }: {
  remaining: number; total: number; mode?: TimerMode; size?: number; stroke?: number;
}) {
  const r    = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct  = remaining / total;
  const color = mode === "short" ? "hsl(152 60% 55%)"
              : mode === "long"  ? "hsl(263 60% 65%)"
              : pct > 0.5 ? "hsl(217 91% 62%)" : pct > 0.2 ? "hsl(38 92% 50%)" : "hsl(0 82% 60%)";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" strokeWidth={stroke} stroke="hsl(var(--muted))" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" strokeWidth={stroke} stroke={color}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.5s linear, stroke 1s ease" }}
      />
    </svg>
  );
}

function PomoDots({ cycleCount }: { cycleCount: number }) {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className={`w-2 h-2 rounded-full transition-all ${i < cycleCount ? "bg-primary" : "bg-muted-foreground/20"}`} />
      ))}
    </div>
  );
}

function PriorityPicker({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  return (
    <div className="flex gap-1.5">
      {(["high", "medium", "low"] as Priority[]).map(p => {
        const c = P_CFG[p]; const active = value === p;
        return (
          <button key={p} onClick={() => onChange(p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all
              ${active ? `${c.bg} ${c.color} border-current/30` : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"}`}>
            <span className={`w-2 h-2 rounded-full ${c.dot}`} />{c.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   TASK DETAIL PANEL
───────────────────────────────────────────────────────── */
interface DetailProps {
  task: any;
  timer: ReturnType<typeof useTaskTimer>;
  onClose: () => void;
  onUpdate: (id: number, data: any) => void;
  onDelete: (id: number) => void;
  onTimeChange: () => void;
}

const TaskDetail = memo(function TaskDetail({ task, timer, onClose, onUpdate, onDelete, onTimeChange }: DetailProps) {
  const [title, setTitle]   = useState(task.title);
  const [desc, setDesc]     = useState(task.description ?? "");
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [recurRule, setRecurRule] = useState<Recurrence | null>(() => getRecurrence(task.id));
  const taskTime  = useTaskTime(task.id);
  const subtasks  = useSubtasks(task.id);
  const [newSub, setNewSub] = useState("");
  const [rem, setRem]       = useState(timer.getRem());
  const [pomoCount, setPomoCount] = useState(() => getTaskPomoCount(task.id));
  const today       = todayKey();
  const isTimerTask = timer.taskId === task.id;

  const saveRecur = (r: Recurrence | null) => { setRecurRule(r); setRecurrence(task.id, r); };

  // Tick for ring + pomo count refresh
  useEffect(() => {
    const id = setInterval(() => {
      setRem(timer.getRem());
      setPomoCount(getTaskPomoCount(task.id));
    }, 500);
    return () => clearInterval(id);
  }, [timer, task.id]);

  const saveTitle = () => { if (title.trim() && title !== task.title) onUpdate(task.id, { title: title.trim() }); };
  const saveDesc  = () => { if (desc !== (task.description ?? "")) onUpdate(task.id, { description: desc || null }); };
  const saveDue   = (v: string) => {
    setDueDate(v);
    onUpdate(task.id, { dueDate: v || null });
    if (!v) { taskTime.save(""); onTimeChange(); }
  };
  const saveTime = (v: string) => { taskTime.save(v); onTimeChange(); };
  const handleAddSub = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSub.trim()) { subtasks.add(newSub.trim()); setNewSub(""); }
  };

  const currentTotal = isTimerTask ? MODE_DURATIONS[timer.mode] : POMODORO;
  const currentMode  = isTimerTask ? timer.mode : "work";

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border bg-card/80 shrink-0">
        <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted text-muted-foreground transition-all">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <input value={title} onChange={e => setTitle(e.target.value)} onBlur={saveTitle}
          onKeyDown={e => { if (e.key === "Enter") { saveTitle(); (e.target as HTMLInputElement).blur(); } }}
          className="flex-1 min-w-0 bg-transparent text-[15px] font-bold tracking-tight focus:outline-none" />
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onUpdate(task.id, { completed: !task.completed })}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${task.completed ? "bg-emerald-500/12 text-emerald-500" : "text-muted-foreground hover:bg-muted hover:text-emerald-500"}`}>
            <Check className="w-4 h-4" />
          </button>
          <button onClick={() => { onDelete(task.id); onClose(); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-5 space-y-5">
          {/* Properties row */}
          <div className="rounded-xl border border-border bg-card/50 divide-y divide-border/50">
            {/* Priority */}
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground w-16 shrink-0">Priority</span>
              <PriorityPicker value={(task.priority as Priority) || "medium"} onChange={p => onUpdate(task.id, { priority: p })} />
            </div>

            {/* Due date */}
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground w-16 shrink-0">Due</span>
              <div className="flex items-center gap-2 flex-1 flex-wrap">
                <div className="relative">
                  <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                  <input type="date" value={dueDate} onChange={e => saveDue(e.target.value)} min={today}
                    className="h-8 pl-8 pr-2 rounded-lg border border-input bg-muted/30 text-[12px] focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                </div>
                <div className={`relative transition-opacity ${dueDate ? "opacity-100" : "opacity-30 pointer-events-none"}`}>
                  <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                  <input type="time" value={taskTime.time} onChange={e => saveTime(e.target.value)} disabled={!dueDate}
                    className="h-8 pl-8 pr-2 rounded-lg border border-input bg-muted/30 text-[12px] focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all disabled:cursor-not-allowed" />
                </div>
                {dueDate && (
                  <button onClick={() => saveDue("")}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-destructive transition-all">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Scheduled preview */}
            {dueDate && (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/3">
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground w-16 shrink-0">When</span>
                <p className="text-[12px] text-primary font-semibold flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5" />
                  {format(parseISO(dueDate), "EEEE, MMMM d")}
                  {taskTime.time && <span className="text-primary/70">at {fmt12(taskTime.time)}</span>}
                </p>
              </div>
            )}

            {/* Repeat / Recurrence */}
            <div className="flex items-start gap-3 px-4 py-3">
              <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground w-16 shrink-0 pt-0.5">Repeat</span>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => saveRecur(null)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all
                    ${!recurRule ? "bg-muted text-foreground border-border" : "border-border/50 text-muted-foreground hover:text-foreground"}`}>
                  None
                </button>
                {RECUR_OPTS.map(r => (
                  <button key={r} onClick={() => saveRecur(recurRule === r ? null : r)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all
                      ${recurRule === r ? "bg-primary/10 text-primary border-primary/25" : "border-border/50 text-muted-foreground hover:text-foreground"}`}>
                    {recurRule === r && <Repeat2 className="w-2.5 h-2.5" />}
                    {RECUR_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>

            {recurRule && (
              <div className="flex items-center gap-3 px-4 py-2 bg-primary/3">
                <span className="w-16 shrink-0" />
                <p className="text-[11px] text-primary/80 font-medium flex items-center gap-1.5">
                  <Repeat2 className="w-3 h-3" />
                  Repeats {RECUR_LABELS[recurRule].toLowerCase()}
                  {dueDate ? ` · next on ${format(parseISO(nextDueDate(dueDate, recurRule)), "MMM d")}` : ""}
                </p>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Notes</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} onBlur={saveDesc}
              placeholder="Add notes, links, or context…" rows={4}
              className="w-full px-3.5 py-3 rounded-xl border border-input bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 resize-none leading-relaxed placeholder:text-muted-foreground/40 transition-all" />
          </div>

          {/* Subtasks */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
              Subtasks{subtasks.items.length > 0 ? ` · ${subtasks.doneCount}/${subtasks.items.length}` : ""}
            </label>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {subtasks.items.length > 0 && (
                <div className="divide-y divide-border/50">
                  {subtasks.items.map(sub => (
                    <div key={sub.id} className="flex items-center gap-3 px-3.5 py-2.5 group">
                      <button onClick={() => subtasks.toggle(sub.id)} className="shrink-0 hover:scale-110 transition-transform">
                        {sub.done
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          : <Circle className="w-4 h-4 text-muted-foreground/35 hover:text-primary transition-colors" />}
                      </button>
                      <span className={`flex-1 text-sm ${sub.done ? "line-through text-muted-foreground/45" : ""}`}>{sub.text}</span>
                      <button onClick={() => subtasks.remove(sub.id)}
                        className="w-5 h-5 rounded-md opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={handleAddSub} className={`flex items-center gap-2 px-3.5 py-2.5 ${subtasks.items.length > 0 ? "border-t border-border/50" : ""}`}>
                <Plus className="w-3.5 h-3.5 text-muted-foreground/35 shrink-0" />
                <input value={newSub} onChange={e => setNewSub(e.target.value)} placeholder="Add a step…"
                  className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/35" />
                {newSub.trim() && <button type="submit" className="text-xs font-semibold text-primary">Add</button>}
              </form>
            </div>
          </div>

          {/* ── Pomodoro Timer ─────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Focus Timer
              </label>
              {pomoCount > 0 && (
                <span className="text-[11px] font-semibold text-primary flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />{pomoCount} session{pomoCount !== 1 ? "s" : ""} completed
                </span>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Mode tabs */}
              <div className="flex border-b border-border/50">
                {(["work", "short", "long"] as TimerMode[]).map(m => {
                  const labels: Record<TimerMode, string> = { work: "Focus", short: "Short Break", long: "Long Break" };
                  const isActive = isTimerTask && timer.mode === m;
                  return (
                    <button key={m} disabled={isTimerTask && timer.running}
                      onClick={() => {
                        if (!isTimerTask || !timer.running) {
                          if (!isTimerTask) { /* handled by start */ }
                        }
                      }}
                      className={`flex-1 py-2 text-[11px] font-semibold transition-all
                        ${isActive ? `bg-muted/50 ${MODE_COLORS[m]}` : "text-muted-foreground/50 hover:text-muted-foreground"}`}>
                      {labels[m]}
                    </button>
                  );
                })}
              </div>

              <div className="p-4">
                <div className="flex items-center gap-4">
                  {/* Ring */}
                  <div className="relative shrink-0">
                    <TimerRing remaining={isTimerTask ? rem : currentTotal} total={currentTotal} mode={currentMode} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={`text-[13px] font-black tabular-nums ${isTimerTask && timer.running ? MODE_COLORS[timer.mode] : "text-foreground"}`}>
                        {fmtTime(isTimerTask ? rem : currentTotal)}
                      </span>
                      {isTimerTask && (
                        <span className={`text-[9px] font-bold uppercase tracking-wide mt-0.5 ${MODE_COLORS[timer.mode]}`}>
                          {timer.mode === "work" ? "Focus" : timer.mode === "short" ? "Break" : "Rest"}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 space-y-2.5">
                    {/* Cycle dots */}
                    {isTimerTask && (
                      <div className="flex items-center gap-2">
                        <PomoDots cycleCount={timer.cycleCount} />
                        <span className="text-[10px] text-muted-foreground">{timer.cycleCount}/4 before long break</span>
                      </div>
                    )}

                    {/* Status */}
                    <p className={`text-xs ${isTimerTask ? MODE_COLORS[timer.mode] : "text-muted-foreground"}`}>
                      {!isTimerTask
                        ? "Start a focused work session"
                        : timer.mode === "work"
                          ? timer.running ? "Focusing — you got this!" : "Session paused"
                          : timer.running
                            ? timer.mode === "short" ? "Short break — breathe!" : "Long break — well deserved!"
                            : "Break ready — take a rest"}
                    </p>

                    {/* Controls */}
                    {isTimerTask ? (
                      <div className="flex gap-2">
                        <button onClick={timer.running ? timer.pause : timer.resume}
                          className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-semibold transition-all active:scale-95
                            ${timer.running
                              ? "bg-amber-500/12 text-amber-500 hover:bg-amber-500/18"
                              : "bg-primary/12 text-primary hover:bg-primary/18"}`}>
                          {timer.running ? <><Pause className="w-3 h-3" />Pause</> : <><Play className="w-3 h-3" />Resume</>}
                        </button>
                        {timer.mode !== "work" && (
                          <button onClick={timer.skipBreak}
                            className="flex items-center justify-center gap-1 h-8 px-3 rounded-lg bg-muted text-muted-foreground text-xs font-semibold hover:text-foreground transition-all active:scale-95">
                            Skip
                          </button>
                        )}
                        <button onClick={timer.reset}
                          className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted hover:bg-muted/80 text-muted-foreground transition-all active:scale-95">
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => timer.start(task.id, "work")}
                        className="w-full flex items-center justify-center gap-2 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all active:scale-[0.98] shadow-sm shadow-primary/20">
                        <Play className="w-3 h-3" />Start Focus
                      </button>
                    )}
                  </div>
                </div>

                {/* Done banner */}
                {isTimerTask && rem === 0 && (
                  <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
                    <p className={`text-sm font-semibold ${timer.mode === "work" ? "text-primary" : "text-emerald-500"}`}>
                      {timer.mode === "work" ? "⏱ Session done! Time for a break." : "☕ Break over — ready to focus?"}
                    </p>
                    <button onClick={() => timer.start(task.id, timer.mode === "work" ? (timer.cycleCount % 4 === 0 ? "long" : "short") : "work")}
                      className="text-xs font-bold text-primary hover:underline">
                      {timer.mode === "work" ? "Take break" : "Start focus"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Meta */}
          <div className="text-[11px] text-muted-foreground/45 space-y-0.5 pb-2">
            <p>Created {format(parseISO(task.createdAt), "MMM d, yyyy 'at' h:mm a")}</p>
            {task.updatedAt !== task.createdAt && <p>Updated {format(parseISO(task.updatedAt), "MMM d, yyyy 'at' h:mm a")}</p>}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
});

/* ─────────────────────────────────────────────────────────
   TASK CARD  — Notion-style
───────────────────────────────────────────────────────── */
interface CardProps {
  task: any;
  isSelected: boolean;
  taskTime: string;
  todayStr: string;
  timer: ReturnType<typeof useTaskTimer>;
  onSelect: () => void;
  onToggle: (id: number, completed: boolean) => void;
  onDelete: (id: number) => void;
}

const TaskCard = memo(function TaskCard({ task, isSelected, taskTime, todayStr, timer, onSelect, onToggle, onDelete }: CardProps) {
  const p: Priority = (task.priority as Priority) || "medium";
  const pc = P_CFG[p];
  const isOverdue  = !task.completed && task.dueDate && task.dueDate < todayStr;
  const isDueToday = !task.completed && task.dueDate && task.dueDate === todayStr;
  const tomStr     = new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split("T")[0];
  const isTomorrow = !task.completed && task.dueDate && task.dueDate === tomStr;
  const isTimerOn  = timer.taskId === task.id;

  const dateChip = (() => {
    if (!task.dueDate) return null;
    const time = taskTime ? ` ${fmt12(taskTime)}` : "";
    if (isOverdue)  return { text: `Overdue${time}`,                                    cls: "bg-rose-500/10 text-rose-500 border-rose-500/20" };
    if (isDueToday) return { text: `Today${time}`,                                       cls: "bg-amber-500/10 text-amber-500 border-amber-500/20" };
    if (isTomorrow) return { text: `Tomorrow${time}`,                                    cls: "bg-blue-500/10 text-blue-400 border-blue-400/20" };
    return           { text: `${format(parseISO(task.dueDate), "MMM d")}${time}`,       cls: "bg-muted text-muted-foreground border-border" };
  })();

  return (
    <div onClick={onSelect}
      className={`group flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-150 cursor-pointer
        ${isSelected  ? "border-primary/30 bg-primary/5 shadow-sm shadow-primary/5"
        : isOverdue   ? "border-rose-500/15 bg-rose-500/3 hover:bg-rose-500/5 hover:border-rose-500/25"
        : "border-border/60 bg-card hover:border-border hover:bg-muted/20"}`}>

      {/* Checkbox */}
      <button onClick={e => { e.stopPropagation(); onToggle(task.id, task.completed); }}
        className="shrink-0 hover:scale-110 active:scale-95 transition-transform">
        {task.completed
          ? <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" />
          : <Circle className={`w-4.5 h-4.5 ${pc.color} opacity-30 hover:opacity-100 transition-opacity`} />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-[13.5px] font-medium leading-snug ${task.completed ? "line-through text-muted-foreground/40" : "text-foreground"}`}>
          {task.title}
        </p>
        {/* Property chips */}
        {!task.completed && (
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {dateChip && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold ${dateChip.cls}`}>
                <CalendarDays className="w-2.5 h-2.5" />{dateChip.text}
              </span>
            )}
            {p !== "medium" && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold ${pc.chip}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`} />{pc.label}
              </span>
            )}
            {isTimerOn && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-primary/20 bg-primary/8 text-[10px] font-semibold text-primary">
                <Timer className="w-2.5 h-2.5" />{timer.running ? "Focusing" : "Paused"}
              </span>
            )}
            {(() => { const r = getRecurrence(task.id); return r ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-violet-400/20 bg-violet-400/8 text-[10px] font-semibold text-violet-400">
                <Repeat2 className="w-2.5 h-2.5" />{RECUR_LABELS[r]}
              </span>
            ) : null; })()}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={e => { e.stopPropagation(); onDelete(task.id); }}
          className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-all">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <ChevronRight className={`w-4 h-4 transition-all ${isSelected ? "text-primary" : "text-border/60 group-hover:text-muted-foreground/50"}`} />
      </div>
    </div>
  );
});

/* ─────────────────────────────────────────────────────────
   ADD TASK FORM — Notion-style inline
───────────────────────────────────────────────────────── */
interface CreateData { title: string; priority: Priority; dueDate?: string; dueTime?: string; recurrence?: Recurrence; }

function AddTaskForm({ onCreate }: { onCreate: (d: CreateData) => void }) {
  const [open, setOpen]           = useState(false);
  const [title, setTitle]         = useState("");
  const [priority, setPriority]   = useState<Priority>("medium");
  const [dueDate, setDueDate]     = useState("");
  const [dueTime, setDueTime]     = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const today    = todayKey();
  const tomorrow = new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split("T")[0];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate({
      title: title.trim(), priority,
      ...(dueDate ? { dueDate } : {}),
      ...(dueDate && dueTime ? { dueTime } : {}),
      ...(recurrence ? { recurrence } : {}),
    });
    setTitle(""); setDueDate(""); setDueTime(""); setPriority("medium"); setRecurrence(null); setOpen(false);
  };

  const quickDate = (d: string) => { setDueDate(d === dueDate ? "" : d); if (!d) setDueTime(""); };

  return (
    <div className={`rounded-xl border bg-card transition-all duration-200 ${open ? "border-primary/25 shadow-sm shadow-primary/5" : "border-dashed border-border/60 hover:border-border"}`}>
      <form onSubmit={submit}>
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-4 h-4 rounded-sm border-2 border-dashed border-muted-foreground/25 flex items-center justify-center shrink-0">
            <Plus className="w-2.5 h-2.5 text-muted-foreground/30" />
          </div>
          <input ref={inputRef} value={title} onChange={e => setTitle(e.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={e => { if (e.key === "Escape") { setOpen(false); setTitle(""); (e.target as HTMLInputElement).blur(); } }}
            placeholder="New task…" className="flex-1 bg-transparent text-[13.5px] placeholder:text-muted-foreground/35 focus:outline-none" />
          {title.trim() && (
            <button type="submit"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all active:scale-95 shrink-0">
              <Check className="w-3 h-3" />Add
            </button>
          )}
        </div>

        {/* Expanded row */}
        {open && (
          <div className="px-4 pb-3 pt-0 space-y-3">
            <div className="h-px bg-border/40" />

            {/* Date row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 w-10">📅 Due</span>
              {/* Quick picks */}
              <button type="button" onClick={() => quickDate(today)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all
                  ${dueDate === today ? "bg-amber-500/12 text-amber-500 border-amber-500/25" : "border-border text-muted-foreground hover:text-foreground"}`}>
                Today
              </button>
              <button type="button" onClick={() => quickDate(tomorrow)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all
                  ${dueDate === tomorrow ? "bg-blue-500/12 text-blue-400 border-blue-400/25" : "border-border text-muted-foreground hover:text-foreground"}`}>
                Tomorrow
              </button>
              {/* Custom date */}
              <div className="relative">
                <input type="date" value={dueDate} min={today}
                  onChange={e => { setDueDate(e.target.value); if (!e.target.value) setDueTime(""); }}
                  className="h-7 px-2 rounded-lg border border-border bg-transparent text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/25 text-muted-foreground w-28 cursor-pointer" />
              </div>
              {/* Time */}
              {dueDate && (
                <div className="relative flex items-center gap-1">
                  <Clock className="w-3 h-3 text-muted-foreground/50" />
                  <input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)}
                    className="h-7 px-2 rounded-lg border border-border bg-transparent text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/25 text-muted-foreground w-24 cursor-pointer" />
                </div>
              )}
              {dueDate && (
                <button type="button" onClick={() => { setDueDate(""); setDueTime(""); }}
                  className="text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Priority row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 w-10">🚩 Pri</span>
              {(["high", "medium", "low"] as Priority[]).map(p => {
                const cfg = P_CFG[p];
                return (
                  <button key={p} type="button" onClick={() => setPriority(p)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all
                      ${priority === p ? `${cfg.bg} ${cfg.color} border-current/30` : "border-border text-muted-foreground hover:text-foreground"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
                  </button>
                );
              })}

              <button type="button" onClick={() => { setOpen(false); setTitle(""); }}
                className="ml-auto text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Repeat row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 w-10">🔄 Rep</span>
              <button type="button" onClick={() => setRecurrence(null)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all
                  ${!recurrence ? "bg-muted text-foreground border-border" : "border-border/50 text-muted-foreground hover:text-foreground"}`}>
                None
              </button>
              {RECUR_OPTS.map(r => (
                <button key={r} type="button" onClick={() => setRecurrence(recurrence === r ? null : r)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all
                    ${recurrence === r ? "bg-violet-500/10 text-violet-400 border-violet-400/25" : "border-border/50 text-muted-foreground hover:text-foreground"}`}>
                  {recurrence === r && <Repeat2 className="w-2.5 h-2.5" />}
                  {RECUR_LABELS[r]}
                </button>
              ))}
            </div>

            {/* Preview */}
            {(dueDate || dueTime || recurrence) && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted/40 flex-wrap">
                <CalendarClock className="w-3 h-3 text-primary/70" />
                <span className="text-[11px] text-muted-foreground">
                  {dueDate && <>Due <strong className="text-foreground">{dueDate === today ? "today" : dueDate === tomorrow ? "tomorrow" : format(parseISO(dueDate), "MMM d")}</strong></>}
                  {dueTime && <> at <strong className="text-foreground">{fmt12(dueTime)}</strong></>}
                  {recurrence && <span className="text-violet-400 font-semibold"> · repeats {RECUR_LABELS[recurrence].toLowerCase()}</span>}
                </span>
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   TASKS TAB
───────────────────────────────────────────────────────── */
interface TasksTabProps {
  tasks: any[];
  isLoading: boolean;
  timer: ReturnType<typeof useTaskTimer>;
  onToggle: (id: number, completed: boolean) => void;
  onUpdate: (id: number, data: any) => void;
  onDelete: (id: number) => void;
  onCreate: (data: CreateData) => void;
}

type Group = { key: string; label: string; icon: React.ReactNode; tasks: any[]; color: string; empty?: boolean };

function groupTasks(tasks: any[], todayStr: string): Group[] {
  const pending   = tasks.filter(t => !t.completed);
  const done      = tasks.filter(t =>  t.completed);
  const overdue   = pending.filter(t => t.dueDate && t.dueDate < todayStr);
  const today     = pending.filter(t => t.dueDate === todayStr);
  const upcoming  = pending.filter(t => t.dueDate && t.dueDate > todayStr);
  const noDate    = pending.filter(t => !t.dueDate);

  const groups: Group[] = [];
  if (overdue.length)  groups.push({ key: "overdue",  label: "Overdue",   icon: <AlertCircle  className="w-3.5 h-3.5" />, tasks: overdue,  color: "text-rose-500"  });
  if (today.length)    groups.push({ key: "today",    label: "Today",     icon: <CalendarDays className="w-3.5 h-3.5" />, tasks: today,    color: "text-amber-500" });
  if (upcoming.length) groups.push({ key: "upcoming", label: "Upcoming",  icon: <Hourglass    className="w-3.5 h-3.5" />, tasks: upcoming, color: "text-blue-400"  });
  if (noDate.length)   groups.push({ key: "nodate",   label: "No Date",   icon: <Circle       className="w-3.5 h-3.5" />, tasks: noDate,   color: "text-muted-foreground" });
  if (done.length)     groups.push({ key: "done",     label: "Completed", icon: <CheckCircle2 className="w-3.5 h-3.5" />, tasks: done,     color: "text-emerald-500" });
  return groups;
}

function TasksTab({ tasks, isLoading, timer, onToggle, onUpdate, onDelete, onCreate }: TasksTabProps) {
  const isMobile = useIsMobile();
  const [filter, setFilter]     = useState<TaskFilter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [timesVer, setTimesVer] = useState(0);
  const todayStr = todayKey();

  const filtered = useMemo(() => {
    if (filter === "high")     return tasks.filter(t => !t.completed && t.priority === "high");
    if (filter === "today")    return tasks.filter(t => t.dueDate === todayStr);
    if (filter === "upcoming") return tasks.filter(t => t.dueDate && t.dueDate > todayStr);
    return tasks;
  }, [tasks, filter, todayStr]);

  const pending      = useMemo(() => filtered.filter(t => !t.completed), [filtered]);
  const done         = useMemo(() => filtered.filter(t =>  t.completed), [filtered]);
  const overdueCount = useMemo(() => pending.filter(t => t.dueDate && t.dueDate < todayStr).length, [pending, todayStr]);
  const selected     = useMemo(() => tasks.find(t => t.id === selectedId) ?? null, [tasks, selectedId]);
  const groups       = useMemo(() => filter === "all" ? groupTasks(tasks, todayStr) : null, [tasks, filter, todayStr]);

  const handleTimeChange = useCallback(() => setTimesVer(v => v + 1), []);
  const handleDelete = useCallback((id: number) => {
    if (selectedId === id) setSelectedId(null);
    onDelete(id);
  }, [selectedId, onDelete]);

  const renderCard = (task: any) => (
    <TaskCard key={`${task.id}-${timesVer}`} task={task} isSelected={selectedId === task.id}
      todayStr={todayStr} timer={timer} taskTime={getTaskTime(task.id)}
      onSelect={() => setSelectedId(selectedId === task.id ? null : task.id)}
      onToggle={onToggle} onDelete={handleDelete} />
  );

  const ListPane = (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-5 sm:px-6 pt-5 pb-4 shrink-0">
        <div className="flex items-center justify-between gap-3 mb-0.5">
          <h2 className="text-xl font-bold tracking-tight">Tasks</h2>
          {timer.taskId && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold
              ${timer.mode === "work" ? "bg-primary/10 text-primary" : timer.mode === "short" ? "bg-emerald-500/10 text-emerald-500" : "bg-violet-500/10 text-violet-400"}`}>
              {timer.mode === "work" ? <Timer className="w-3 h-3" /> : <Coffee className="w-3 h-3" />}
              <span className="tabular-nums">{fmtTime(timer.getRem())}</span>
              <span>{timer.mode === "work" ? "" : "break"}</span>
            </div>
          )}
        </div>
        <p className="text-[12px] text-muted-foreground">
          {pending.length} pending
          {overdueCount > 0 && <span className="text-rose-500 font-medium"> · {overdueCount} overdue</span>}
          {done.length > 0   && <span className="text-muted-foreground/50"> · {done.length} done</span>}
        </p>
        {/* Filters */}
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {FILTERS.map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all
                ${filter === v
                  ? v === "high" ? "bg-rose-500 text-white shadow-sm shadow-rose-500/20" : "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1 px-5 sm:px-6">
        <div className="pb-10 space-y-2">
          <AddTaskForm onCreate={onCreate} />

          {isLoading ? (
            <div className="space-y-2 mt-2">
              {[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-xl shimmer" style={{ animationDelay: `${i * 70}ms` }} />)}
            </div>
          ) : !filtered.length ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/8 flex items-center justify-center mb-4">
                <CheckSquare className="w-6 h-6 text-emerald-500/60" />
              </div>
              <p className="font-semibold text-sm text-muted-foreground">
                {filter === "today" ? "Nothing due today" : filter === "upcoming" ? "Nothing coming up" : filter === "high" ? "No high priority tasks" : "All caught up"}
              </p>
              <p className="text-xs mt-1 text-muted-foreground/50">Add a task above to get started</p>
            </div>
          ) : filter === "all" && groups ? (
            /* Notion-style grouped view */
            <div className="space-y-4 mt-2">
              {groups.map(g => (
                <div key={g.key}>
                  <div className={`flex items-center gap-1.5 mb-2 ${g.color}`}>
                    {g.icon}
                    <span className="text-[11px] font-bold uppercase tracking-widest">{g.label}</span>
                    <span className="text-[10px] opacity-60">· {g.tasks.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {g.key === "done"
                      ? <div className="space-y-1 opacity-55">{g.tasks.map(renderCard)}</div>
                      : g.tasks.map(renderCard)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Filtered flat view */
            <div className="space-y-1.5 mt-2">
              {pending.length > 0 && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 py-1">Pending · {pending.length}</p>
                  {pending.map(renderCard)}
                </>
              )}
              {done.length > 0 && (
                <>
                  <div className="flex items-center gap-2 pt-3 pb-1">
                    <div className="h-px flex-1 bg-border/40" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/35 px-2">Done · {done.length}</span>
                    <div className="h-px flex-1 bg-border/40" />
                  </div>
                  <div className="space-y-1 opacity-55">{done.map(renderCard)}</div>
                </>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );

  if (isMobile) {
    return selected
      ? <TaskDetail task={selected} timer={timer} onClose={() => setSelectedId(null)} onUpdate={onUpdate} onDelete={handleDelete} onTimeChange={handleTimeChange} />
      : ListPane;
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className={`transition-all duration-300 ${selected ? "w-[55%] min-w-[300px]" : "w-full"} border-r border-border overflow-hidden`}>
        {ListPane}
      </div>
      {selected && (
        <div className="flex-1 min-w-0 overflow-hidden">
          <TaskDetail task={selected} timer={timer} onClose={() => setSelectedId(null)} onUpdate={onUpdate} onDelete={handleDelete} onTimeChange={handleTimeChange} />
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   OVERVIEW SECTIONS
───────────────────────────────────────────────────────── */
function LiveClock({ now }: { now: Date }) {
  const hh   = String(now.getHours()).padStart(2, "0");
  const mm   = String(now.getMinutes()).padStart(2, "0");
  const ss   = String(now.getSeconds()).padStart(2, "0");
  const ampm = now.getHours() >= 12 ? "PM" : "AM";

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Live Clock</p>
      <div className="flex items-center gap-1.5">
        {[hh, mm, ss].map((val, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <div className="flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-card border border-border shadow-md">
              <span className="text-2xl font-black tabular-nums">{val}</span>
            </div>
            {i < 2 && <span className="text-xl font-black text-muted-foreground/30 mb-1">:</span>}
          </span>
        ))}
        <div className="ml-1 flex flex-col justify-end pb-1">
          <span className="text-xs font-bold text-muted-foreground">{ampm}</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground/50">{now.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}</p>
    </div>
  );
}

function WeeklyReview({ tasks }: { tasks: any[] }) {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true); setResult("");
    const r = await fetch(`${BASE}/api/tracker/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasks }),
    });
    if (!r.body) { setLoading(false); return; }
    const reader = r.body.getReader(); const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        if (part.startsWith("data: ")) {
          const d = part.slice(6);
          if (d === "[DONE]") break;
          try { setResult(p => (p ?? "") + JSON.parse(d)); } catch { /* noop */ }
        }
      }
    }
    setLoading(false);
  };

  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-violet-400" />AI Weekly Review
        </p>
        <button onClick={run} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/15 transition-all disabled:opacity-50 active:scale-95">
          {loading ? <><Pencil className="w-3 h-3 animate-pulse" />Writing…</> : <><Sparkles className="w-3 h-3" />Generate</>}
        </button>
      </div>
      {result !== null && (
        <div className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{result}</div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   OVERVIEW TAB
───────────────────────────────────────────────────────── */
interface OverviewTabProps {
  tasks: any[];
  now: Date;
  onGoToTasks: () => void;
  onUpdate: (id: number, data: any) => void;
  timer: ReturnType<typeof useTaskTimer>;
}

function OverviewTab({ tasks, now, onGoToTasks, onUpdate, timer }: OverviewTabProps) {
  const todayStr = now.toISOString().split("T")[0];
  const [goals, setGoals]     = useState<Goal[]>(() => ls(GOALS_KEY, []));
  const [focus, setFocus]     = useState<FocusItem[]>(() => ls("argus_focus", []));
  const [newGoal, setNewGoal] = useState("");
  const [newFocus, setNewFocus] = useState("");
  const [rem, setRem] = useState(timer.getRem());

  useEffect(() => { const id = setInterval(() => setRem(timer.getRem()), 500); return () => clearInterval(id); }, [timer]);

  const todayTasks   = useMemo(() => tasks.filter(t => t.dueDate === todayStr), [tasks, todayStr]);
  const overdueTasks = useMemo(() => tasks.filter(t => !t.completed && t.dueDate && t.dueDate < todayStr), [tasks, todayStr]);
  const pendingCount = useMemo(() => tasks.filter(t => !t.completed).length, [tasks]);
  const doneToday    = useMemo(() => tasks.filter(t => t.completed && t.updatedAt?.startsWith(todayStr)).length, [tasks, todayStr]);

  const saveGoals = (g: Goal[]) => { setGoals(g); lsSave(GOALS_KEY, g); };
  const saveFocus = (f: FocusItem[]) => { setFocus(f); lsSave("argus_focus", f); };

  return (
    <ScrollArea className="h-full">
      <div className="px-6 py-6 pb-12 space-y-5 max-w-2xl mx-auto">
        {/* Clock + Date */}
        <div className="surface p-5">
          <LiveClock now={now} />
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Pending",  val: pendingCount, color: "text-foreground",   sub: "tasks" },
            { label: "Due Today",val: todayTasks.length, color: todayTasks.length > 0 ? "text-amber-500" : "text-foreground", sub: "tasks" },
            { label: "Overdue",  val: overdueTasks.length, color: overdueTasks.length > 0 ? "text-rose-500" : "text-muted-foreground/40", sub: "tasks" },
          ].map(s => (
            <button key={s.label} onClick={onGoToTasks} className="surface p-4 text-center hover:bg-muted/30 transition-colors rounded-xl cursor-pointer">
              <p className={`text-2xl font-black ${s.color}`}>{s.val}</p>
              <p className="text-[11px] text-muted-foreground font-medium mt-0.5">{s.label}</p>
            </button>
          ))}
        </div>

        {/* Active Pomodoro bar (only when running) */}
        {timer.taskId !== null && (
          <div className={`surface p-4 flex items-center gap-4 border ${
            timer.mode === "work" ? "border-primary/20 bg-primary/3" : timer.mode === "short" ? "border-emerald-500/20 bg-emerald-500/3" : "border-violet-500/20 bg-violet-500/3"
          }`}>
            <div className="relative shrink-0">
              <TimerRing remaining={rem} total={MODE_DURATIONS[timer.mode]} mode={timer.mode} size={52} stroke={5} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-[10px] font-black tabular-nums ${MODE_COLORS[timer.mode]}`}>{fmtTime(rem)}</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[11px] font-bold uppercase tracking-widest ${MODE_COLORS[timer.mode]}`}>
                {timer.mode === "work" ? "🍅 Focus Session" : timer.mode === "short" ? "☕ Short Break" : "🌿 Long Break"}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <PomoDots cycleCount={timer.cycleCount} />
                <span className="text-[10px] text-muted-foreground">{timer.cycleCount}/4 sessions</span>
              </div>
            </div>
            <div className="flex gap-1.5">
              <button onClick={timer.running ? timer.pause : timer.resume}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95
                  ${timer.running ? "bg-amber-500/12 text-amber-500" : "bg-primary/12 text-primary"}`}>
                {timer.running ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              <button onClick={timer.reset}
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted text-muted-foreground transition-all active:scale-95">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Goals */}
        <div className="surface p-5">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-violet-400" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Weekly Goals</p>
          </div>
          <div className="space-y-2 mb-3">
            {goals.map(g => (
              <div key={g.id} className="flex items-center gap-2 group">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                <span className="flex-1 text-sm">{g.text}</span>
                <button onClick={() => saveGoals(goals.filter(x => x.id !== g.id))}
                  className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-muted-foreground/40 hover:text-destructive transition-all">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <form onSubmit={e => { e.preventDefault(); if (newGoal.trim()) { saveGoals([...goals, { id: crypto.randomUUID(), text: newGoal.trim() }]); setNewGoal(""); }}} className="flex gap-2">
            <input value={newGoal} onChange={e => setNewGoal(e.target.value)} placeholder="Add a goal…"
              className="flex-1 h-8 px-3 rounded-lg border border-border bg-muted/30 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/35 transition-all" />
            {newGoal.trim() && <button type="submit" className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all active:scale-95">Add</button>}
          </form>
        </div>

        {/* Today's tasks */}
        <div className="surface p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Today's Tasks
              {todayTasks.length > 0 && <span className="ml-1.5 text-muted-foreground/40">· {todayTasks.length}</span>}
            </p>
            <button onClick={onGoToTasks} className="text-[11px] text-primary font-semibold hover:underline">All tasks →</button>
          </div>
          {todayTasks.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-sm text-muted-foreground font-medium">Nothing due today</p>
              <button onClick={onGoToTasks} className="mt-2 text-xs text-primary font-semibold hover:underline">Add a task</button>
            </div>
          ) : (
            <div className="space-y-1">
              {todayTasks.filter(t => !t.completed).slice(0, 5).map(t => (
                <div key={t.id} onClick={() => onUpdate(t.id, { completed: true })}
                  className="flex items-center gap-2.5 group px-1 py-2 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer">
                  <Circle className="w-4 h-4 text-muted-foreground/30 group-hover:text-emerald-500 transition-colors shrink-0" />
                  <span className="flex-1 text-[13px] leading-snug">{t.title}</span>
                  {t.priority === "high" && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />}
                </div>
              ))}
              {todayTasks.filter(t => t.completed).slice(0, 2).map(t => (
                <div key={t.id} className="flex items-center gap-2.5 px-1 py-2 opacity-40">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="flex-1 text-[13px] line-through text-muted-foreground/60">{t.title}</span>
                </div>
              ))}
              {todayTasks.length > 7 && (
                <p className="text-[11px] text-muted-foreground/50 pl-1 pt-1">
                  +{todayTasks.length - 7} more — <button onClick={onGoToTasks} className="text-primary">view all</button>
                </p>
              )}
            </div>
          )}
        </div>

        {/* AI Weekly Review */}
        <WeeklyReview tasks={tasks} />

        {/* Quick Actions */}
        <div className="surface p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Quick Actions</p>
          <div className="flex flex-wrap gap-2">
            {([
              { label: "All Tasks",  onClick: onGoToTasks, emoji: "✅", cls: "bg-emerald-500/8 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/14" },
              { label: "New Chat",   href: "/chat",      emoji: "💬", cls: "bg-violet-500/8 text-violet-600 border-violet-500/20 hover:bg-violet-500/14" },
              { label: "Research",   href: "/research",  emoji: "🔬", cls: "bg-orange-500/8 text-orange-600 border-orange-500/20 hover:bg-orange-500/14" },
              { label: "Write Post", href: "/posts",     emoji: "✍️", cls: "bg-pink-500/8 text-pink-600 border-pink-500/20 hover:bg-pink-500/14" },
            ] as const).map(a => (
              "onClick" in a && a.onClick
                ? <button key={a.label} onClick={a.onClick} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all active:scale-95 ${a.cls}`}><span>{a.emoji}</span>{a.label}</button>
                : <a key={a.label} href={"href" in a ? a.href : ""} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all active:scale-95 ${a.cls}`}><span>{a.emoji}</span>{a.label}</a>
            ))}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

/* ─────────────────────────────────────────────────────────
   HABITS TAB
───────────────────────────────────────────────────────── */
function weekDates(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (n - 1 - i)); return d.toISOString().split("T")[0];
  });
}
function shouldRun(h: Habit, date: string): boolean {
  if (h.frequency === "daily") return true;
  const day = new Date(date + "T12:00:00").getDay();
  if (h.frequency === "weekdays") return day >= 1 && day <= 5;
  return day === 1;
}
function calcStreak(h: Habit): number {
  let s = 0; const today = todayKey(); const c = new Date();
  for (let i = 0; i < 365; i++) {
    const d = c.toISOString().split("T")[0];
    if (!shouldRun(h, d)) { c.setDate(c.getDate() - 1); continue; }
    if (d === today && !h.completions[d]) { c.setDate(c.getDate() - 1); continue; }
    if (h.completions[d]) { s++; c.setDate(c.getDate() - 1); } else break;
  }
  return s;
}

function HabitsTab() {
  const [habits, setHabits]     = useState<Habit[]>(() => ls(HABITS_KEY, []));
  const [adding, setAdding]     = useState(false);
  const [newName, setNewName]   = useState("");
  const [newEmoji, setNewEmoji] = useState("🏃");
  const [newFreq, setNewFreq]   = useState<HabitFreq>("daily");
  const today = todayKey();
  const days  = useMemo(() => weekDates(7), []);

  const save   = (next: Habit[]) => { setHabits(next); lsSave(HABITS_KEY, next); };
  const toggle = (hid: string, date: string) => save(habits.map(h => {
    if (h.id !== hid) return h;
    const c = { ...h.completions };
    if (c[date]) { delete c[date]; } else { c[date] = true; }
    return { ...h, completions: c };
  }));
  const addHabit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    save([...habits, { id: crypto.randomUUID(), name: newName.trim(), emoji: newEmoji, frequency: newFreq, completions: {} }]);
    setNewName(""); setNewEmoji("🏃"); setNewFreq("daily"); setAdding(false);
  };

  const doneToday       = habits.filter(h => h.completions[today] && shouldRun(h, today)).length;
  const applicableToday = habits.filter(h => shouldRun(h, today)).length;
  const bestStreak      = habits.length ? Math.max(...habits.map(calcStreak)) : 0;

  return (
    <ScrollArea className="h-full">
      <div className="px-6 py-6 pb-12 space-y-5">
        {habits.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Tracked",    val: habits.length,                       color: "text-foreground" },
              { label: "Done Today", val: `${doneToday}/${applicableToday}`,   color: "text-emerald-500" },
              { label: "Best Streak",val: bestStreak,                          color: "text-orange-400" },
            ].map(s => (
              <div key={s.label} className="surface p-4 text-center">
                <p className={`text-2xl font-black ${s.color}`}>{s.val}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="surface overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Repeat2 className="w-4 h-4 text-emerald-500" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Habit Tracker</span>
            </div>
            <button onClick={() => setAdding(a => !a)} className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors">
              <Plus className="w-3 h-3" />New habit
            </button>
          </div>

          {adding && (
            <form onSubmit={addHabit} className="p-4 border-b border-border space-y-2.5 bg-muted/20">
              <div className="flex items-center gap-2">
                <div className="relative group/emoji">
                  <button type="button" className="w-9 h-9 rounded-lg border border-border bg-muted flex items-center justify-center text-lg hover:border-primary/30 transition-all">
                    {newEmoji}
                  </button>
                  <div className="absolute top-full left-0 mt-1 z-20 flex flex-wrap gap-1 p-2 rounded-xl border border-border bg-popover shadow-xl w-52 opacity-0 pointer-events-none group-hover/emoji:opacity-100 group-hover/emoji:pointer-events-auto transition-all">
                    {HABIT_EMOJIS.map(e => (
                      <button key={e} type="button" onClick={() => setNewEmoji(e)}
                        className={`w-8 h-8 rounded-lg text-base flex items-center justify-center hover:bg-muted transition-all ${newEmoji === e ? "bg-primary/10" : ""}`}>
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Habit name…" autoFocus
                  className="flex-1 h-9 px-3 rounded-lg border border-border bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 placeholder:text-muted-foreground/35 transition-all" />
              </div>
              <div className="flex items-center gap-2">
                <select value={newFreq} onChange={e => setNewFreq(e.target.value as HabitFreq)}
                  className="h-8 px-2 rounded-lg border border-border bg-muted/30 text-xs focus:outline-none flex-1">
                  <option value="daily">Daily</option>
                  <option value="weekdays">Weekdays only</option>
                  <option value="weekly">Weekly (Mon)</option>
                </select>
                <button type="submit" className="h-8 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all active:scale-95">Create</button>
                <button type="button" onClick={() => setAdding(false)} className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              </div>
            </form>
          )}

          {habits.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-2xl mb-3">🌱</p>
              <p className="text-sm font-semibold text-muted-foreground">No habits yet</p>
              <p className="text-xs text-muted-foreground/50 mt-1">Click "New habit" to start building your streak</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 px-5 py-2 border-b border-border/40 bg-muted/10">
                <div className="flex-1" />
                <div className="flex gap-1">
                  {days.map(d => (
                    <div key={d} className={`w-8 text-center text-[10px] font-bold ${d === today ? "text-primary" : "text-muted-foreground/40"}`}>
                      {new Date(d + "T12:00:00").toLocaleDateString("en", { weekday: "short" }).slice(0, 1)}
                    </div>
                  ))}
                </div>
                <div className="w-16 text-right text-[10px] font-bold text-muted-foreground/40 pr-1">Streak</div>
              </div>

              {habits.map((h, i) => {
                const streak = calcStreak(h);
                return (
                  <div key={h.id} className={`group flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors ${i < habits.length - 1 ? "border-b border-border/30" : ""}`}>
                    <span className="text-xl shrink-0">{h.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium leading-tight truncate">{h.name}</p>
                      <p className="text-[10px] text-muted-foreground/50">{FREQ_LABELS[h.frequency]}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {days.map(d => {
                        const ok   = shouldRun(h, d);
                        const done = !!h.completions[d];
                        const isT  = d === today;
                        return (
                          <button key={d} onClick={() => ok && toggle(h.id, d)} disabled={!ok}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all
                              ${!ok  ? "opacity-15 cursor-default"
                              : done ? "bg-emerald-500 shadow-sm shadow-emerald-500/25 hover:bg-emerald-400 active:scale-95"
                              : isT  ? "border-2 border-border hover:border-primary/40 hover:bg-muted/50 active:scale-95"
                              : "border border-border/40 opacity-40"}`}>
                            {done && <Check className="w-3.5 h-3.5 text-white" />}
                          </button>
                        );
                      })}
                    </div>
                    <div className="w-16 flex items-center justify-end gap-1 shrink-0">
                      {streak > 0 && <Flame className="w-3 h-3 text-orange-400" />}
                      <span className={`text-xs font-bold tabular-nums ${streak > 0 ? "text-orange-400" : "text-muted-foreground/30"}`}>
                        {streak > 0 ? streak : "—"}
                      </span>
                      <button onClick={() => save(habits.filter(x => x.id !== h.id))}
                        className="opacity-0 group-hover:opacity-100 ml-1 w-4 h-4 flex items-center justify-center text-muted-foreground/40 hover:text-destructive transition-all">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

/* ─────────────────────────────────────────────────────────
   TAB BAR
───────────────────────────────────────────────────────── */
function TabBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-card/80 backdrop-blur-sm shrink-0">
      {TAB_DEFS.map(([v, l, icon]) => (
        <button key={v} onClick={() => setTab(v)}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all
            ${tab === v ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
          {icon}{l}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   ROOT
───────────────────────────────────────────────────────── */
export default function Tracker() {
  const [tab, setTab] = useState<Tab>("overview");

  const queryClient = useQueryClient();
  const { data: tasks = [], isLoading } = useListTasks({});
  const { mutate: createTask } = useCreateTask();
  const { mutate: updateTask } = useUpdateTask();
  const { mutate: deleteTask } = useDeleteTask();
  const inv = useCallback(() => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }), [queryClient]);

  const now   = useClock();
  const timer = useTaskTimer();

  const handleCreate = useCallback((data: CreateData) => {
    const { dueTime, recurrence, ...taskData } = data;
    createTask({ data: taskData }, {
      onSuccess: (t: any) => {
        if (t?.id) {
          if (dueTime) saveTaskTime(t.id, dueTime);
          if (recurrence) setRecurrence(t.id, recurrence);
        }
        inv();
      },
    });
  }, [createTask, inv]);

  const handleToggle = useCallback((id: number, completed: boolean) => {
    // Completing → check for recurrence and spawn next occurrence
    if (!completed) {
      const rule    = getRecurrence(id);
      const tasks_  = queryClient.getQueryData<any[]>(getListTasksQueryKey()) ?? [];
      const task    = tasks_.find((t: any) => t.id === id);
      if (rule && task) {
        const baseDue = task.dueDate ?? todayKey();
        const nd      = nextDueDate(baseDue, rule);
        const oldTime = getTaskTime(id);
        createTask(
          { data: { title: task.title, priority: task.priority, dueDate: nd } },
          { onSuccess: (newTask: any) => {
              if (newTask?.id) {
                transferRecurrence(id, newTask.id);
                if (oldTime) saveTaskTime(newTask.id, oldTime);
              }
              inv();
            },
          },
        );
      }
    }
    updateTask({ id, data: { completed: !completed } }, { onSuccess: inv });
  }, [updateTask, createTask, queryClient, inv]);

  const handleUpdate = useCallback((id: number, data: any) =>
    updateTask({ id, data }, { onSuccess: inv }), [updateTask, inv]);

  const handleDelete = useCallback((id: number) => {
    setRecurrence(id, null);
    deleteTask({ id }, { onSuccess: inv });
  }, [deleteTask, inv]);

  const goToTasks = useCallback(() => setTab("tasks"), []);

  if (tab === "tasks") {
    return (
      <div className="h-full flex flex-col bg-background">
        <TabBar tab={tab} setTab={setTab} />
        <div className="flex-1 min-h-0 overflow-hidden">
          <TasksTab tasks={tasks} isLoading={isLoading} timer={timer}
            onToggle={handleToggle} onUpdate={handleUpdate} onDelete={handleDelete} onCreate={handleCreate} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <TabBar tab={tab} setTab={setTab} />
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "overview" && (
          <OverviewTab tasks={tasks} now={now} onGoToTasks={goToTasks} onUpdate={handleUpdate} timer={timer} />
        )}
        {tab === "habits" && <HabitsTab />}
      </div>
    </div>
  );
}
