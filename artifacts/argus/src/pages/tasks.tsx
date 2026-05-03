import { useState, useEffect, useCallback, useRef } from "react";
import {
  useListTasks, useCreateTask, useUpdateTask, useDeleteTask, getListTasksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { format, parseISO } from "date-fns";
import {
  Plus, Trash2, Flag, CheckSquare, CalendarDays, X,
  Circle, CheckCircle2, Timer, Play, Pause, RotateCcw,
  ChevronRight, ChevronLeft, Check, Clock,
} from "lucide-react";

type Priority = "low" | "medium" | "high";
type Filter = "all" | "today" | "upcoming" | "high";

/* ─── Priority config ────────────────────────────────── */
const PRIORITY_CFG: Record<Priority, { label: string; color: string; ring: string; bg: string; dot: string; badgeBg: string }> = {
  high:   { label: "High",   color: "text-rose-500",    ring: "border-rose-500",    bg: "bg-rose-500/10",    dot: "bg-rose-500",   badgeBg: "bg-rose-500/8 text-rose-500" },
  medium: { label: "Medium", color: "text-amber-500",   ring: "border-amber-500",   bg: "bg-amber-500/10",   dot: "bg-amber-500",  badgeBg: "bg-amber-500/8 text-amber-500" },
  low:    { label: "Low",    color: "text-blue-400",    ring: "border-blue-400",    bg: "bg-blue-400/10",    dot: "bg-blue-400",   badgeBg: "bg-blue-400/8 text-blue-400" },
};

/* ─── Time utils ─────────────────────────────────────── */
const TASK_TIMES_KEY = "argus_task_times";

function getAllTaskTimes(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(TASK_TIMES_KEY) ?? "{}"); } catch { return {}; }
}
function saveTaskTime(taskId: number, time: string) {
  const all = getAllTaskTimes();
  if (time) { all[String(taskId)] = time; } else { delete all[String(taskId)]; }
  try { localStorage.setItem(TASK_TIMES_KEY, JSON.stringify(all)); } catch {}
}
function getTaskTime(taskId: number): string {
  return getAllTaskTimes()[String(taskId)] ?? "";
}
function fmt12(time24: string): string {
  if (!time24) return "";
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/* ─── useTaskTime hook ───────────────────────────────── */
function useTaskTime(taskId: number | null) {
  const [time, setTime] = useState<string>(() => (taskId ? getTaskTime(taskId) : ""));
  useEffect(() => { setTime(taskId ? getTaskTime(taskId) : ""); }, [taskId]);
  const save = (t: string) => { setTime(t); if (taskId !== null) saveTaskTime(taskId, t); };
  return { time, save };
}

/* ─── Pomodoro timer hook ────────────────────────────── */
const TIMER_KEY = "argus_timer_v2";
const POMODORO = 25 * 60;

interface TimerState {
  taskId: number | null;
  remainingSeconds: number;
  running: boolean;
  startedAt: number | null;
}

function initTimer(): TimerState {
  try {
    const s = localStorage.getItem(TIMER_KEY);
    if (s) {
      const p: TimerState = JSON.parse(s);
      if (p.running && p.startedAt) {
        const elapsed = Math.floor((Date.now() - p.startedAt) / 1000);
        const rem = Math.max(0, p.remainingSeconds - elapsed);
        return { ...p, remainingSeconds: rem, running: rem > 0 };
      }
      return p;
    }
  } catch {}
  return { taskId: null, remainingSeconds: POMODORO, running: false, startedAt: null };
}
function saveTimer(s: TimerState) { try { localStorage.setItem(TIMER_KEY, JSON.stringify(s)); } catch {} }

function useTaskTimer() {
  const [st, setSt] = useState<TimerState>(initTimer);
  const stRef = useRef(st);
  stRef.current = st;

  useEffect(() => {
    if (!st.running) return;
    const iv = setInterval(() => {
      setSt(prev => {
        if (!prev.running || !prev.startedAt) return prev;
        const elapsed = Math.floor((Date.now() - prev.startedAt) / 1000);
        const rem = Math.max(0, prev.remainingSeconds - elapsed);
        if (rem <= 0) { const next = { ...prev, running: false, remainingSeconds: 0, startedAt: null }; saveTimer(next); return next; }
        return { ...prev };
      });
    }, 500);
    return () => clearInterval(iv);
  }, [st.running]);

  const getRem = () => {
    const s = stRef.current;
    if (s.running && s.startedAt) return Math.max(0, s.remainingSeconds - Math.floor((Date.now() - s.startedAt) / 1000));
    return s.remainingSeconds;
  };
  const start = useCallback((taskId: number) => {
    const next: TimerState = { taskId, remainingSeconds: POMODORO, running: true, startedAt: Date.now() };
    setSt(next); saveTimer(next);
  }, []);
  const pause = useCallback(() => {
    setSt(prev => {
      const rem = prev.startedAt ? Math.max(0, prev.remainingSeconds - Math.floor((Date.now() - prev.startedAt) / 1000)) : prev.remainingSeconds;
      const next = { ...prev, remainingSeconds: rem, running: false, startedAt: null };
      saveTimer(next); return next;
    });
  }, []);
  const resume = useCallback(() => {
    setSt(prev => { const next = { ...prev, running: true, startedAt: Date.now() }; saveTimer(next); return next; });
  }, []);
  const reset = useCallback(() => {
    const next: TimerState = { taskId: null, remainingSeconds: POMODORO, running: false, startedAt: null };
    setSt(next); saveTimer(next);
  }, []);
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return { taskId: st.taskId, running: st.running, getRem, fmt, start, pause, resume, reset };
}

/* ─── Subtasks hook ──────────────────────────────────── */
interface Subtask { id: string; text: string; done: boolean; }

function useSubtasks(taskId: number | null) {
  const key = taskId ? `argus_subtasks_${taskId}` : null;
  const [items, setItems] = useState<Subtask[]>(() => {
    if (!key) return [];
    try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; }
  });
  useEffect(() => {
    if (!key) { setItems([]); return; }
    try { setItems(JSON.parse(localStorage.getItem(key) ?? "[]")); } catch { setItems([]); }
  }, [key]);
  const save = (next: Subtask[]) => {
    setItems(next);
    if (key) try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
  };
  const add = (text: string) => save([...items, { id: crypto.randomUUID(), text, done: false }]);
  const toggle = (id: string) => save(items.map(s => s.id === id ? { ...s, done: !s.done } : s));
  const remove = (id: string) => save(items.filter(s => s.id !== id));
  return { items, add, toggle, remove, doneCount: items.filter(s => s.done).length };
}

