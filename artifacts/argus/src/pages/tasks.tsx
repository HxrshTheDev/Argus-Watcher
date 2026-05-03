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
  ChevronRight, ChevronLeft, Check,
} from "lucide-react";

type Priority = "low" | "medium" | "high";
type Filter = "all" | "today" | "upcoming" | "high";

/* ─── Priority config ────────────────────────────────── */
const PRIORITY_CFG: Record<Priority, { label: string; color: string; ring: string; bg: string; dot: string }> = {
  high:   { label: "High",   color: "text-red-500",   ring: "border-red-500",   bg: "bg-red-500/10",   dot: "bg-red-500" },
  medium: { label: "Medium", color: "text-amber-500", ring: "border-amber-500", bg: "bg-amber-500/10", dot: "bg-amber-500" },
  low:    { label: "Low",    color: "text-blue-500",  ring: "border-blue-500",  bg: "bg-blue-500/10",  dot: "bg-blue-500" },
};

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

function saveTimer(s: TimerState) {
  try { localStorage.setItem(TIMER_KEY, JSON.stringify(s)); } catch {}
}

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
        if (rem <= 0) {
          const next = { ...prev, running: false, remainingSeconds: 0, startedAt: null };
          saveTimer(next); return next;
        }
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
    setSt(prev => {
      const next = { ...prev, running: true, startedAt: Date.now() };
      saveTimer(next); return next;
    });
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
  const color = pct > 0.5 ? "hsl(235 86% 65%)" : pct > 0.2 ? "hsl(38 92% 50%)" : "hsl(0 84% 60%)";

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
  const cfg = PRIORITY_CFG[value];
  return (
    <div className="flex gap-1.5">
      {(["high", "medium", "low"] as Priority[]).map(p => {
        const c = PRIORITY_CFG[p];
        const active = value === p;
        return (
          <button key={p} onClick={() => onChange(p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${active ? `${c.bg} ${c.color} border-current` : "bg-muted/40 border-border text-muted-foreground hover:border-primary/30"}`}
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
function TaskDetail({ task, onClose, onUpdate, onDelete, timer }: {
  task: any; onClose: () => void;
  onUpdate: (id: number, data: any) => void;
  onDelete: (id: number) => void;
  timer: ReturnType<typeof useTaskTimer>;
}) {
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description ?? "");
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const subtasks = useSubtasks(task.id);
  const { add: addSubtask } = subtasks;
  const [newSub, setNewSub] = useState("");
  const todayStr = new Date().toISOString().split("T")[0];

  const [rem, setRem] = useState(timer.getRem());
  useEffect(() => {
    const iv = setInterval(() => setRem(timer.getRem()), 500);
    return () => clearInterval(iv);
  }, [timer]);

  const isTimerTask = timer.taskId === task.id;
  const saveTitle = () => { if (title.trim() && title !== task.title) onUpdate(task.id, { title: title.trim() }); };
  const saveDesc = () => { if (desc !== (task.description ?? "")) onUpdate(task.id, { description: desc || null }); };
  const saveDue = (v: string) => { setDueDate(v); onUpdate(task.id, { dueDate: v || null }); };
  const savePriority = (p: Priority) => onUpdate(task.id, { priority: p });

  const handleAddSub = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSub.trim()) { addSubtask(newSub.trim()); setNewSub(""); }
  };

  return (
    <div className="flex flex-col h-full bg-background animate-in fade-in duration-200" style={{ animation: "slide-right-fade 0.2s ease-out both" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/60 bg-background/80 glass shrink-0">
        <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={e => { if (e.key === "Enter") { saveTitle(); (e.target as HTMLInputElement).blur(); } }}
            className="w-full bg-transparent text-[15px] font-black tracking-tight focus:outline-none truncate"
          />
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => { onUpdate(task.id, { completed: !task.completed }); }}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${task.completed ? "bg-emerald-500/15 text-emerald-500" : "hover:bg-muted text-muted-foreground hover:text-emerald-500"}`}
          >
            <Check className="w-4 h-4" />
          </button>
          <button onClick={() => { onDelete(task.id); onClose(); }}
            className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-5 space-y-5">
          {/* Priority & Due date */}
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Priority</p>
              <PriorityPicker value={(task.priority as Priority) || "medium"} onChange={savePriority} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Due Date</p>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <input type="date" value={dueDate} onChange={e => saveDue(e.target.value)} min={todayStr}
                    className="w-full h-9 pl-9 pr-3 rounded-xl border border-input bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-foreground"
                  />
                </div>
                {dueDate && (
                  <button onClick={() => saveDue("")} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-destructive transition-all">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Notes</p>
            <textarea
              value={desc} onChange={e => setDesc(e.target.value)} onBlur={saveDesc}
              placeholder="Add notes, links, or context…" rows={4}
              className="w-full px-3.5 py-3 rounded-xl border border-input bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none leading-relaxed placeholder:text-muted-foreground/40 transition-all"
            />
          </div>

          {/* Subtasks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Subtasks {subtasks.items.length > 0 && `· ${subtasks.doneCount}/${subtasks.items.length}`}
              </p>
            </div>
            <div className="rounded-xl border border-border overflow-hidden bg-card">
              {subtasks.items.length > 0 && (
                <div className="divide-y divide-border/40">
                  {subtasks.items.map((sub) => (
                    <div key={sub.id} className="flex items-center gap-3 px-3.5 py-2.5 group">
                      <button onClick={() => subtasks.toggle(sub.id)} className="shrink-0 transition-all hover:scale-110">
                        {sub.done
                          ? <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" />
                          : <Circle className="w-4.5 h-4.5 text-muted-foreground/40 hover:text-primary transition-colors" />
                        }
                      </button>
                      <span className={`flex-1 text-sm leading-snug ${sub.done ? "line-through text-muted-foreground/50" : ""}`}>{sub.text}</span>
                      <button onClick={() => subtasks.remove(sub.id)}
                        className="w-5 h-5 rounded-lg opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={handleAddSub} className={`flex items-center gap-2 px-3.5 py-2.5 ${subtasks.items.length > 0 ? "border-t border-border/40" : ""}`}>
                <Plus className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                <input
                  value={newSub} onChange={e => setNewSub(e.target.value)}
                  placeholder="Add a step…"
                  className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/35"
                />
                {newSub.trim() && (
                  <button type="submit" className="text-xs font-bold text-primary hover:text-primary/80 transition-colors">Add</button>
                )}
              </form>
            </div>
          </div>

          {/* Pomodoro Timer */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Focus Timer · 25 min</p>
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-5">
                {/* Ring */}
                <div className="relative shrink-0">
                  <TimerRing remaining={isTimerTask ? rem : POMODORO} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-[13px] font-black tabular-nums tracking-tight ${isTimerTask && timer.running ? "animate-pulse" : ""}`}>
                      {timer.fmt(isTimerTask ? rem : POMODORO)}
                    </span>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex-1 space-y-3">
                  {isTimerTask ? (
                    <>
                      <p className="text-xs text-muted-foreground leading-snug">
                        {timer.running ? "Timer running — stay focused" : "Timer paused"}
                      </p>
                      <div className="flex gap-2">
                        <button onClick={() => timer.running ? timer.pause() : timer.resume()}
                          className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl text-xs font-bold transition-all active:scale-95 ${timer.running ? "bg-amber-500/15 text-amber-500 hover:bg-amber-500/20" : "bg-primary/15 text-primary hover:bg-primary/20"}`}
                        >
                          {timer.running ? <><Pause className="w-3.5 h-3.5" /> Pause</> : <><Play className="w-3.5 h-3.5" /> Resume</>}
                        </button>
                        <button onClick={() => timer.reset()}
                          className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted hover:bg-muted/80 text-muted-foreground transition-all active:scale-95"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground leading-snug">Start a 25-minute focus session for this task</p>
                      <button onClick={() => timer.start(task.id)}
                        className="w-full flex items-center justify-center gap-2 h-9 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all active:scale-95 shadow-sm shadow-primary/20"
                      >
                        <Play className="w-3.5 h-3.5" /> Start Focus
                      </button>
                    </>
                  )}
                </div>
              </div>
              {isTimerTask && rem === 0 && (
                <div className="mt-3 pt-3 border-t border-border/40 text-center">
                  <p className="text-emerald-500 font-bold text-sm">🎉 Session complete! Great work.</p>
                  <button onClick={() => timer.reset()} className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors">Reset</button>
                </div>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="text-[11px] text-muted-foreground/50 space-y-0.5 pb-2">
            <p>Created {format(parseISO(task.createdAt), "MMM d, yyyy 'at' h:mm a")}</p>
            {task.updatedAt !== task.createdAt && <p>Updated {format(parseISO(task.updatedAt), "MMM d, yyyy 'at' h:mm a")}</p>}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

/* ─── Task card ──────────────────────────────────────── */
function TaskCard({ task, isSelected, onSelect, onToggle, onDelete, timer, todayStr }: {
  task: any; isSelected: boolean;
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
  const isTomorrow = !task.completed && task.dueDate && task.dueDate === new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split("T")[0];
  const isTimerActive = timer.taskId === task.id;

  const dueDateLabel = () => {
    if (!task.dueDate) return null;
    if (isOverdue) return { text: `Overdue · ${format(parseISO(task.dueDate), "MMM d")}`, color: "text-red-500" };
    if (isDueToday) return { text: "Due today", color: "text-amber-500" };
    if (isTomorrow) return { text: "Tomorrow", color: "text-blue-400" };
    return { text: format(parseISO(task.dueDate), "MMM d"), color: "text-muted-foreground/70" };
  };
  const dueLabel = dueDateLabel();

  return (
    <div
      className={`group flex items-center gap-3.5 px-4 py-3.5 rounded-2xl border transition-all duration-150 cursor-pointer ${
        isSelected
          ? "border-primary/30 bg-primary/5 shadow-sm"
          : isOverdue
          ? "border-red-500/15 bg-red-500/3 hover:bg-red-500/5"
          : "border-border bg-card hover:border-primary/20 hover:bg-muted/20"
      }`}
      onClick={onSelect}
    >
      {/* Toggle button */}
      <button
        onClick={e => { e.stopPropagation(); onToggle(task.id, task.completed); }}
        className="shrink-0 transition-all duration-200 hover:scale-110 active:scale-90"
      >
        {task.completed
          ? <CheckCircle2 className="w-[22px] h-[22px] text-emerald-500" />
          : <Circle className={`w-[22px] h-[22px] ${pc.color} opacity-40 hover:opacity-100 transition-opacity`} />
        }
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold leading-snug ${task.completed ? "line-through text-muted-foreground/50" : "text-foreground"}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-2.5 mt-0.5 flex-wrap">
          {dueLabel && (
            <span className={`text-[11px] font-semibold flex items-center gap-1 ${dueLabel.color}`}>
              <CalendarDays className="w-3 h-3" />{dueLabel.text}
            </span>
          )}
          {p !== "medium" && !task.completed && (
            <span className={`flex items-center gap-1 text-[11px] font-semibold ${pc.color} opacity-70`}>
              <span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`} />
              {pc.label}
            </span>
          )}
          {isTimerActive && (
            <span className="flex items-center gap-1 text-[11px] font-bold text-primary animate-pulse">
              <Timer className="w-3 h-3" /> Focus
            </span>
          )}
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={e => { e.stopPropagation(); onDelete(task.id); }}
          className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-xl flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <ChevronRight className={`w-4 h-4 transition-all ${isSelected ? "text-primary" : "text-muted-foreground/30 group-hover:text-muted-foreground/60"}`} />
      </div>
    </div>
  );
}

/* ─── Add task form ──────────────────────────────────── */
function AddTaskForm({ onCreate }: { onCreate: (data: { title: string; priority: Priority; dueDate?: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const todayStr = new Date().toISOString().split("T")[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate({ title: title.trim(), priority, ...(dueDate ? { dueDate } : {}) });
    setTitle(""); setDueDate(""); setPriority("medium"); setOpen(false);
  };

  return (
    <div className={`rounded-2xl border bg-card transition-all duration-200 ${open ? "border-primary/40 shadow-lg shadow-primary/6" : "border-border hover:border-primary/20"}`}>
      <form onSubmit={handleSubmit}>
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="w-[22px] h-[22px] rounded-full border-2 border-dashed border-muted-foreground/25 flex items-center justify-center shrink-0">
            <Plus className="w-3 h-3 text-muted-foreground/40" />
          </div>
          <input ref={inputRef} value={title} onChange={e => setTitle(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="Add a task…"
            className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/40 focus:outline-none font-medium"
          />
          {title.trim() && (
            <button type="submit" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all shadow-sm shadow-primary/20 active:scale-95 shrink-0">
              <Check className="w-3 h-3" /> Add
            </button>
          )}
        </div>

        {open && (
          <div className="flex items-center gap-4 px-4 py-2.5 border-t border-border/50 bg-muted/20 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Flag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              {(["high", "medium", "low"] as Priority[]).map(p => {
                const cfg = PRIORITY_CFG[p];
                return (
                  <button key={p} type="button" onClick={() => setPriority(p)}
                    className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all ${priority === p ? `${cfg.ring} ${cfg.dot}` : "border-border bg-muted hover:border-primary/30"}`}
                    title={cfg.label}
                  >
                    {priority === p && <Check className="w-2.5 h-2.5 text-white" />}
                  </button>
                );
              })}
              <span className="text-xs text-muted-foreground ml-1">{PRIORITY_CFG[priority].label}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} min={todayStr}
                className="h-7 text-xs bg-transparent focus:outline-none text-muted-foreground w-28"
              />
            </div>
            <button type="button" onClick={() => { setOpen(false); setTitle(""); }} className="ml-auto text-muted-foreground/50 hover:text-foreground transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

/* ─── Filter bar ─────────────────────────────────────── */
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

  const handleCreate = (data: { title: string; priority: Priority; dueDate?: string }) => {
    createMutation.mutate({ data }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }) });
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
        <div className="flex items-start justify-between mb-1">
          <h1 className="text-[28px] font-black tracking-tight leading-none">Tasks</h1>
          <div className="flex items-center gap-2 mt-1">
            {timer.taskId && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/12 text-primary text-[11px] font-bold animate-pulse">
                <Timer className="w-3 h-3" />
                <span className="tabular-nums">{timer.fmt(timer.getRem())}</span>
              </div>
            )}
          </div>
        </div>
        <p className="text-[13px] text-muted-foreground mt-1">
          {pending.length} pending
          {overdueCount > 0 && <span className="text-red-500 font-semibold"> · {overdueCount} overdue</span>}
          {completed.length > 0 && <span className="text-muted-foreground/50"> · {completed.length} done</span>}
        </p>

        {/* Filters */}
        <div className="flex gap-1.5 mt-4">
          {FILTERS.map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold tracking-tight transition-all duration-200 ${
                filter === f.value
                  ? f.value === "high"
                    ? "bg-red-500 text-white shadow-sm shadow-red-500/20"
                    : "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1 px-5 sm:px-6">
        <div className="pb-8 space-y-2.5">
          <AddTaskForm onCreate={handleCreate} />

          {isLoading ? (
            <div className="space-y-2 mt-2">
              {[...Array(5)].map((_, i) => <div key={i} className="h-16 rounded-2xl shimmer" style={{ animationDelay: `${i * 80}ms` }} />)}
            </div>
          ) : !filtered.length ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 flex items-center justify-center mb-5 shadow-inner">
                <CheckSquare className="w-7 h-7 text-emerald-500/70" />
              </div>
              <p className="font-bold text-sm text-foreground/50">
                {filter === "today" ? "Nothing due today" : filter === "upcoming" ? "Nothing coming up" : filter === "high" ? "No high priority tasks" : "All caught up!"}
              </p>
              <p className="text-xs mt-1 opacity-40">Use the input above to add a task</p>
            </div>
          ) : (
            <div className="space-y-1.5 mt-1">
              {/* Pending */}
              {pending.length > 0 && (
                <>
                  <div className="flex items-center gap-2 py-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Pending · {pending.length}</span>
                  </div>
                  {pending.map(task => (
                    <TaskCard key={task.id} task={task} isSelected={selectedId === task.id}
                      onSelect={() => setSelectedId(selectedId === task.id ? null : task.id)}
                      onToggle={handleToggle} onDelete={handleDelete}
                      timer={timer} todayStr={todayStr}
                    />
                  ))}
                </>
              )}

              {/* Completed */}
              {completed.length > 0 && (
                <>
                  <div className="flex items-center gap-2 pt-3 pb-1">
                    <div className="h-px flex-1 bg-border/50" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 px-2">
                      Completed · {completed.length}
                    </span>
                    <div className="h-px flex-1 bg-border/50" />
                  </div>
                  <div className="space-y-1 opacity-60">
                    {completed.map(task => (
                      <TaskCard key={task.id} task={task} isSelected={selectedId === task.id}
                        onSelect={() => setSelectedId(selectedId === task.id ? null : task.id)}
                        onToggle={handleToggle} onDelete={handleDelete}
                        timer={timer} todayStr={todayStr}
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

  /* ── Mobile: detail as full-screen overlay ── */
  if (isMobile) {
    if (selected) {
      return (
        <div className="h-full bg-background">
          <TaskDetail task={selected} onClose={() => setSelectedId(null)} onUpdate={handleUpdate} onDelete={handleDelete} timer={timer} />
        </div>
      );
    }
    return <div className="h-full bg-background"><TaskList /></div>;
  }

  /* ── Desktop: side-by-side panel ── */
  return (
    <div className="h-full flex overflow-hidden bg-background">
      <div className={`transition-all duration-300 ${selected ? "w-[55%]" : "w-full"} border-r border-border`}>
        <TaskList />
      </div>
      {selected && (
        <div className="flex-1 overflow-hidden border-l border-border/0 bg-background">
          <TaskDetail task={selected} onClose={() => setSelectedId(null)} onUpdate={handleUpdate} onDelete={handleDelete} timer={timer} />
        </div>
      )}
    </div>
  );
}