/* ─── Timer ring SVG ─────────────────────────────────── */
function TimerRing({ remaining, size = 96, stroke = 7 }: { remaining: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = remaining / POMODORO;
  const offset = circ * (1 - pct);
  const color = pct > 0.5 ? "hsl(217 91% 62%)" : pct > 0.2 ? "hsl(38 92% 50%)" : "hsl(0 82% 60%)";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke="hsl(var(--muted))" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
        stroke={color} strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.5s linear, stroke 1s ease" }}
      />
    </svg>
  );
}

/* ─── Priority picker ────────────────────────────────── */
function PriorityPicker({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  return (
    <div className="flex gap-1.5">
      {(["high", "medium", "low"] as Priority[]).map(p => {
        const c = PRIORITY_CFG[p];
        const active = value === p;
        return (
          <button key={p} onClick={() => onChange(p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${active ? `${c.bg} ${c.color} border-current/30` : "bg-muted/40 border-border text-muted-foreground hover:border-primary/25 hover:text-foreground"}`}
          >
            <span className={`w-2 h-2 rounded-full ${c.dot}`} />
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Task Detail Panel ──────────────────────────────── */
function TaskDetail({ task, onClose, onUpdate, onDelete, timer, onTimeChange }: {
  task: any;
  onClose: () => void;
  onUpdate: (id: number, data: any) => void;
  onDelete: (id: number) => void;
  timer: ReturnType<typeof useTaskTimer>;
  onTimeChange: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description ?? "");
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const taskTime = useTaskTime(task.id);
  const subtasks = useSubtasks(task.id);
  const { add: addSubtask } = subtasks;
  const [newSub, setNewSub] = useState("");
  const todayStr = new Date().toISOString().split("T")[0];

  const [rem, setRem] = useState(timer.getRem());
  useEffect(() => { const iv = setInterval(() => setRem(timer.getRem()), 500); return () => clearInterval(iv); }, [timer]);

  const isTimerTask = timer.taskId === task.id;
  const saveTitle = () => { if (title.trim() && title !== task.title) onUpdate(task.id, { title: title.trim() }); };
  const saveDesc = () => { if (desc !== (task.description ?? "")) onUpdate(task.id, { description: desc || null }); };
  const saveDue = (v: string) => { setDueDate(v); onUpdate(task.id, { dueDate: v || null }); if (!v) { taskTime.save(""); onTimeChange(); } };
  const saveTime = (v: string) => { taskTime.save(v); onTimeChange(); };
  const savePriority = (p: Priority) => onUpdate(task.id, { priority: p });
  const handleAddSub = (e: React.FormEvent) => { e.preventDefault(); if (newSub.trim()) { addSubtask(newSub.trim()); setNewSub(""); } };

  return (
    <div className="flex flex-col h-full bg-background" style={{ animation: "slide-right-fade 0.18s ease-out both" }}>

      {/* ── Header ── */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border bg-card/80 glass shrink-0">
        <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
          <ChevronLeft className="w-4.5 h-4.5" />
        </button>
        <div className="flex-1 min-w-0">
          <input value={title} onChange={e => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={e => { if (e.key === "Enter") { saveTitle(); (e.target as HTMLInputElement).blur(); } }}
            className="w-full bg-transparent text-[15px] font-bold tracking-tight focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onUpdate(task.id, { completed: !task.completed })}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${task.completed ? "bg-emerald-500/12 text-emerald-500" : "text-muted-foreground hover:bg-muted hover:text-emerald-500"}`}
          ><Check className="w-4 h-4" /></button>
          <button onClick={() => { onDelete(task.id); onClose(); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
          ><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-5 space-y-5">

          {/* ── Priority ── */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Priority</label>
            <PriorityPicker value={(task.priority as Priority) || "medium"} onChange={savePriority} />
          </div>

          {/* ── Schedule: Date + Time ── */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Schedule</label>
            <div className="flex gap-2">
              {/* Date */}
              <div className="relative flex-1">
                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input type="date" value={dueDate} onChange={e => saveDue(e.target.value)} min={todayStr}
                  className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-muted/30 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 transition-all"
                />
              </div>
              {/* Time — only relevant when date is set */}
              <div className={`relative transition-all duration-200 ${dueDate ? "opacity-100 w-32" : "opacity-40 w-32 pointer-events-none"}`}>
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input type="time" value={taskTime.time} onChange={e => saveTime(e.target.value)} disabled={!dueDate}
                  className="w-full h-9 pl-9 pr-2 rounded-lg border border-input bg-muted/30 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 transition-all disabled:cursor-not-allowed"
                />
              </div>
              {/* Clear date */}
              {dueDate && (
                <button onClick={() => saveDue("")} className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-destructive transition-all shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {dueDate && taskTime.time && (
              <p className="mt-1.5 text-[11px] text-primary/80 font-semibold flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Scheduled for {format(parseISO(dueDate), "MMM d")} at {fmt12(taskTime.time)}
              </p>
            )}
          </div>

          {/* ── Notes ── */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Notes</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} onBlur={saveDesc}
              placeholder="Add notes, links, or context…" rows={4}
              className="w-full px-3.5 py-3 rounded-lg border border-input bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 resize-none leading-relaxed placeholder:text-muted-foreground/40 transition-all"
            />
          </div>

          {/* ── Subtasks ── */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
              Subtasks{subtasks.items.length > 0 ? ` · ${subtasks.doneCount}/${subtasks.items.length}` : ""}
            </label>
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              {subtasks.items.length > 0 && (
                <div className="divide-y divide-border/50">
                  {subtasks.items.map(sub => (
                    <div key={sub.id} className="flex items-center gap-3 px-3.5 py-2.5 group">
                      <button onClick={() => subtasks.toggle(sub.id)} className="shrink-0 transition-all hover:scale-110">
                        {sub.done
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          : <Circle className="w-4 h-4 text-muted-foreground/35 hover:text-primary transition-colors" />
                        }
                      </button>
                      <span className={`flex-1 text-sm leading-snug ${sub.done ? "line-through text-muted-foreground/45" : ""}`}>{sub.text}</span>
                      <button onClick={() => subtasks.remove(sub.id)}
                        className="w-5 h-5 rounded-md opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all"
                      ><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={handleAddSub} className={`flex items-center gap-2 px-3.5 py-2.5 ${subtasks.items.length > 0 ? "border-t border-border/50" : ""}`}>
                <Plus className="w-3.5 h-3.5 text-muted-foreground/35 shrink-0" />
                <input value={newSub} onChange={e => setNewSub(e.target.value)} placeholder="Add a step…"
                  className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/35"
                />
                {newSub.trim() && (
                  <button type="submit" className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors">Add</button>
                )}
              </form>
            </div>
          </div>

          {/* ── Pomodoro Timer ── */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5">Focus Timer · 25 min</label>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-5">
                <div className="relative shrink-0">
                  <TimerRing remaining={isTimerTask ? rem : POMODORO} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-[13px] font-black tabular-nums ${isTimerTask && timer.running ? "text-primary" : "text-foreground"}`}>
                      {timer.fmt(isTimerTask ? rem : POMODORO)}
                    </span>
                  </div>
                </div>
                <div className="flex-1 space-y-2.5">
                  {isTimerTask ? (
                    <>
                      <p className="text-xs text-muted-foreground">{timer.running ? "Focus session running" : "Session paused"}</p>
                      <div className="flex gap-2">
                        <button onClick={() => timer.running ? timer.pause() : timer.resume()}
                          className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-semibold transition-all active:scale-95 ${timer.running ? "bg-amber-500/12 text-amber-500 hover:bg-amber-500/18" : "bg-primary/12 text-primary hover:bg-primary/18"}`}
                        >
                          {timer.running ? <><Pause className="w-3 h-3" /> Pause</> : <><Play className="w-3 h-3" /> Resume</>}
                        </button>
                        <button onClick={() => timer.reset()} className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted hover:bg-muted/80 text-muted-foreground transition-all active:scale-95">
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">Start a 25-minute focused session for this task</p>
                      <button onClick={() => timer.start(task.id)}
                        className="w-full flex items-center justify-center gap-2 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all active:scale-[0.98] shadow-sm shadow-primary/20"
                      ><Play className="w-3 h-3" /> Start Focus</button>
                    </>
                  )}
                </div>
              </div>
              {isTimerTask && rem === 0 && (
                <div className="mt-3 pt-3 border-t border-border/50 text-center">
                  <p className="text-emerald-500 font-semibold text-sm">Session complete — great work.</p>
                  <button onClick={() => timer.reset()} className="mt-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">Reset</button>
                </div>
              )}
            </div>
          </div>

          {/* ── Meta ── */}
          <div className="text-[11px] text-muted-foreground/45 space-y-0.5 pb-2">
            <p>Created {format(parseISO(task.createdAt), "MMM d, yyyy 'at' h:mm a")}</p>
            {task.updatedAt !== task.createdAt && <p>Updated {format(parseISO(task.updatedAt), "MMM d, yyyy 'at' h:mm a")}</p>}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

/* ─── Task card ──────────────────────────────────────── */
function TaskCard({ task, isSelected, onSelect, onToggle, onDelete, timer, todayStr, taskTime }: {
  task: any; isSelected: boolean; taskTime: string;
  onSelect: () => void;
  onToggle: (id: number, completed: boolean) => void;
  onDelete: (id: number) => void;
  timer: ReturnType<typeof useTaskTimer>;
  todayStr: string;
}) {
  const p = (task.priority as Priority) || "medium";
  const pc = PRIORITY_CFG[p];
  const isOverdue = !task.completed && task.dueDate && task.dueDate < todayStr;
  const isDueToday = !task.completed && task.dueDate && task.dueDate === todayStr;
  const tomorrowStr = new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split("T")[0];
  const isTomorrow = !task.completed && task.dueDate && task.dueDate === tomorrowStr;
  const isTimerActive = timer.taskId === task.id;

  const timeSuffix = taskTime ? ` · ${fmt12(taskTime)}` : "";

  const dueLabel = (() => {
    if (!task.dueDate) return null;
    if (isOverdue) return { text: `Overdue · ${format(parseISO(task.dueDate), "MMM d")}${timeSuffix}`, color: "text-rose-500" };
    if (isDueToday) return { text: `Today${timeSuffix}`, color: "text-amber-500" };
    if (isTomorrow) return { text: `Tomorrow${timeSuffix}`, color: "text-blue-400" };
    return { text: `${format(parseISO(task.dueDate), "MMM d")}${timeSuffix}`, color: "text-muted-foreground/65" };
  })();

  return (
    <div
      onClick={onSelect}
      className={`group flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all duration-150 cursor-pointer ${
        isSelected
          ? "border-primary/25 bg-primary/5"
          : isOverdue
          ? "border-rose-500/15 bg-rose-500/3 hover:border-rose-500/25"
          : "border-border bg-card hover:border-border/80 hover:bg-muted/15"
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={e => { e.stopPropagation(); onToggle(task.id, task.completed); }}
        className="shrink-0 transition-all hover:scale-110 active:scale-95"
      >
        {task.completed
          ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          : <Circle className={`w-5 h-5 ${pc.color} opacity-35 hover:opacity-100 transition-opacity`} />
        }
      </button>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] font-medium leading-snug ${task.completed ? "line-through text-muted-foreground/45" : "text-foreground"}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {dueLabel && (
            <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${dueLabel.color}`}>
              <CalendarDays className="w-3 h-3 shrink-0" />
              {dueLabel.text}
            </span>
          )}
          {p !== "medium" && !task.completed && (
            <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${pc.color} opacity-75`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${pc.dot}`} />
              {pc.label}
            </span>
          )}
          {isTimerActive && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
              <Timer className="w-3 h-3" />
              {timer.running ? "Focusing" : "Paused"}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={e => { e.stopPropagation(); onDelete(task.id); }}
          className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-all"
        ><Trash2 className="w-3.5 h-3.5" /></button>
        <ChevronRight className={`w-4 h-4 transition-all ${isSelected ? "text-primary" : "text-border group-hover:text-muted-foreground/50"}`} />
      </div>
    </div>
  );
}

/* ─── Add task form ──────────────────────────────────── */
function AddTaskForm({ onCreate }: { onCreate: (data: { title: string; priority: Priority; dueDate?: string; dueTime?: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const todayStr = new Date().toISOString().split("T")[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate({ title: title.trim(), priority, ...(dueDate ? { dueDate } : {}), ...(dueDate && dueTime ? { dueTime } : {}) });
    setTitle(""); setDueDate(""); setDueTime(""); setPriority("medium"); setOpen(false);
  };

  return (
    <div className={`rounded-xl border bg-card transition-all duration-200 ${open ? "border-primary/30 shadow-sm shadow-primary/8" : "border-border hover:border-border/60"}`}>
      <form onSubmit={handleSubmit}>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-5 h-5 rounded-full border-2 border-dashed border-muted-foreground/20 flex items-center justify-center shrink-0">
            <Plus className="w-2.5 h-2.5 text-muted-foreground/35" />
          </div>
          <input ref={inputRef} value={title} onChange={e => setTitle(e.target.value)} onFocus={() => setOpen(true)}
            placeholder="Add a task…"
            className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/35 focus:outline-none"
          />
          {title.trim() && (
            <button type="submit"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all active:scale-95 shrink-0 shadow-sm shadow-primary/15"
            ><Check className="w-3 h-3" /> Add</button>
          )}
        </div>

        {open && (
          <div className="px-4 py-2.5 border-t border-border/50 bg-muted/15 space-y-2.5">
            {/* Priority */}
            <div className="flex items-center gap-2">
              <Flag className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
              <div className="flex gap-1.5">
                {(["high", "medium", "low"] as Priority[]).map(p => {
                  const cfg = PRIORITY_CFG[p];
                  return (
                    <button key={p} type="button" onClick={() => setPriority(p)} title={cfg.label}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${priority === p ? `${cfg.ring} ${cfg.dot}` : "border-border bg-muted/50 hover:border-muted-foreground/40"}`}
                    >
                      {priority === p && <Check className="w-2.5 h-2.5 text-white" />}
                    </button>
                  );
                })}
                <span className="text-xs text-muted-foreground self-center ml-1">{PRIORITY_CFG[priority].label}</span>
              </div>
            </div>

            {/* Date + Time */}
            <div className="flex items-center gap-2 flex-wrap">
              <CalendarDays className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
              <input type="date" value={dueDate} onChange={e => { setDueDate(e.target.value); if (!e.target.value) setDueTime(""); }} min={todayStr}
                className="h-7 text-xs bg-transparent focus:outline-none text-muted-foreground w-28"
              />
              {dueDate && (
                <>
                  <Clock className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                  <input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)}
                    className="h-7 text-xs bg-transparent focus:outline-none text-muted-foreground w-20"
                  />
                </>
              )}
              <button type="button" onClick={() => { setOpen(false); setTitle(""); }} className="ml-auto text-muted-foreground/40 hover:text-foreground transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

/* ─── Filters ────────────────────────────────────────── */
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all",      label: "All" },
  { value: "today",    label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "high",     label: "Priority" },
];

/* ─── Main ───────────────────────────────────────────── */
export default function Tasks() {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const timer = useTaskTimer();
  const [timesVersion, setTimesVersion] = useState(0); // bump to refresh time display

  const apiFilter = filter === "high" ? "all" : filter;
  const { data: tasks, isLoading } = useListTasks({ filter: apiFilter as any });
  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();

  const todayStr = new Date().toISOString().split("T")[0];

  const filtered = (() => {
    if (!tasks) return [];
    if (filter === "high") return tasks.filter(t => !t.completed && t.priority === "high");
    return tasks;
  })();

  const pending = filtered.filter(t => !t.completed);
  const completed = filtered.filter(t => t.completed);
  const overdueCount = pending.filter(t => t.dueDate && t.dueDate < todayStr).length;
  const selected = tasks?.find(t => t.id === selectedId) ?? null;

  const handleCreate = (data: { title: string; priority: Priority; dueDate?: string; dueTime?: string }) => {
    const { dueTime, ...taskData } = data;
    createMutation.mutate(
      { data: taskData },
      {
        onSuccess: (newTask: any) => {
          if (dueTime && newTask?.id) saveTaskTime(newTask.id, dueTime);
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        },
      }
    );
  };

  const handleToggle = (id: number, completed: boolean) => {
    updateMutation.mutate({ id, data: { completed: !completed } }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }) });
  };
  const handleUpdate = (id: number, data: any) => {
    updateMutation.mutate({ id, data }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }) });
  };
  const handleDelete = (id: number) => {
    if (selectedId === id) setSelectedId(null);
    deleteMutation.mutate({ id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }) });
  };

  const TaskList = () => (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-5 sm:px-6 pt-6 pb-4 shrink-0">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          {timer.taskId && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-semibold mt-0.5">
              <Timer className="w-3 h-3" />
              <span className="tabular-nums">{timer.fmt(timer.getRem())}</span>
            </div>
          )}
        </div>
        <p className="text-[13px] text-muted-foreground">
          {pending.length} pending
          {overdueCount > 0 && <span className="text-rose-500 font-medium"> · {overdueCount} overdue</span>}
          {completed.length > 0 && <span className="text-muted-foreground/50"> · {completed.length} done</span>}
        </p>
        {/* Filter pills */}
        <div className="flex gap-1.5 mt-4">
          {FILTERS.map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-200 ${
                filter === f.value
                  ? f.value === "high"
                    ? "bg-rose-500 text-white shadow-sm shadow-rose-500/20"
                    : "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                  : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
              }`}
            >{f.label}</button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1 px-5 sm:px-6">
        <div className="pb-8 space-y-2">
          <AddTaskForm onCreate={handleCreate} />

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
          ) : (
            <div className="space-y-1.5 mt-1">
              {/* Pending */}
              {pending.length > 0 && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 py-1">
                    Pending · {pending.length}
                  </p>
                  {pending.map(task => (
                    <TaskCard key={`${task.id}-${timesVersion}`} task={task}
                      isSelected={selectedId === task.id}
                      onSelect={() => setSelectedId(selectedId === task.id ? null : task.id)}
                      onToggle={handleToggle} onDelete={handleDelete}
                      timer={timer} todayStr={todayStr}
                      taskTime={getTaskTime(task.id)}
                    />
                  ))}
                </>
              )}
              {/* Completed */}
              {completed.length > 0 && (
                <>
                  <div className="flex items-center gap-2 pt-3 pb-1">
                    <div className="h-px flex-1 bg-border/40" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/35 px-2">Completed · {completed.length}</span>
                    <div className="h-px flex-1 bg-border/40" />
                  </div>
                  <div className="space-y-1 opacity-55">
                    {completed.map(task => (
                      <TaskCard key={`${task.id}-${timesVersion}`} task={task}
                        isSelected={selectedId === task.id}
                        onSelect={() => setSelectedId(selectedId === task.id ? null : task.id)}
                        onToggle={handleToggle} onDelete={handleDelete}
                        timer={timer} todayStr={todayStr}
                        taskTime={getTaskTime(task.id)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );

  if (isMobile) {
    if (selected) {
      return (
        <div className="h-full bg-background">
          <TaskDetail task={selected} onClose={() => setSelectedId(null)} onUpdate={handleUpdate} onDelete={handleDelete} timer={timer} onTimeChange={() => setTimesVersion(v => v + 1)} />
        </div>
      );
    }
    return <div className="h-full bg-background"><TaskList /></div>;
  }

  return (
    <div className="h-full flex overflow-hidden bg-background">
      <div className={`transition-all duration-300 ${selected ? "w-[55%] min-w-[340px]" : "w-full"} border-r border-border overflow-hidden`}>
        <TaskList />
      </div>
      {selected && (
        <div className="flex-1 min-w-0 overflow-hidden">
          <TaskDetail task={selected} onClose={() => setSelectedId(null)} onUpdate={handleUpdate} onDelete={handleDelete} timer={timer} onTimeChange={() => setTimesVersion(v => v + 1)} />
        </div>
      )}
    </div>
  );
}
