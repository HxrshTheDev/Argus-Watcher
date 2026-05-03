import { useState, useEffect, useRef } from "react";
import { useListTasks, useCreateTask, getListTasksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import {
  Plus, Check, X, Target, CalendarCheck, Flame, Repeat2,
  CheckCircle2, Circle, ChevronDown, Pencil, Trash2,
} from "lucide-react";

/* ══════════════════════════════════════════════════════════
   LOCAL STORAGE HELPERS
   ══════════════════════════════════════════════════════════ */
function ls<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function lsSet(key: string, val: unknown) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

/* ══════════════════════════════════════════════════════════
   TYPES
   ══════════════════════════════════════════════════════════ */
interface Goal { id: string; text: string; }
interface FocusItem { id: string; text: string; done: boolean; }
interface Habit {
  id: string;
  name: string;
  emoji: string;
  frequency: "daily" | "weekdays" | "weekly";
  completions: Record<string, boolean>; // YYYY-MM-DD → true
}

/* ══════════════════════════════════════════════════════════
   KEYS
   ══════════════════════════════════════════════════════════ */
const GOALS_KEY = "argus_goals";
const HABITS_KEY = "argus_habits_v2";
const focusKey = (d: string) => `argus_focus_${d}`;

/* ══════════════════════════════════════════════════════════
   LIVE CLOCK
   ══════════════════════════════════════════════════════════ */
function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const iv = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(iv); }, []);
  return now;
}

function FlipDigit({ val }: { val: string }) {
  return (
    <div className="flex flex-col items-center justify-center w-14 h-16 rounded-xl bg-card border border-border shadow-md">
      <span className="text-3xl font-black tabular-nums tracking-tight leading-none text-foreground">{val}</span>
    </div>
  );
}

function LiveClock() {
  const now = useClock();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const ampm = now.getHours() >= 12 ? "PM" : "AM";
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Live Clock</p>
      <div className="flex items-center gap-1.5">
        <FlipDigit val={hh} />
        <span className="text-2xl font-black text-muted-foreground/50 pb-0.5">:</span>
        <FlipDigit val={mm} />
        <span className="text-2xl font-black text-muted-foreground/50 pb-0.5">:</span>
        <FlipDigit val={ss} />
        <span className="ml-1 text-sm font-bold text-muted-foreground self-end pb-1">{ampm}</span>
      </div>
      <p className="text-xs text-muted-foreground/60">{format(now, "EEEE, MMMM d, yyyy")}</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TODAY'S FOCUS
   ══════════════════════════════════════════════════════════ */
function TodaysFocus() {
  const todayKey = focusKey(new Date().toISOString().split("T")[0]);
  const [items, setItems] = useState<FocusItem[]>(() => ls(todayKey, []));
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const save = (next: FocusItem[]) => { setItems(next); lsSet(todayKey, next); };
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    save([...items, { id: crypto.randomUUID(), text: input.trim(), done: false }]);
    setInput("");
    inputRef.current?.focus();
  };
  const toggle = (id: string) => save(items.map(f => f.id === id ? { ...f, done: !f.done } : f));
  const remove = (id: string) => save(items.filter(f => f.id !== id));

  const doneCount = items.filter(f => f.done).length;

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Today's Focus</p>
        {items.length > 0 && (
          <span className="text-[10px] font-semibold text-muted-foreground/60">{doneCount}/{items.length}</span>
        )}
      </div>

      <div className="flex-1 space-y-1 min-h-0">
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground/40 italic py-1">What are you focusing on today?</p>
        )}
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-2.5 group">
            <button onClick={() => toggle(item.id)} className="shrink-0 hover:scale-110 transition-transform">
              {item.done
                ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                : <Circle className="w-4 h-4 text-muted-foreground/30 hover:text-primary transition-colors" />
              }
            </button>
            <span className={`flex-1 text-sm leading-snug ${item.done ? "line-through text-muted-foreground/40" : ""}`}>{item.text}</span>
            <button onClick={() => remove(item.id)}
              className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-muted-foreground/40 hover:text-destructive transition-all"
            ><X className="w-3 h-3" /></button>
          </div>
        ))}
      </div>

      <form onSubmit={add} className="flex items-center gap-2 pt-1 border-t border-border/40">
        <Plus className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
        <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
          placeholder="Add focus item…"
          className="flex-1 text-xs bg-transparent focus:outline-none placeholder:text-muted-foreground/30"
        />
        {input.trim() && (
          <button type="submit" className="text-[11px] font-semibold text-primary">Add</button>
        )}
      </form>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   GOALS / MISSION
   ══════════════════════════════════════════════════════════ */
function MissionSection() {
  const [goals, setGoals] = useState<Goal[]>(() => ls(GOALS_KEY, []));
  const [input, setInput] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const save = (next: Goal[]) => { setGoals(next); lsSet(GOALS_KEY, next); };
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    save([...goals, { id: crypto.randomUUID(), text: input.trim() }]);
    setInput("");
  };
  const remove = (id: string) => save(goals.filter(g => g.id !== id));
  const startEdit = (g: Goal) => { setEditing(g.id); setEditText(g.text); };
  const commitEdit = () => {
    if (editing) { save(goals.map(g => g.id === editing ? { ...g, text: editText.trim() || g.text } : g)); }
    setEditing(null);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-4 h-4 text-primary" />
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">The Mission</h2>
      </div>

      {goals.length === 0 ? (
        <p className="text-xs text-muted-foreground/40 italic mb-3">Define what matters — add your goals below</p>
      ) : (
        <div className="flex flex-wrap gap-2 mb-3">
          {goals.map(g => (
            <div key={g.id} className="group flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/30 hover:border-primary/25 transition-all">
              {editing === g.id ? (
                <input value={editText} onChange={e => setEditText(e.target.value)}
                  onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(null); }}
                  autoFocus
                  className="text-xs bg-transparent focus:outline-none min-w-[80px]"
                />
              ) : (
                <span className="text-xs font-medium">{g.text}</span>
              )}
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => startEdit(g)} className="w-4 h-4 flex items-center justify-center text-muted-foreground/50 hover:text-primary">
                  <Pencil className="w-2.5 h-2.5" />
                </button>
                <button onClick={() => remove(g.id)} className="w-4 h-4 flex items-center justify-center text-muted-foreground/50 hover:text-destructive">
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={add} className="flex items-center gap-2">
        <input value={input} onChange={e => setInput(e.target.value)}
          placeholder="Add a mission goal…"
          className="flex-1 h-8 px-3 rounded-lg border border-border bg-muted/20 text-xs focus:outline-none focus:ring-2 focus:ring-primary/25 placeholder:text-muted-foreground/35 transition-all"
        />
        {input.trim() && (
          <button type="submit" className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all active:scale-95">
            Add
          </button>
        )}
      </form>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   HABITS
   ══════════════════════════════════════════════════════════ */
const HABIT_EMOJIS = ["🏃", "📚", "💧", "🧘", "💪", "🎯", "🛌", "🥗", "✍️", "🌿"];
const FREQ_LABELS: Record<Habit["frequency"], string> = { daily: "Daily", weekdays: "Weekdays", weekly: "Weekly" };

function getDates(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (n - 1 - i));
    return d.toISOString().split("T")[0];
  });
}

function habitShouldRunOn(habit: Habit, dateStr: string): boolean {
  if (habit.frequency === "daily") return true;
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  if (habit.frequency === "weekdays") return day >= 1 && day <= 5;
  if (habit.frequency === "weekly") return day === 1;
  return true;
}

function getStreak(habit: Habit): number {
  let streak = 0;
  const today = new Date().toISOString().split("T")[0];
  let cursor = new Date();
  for (let i = 0; i < 365; i++) {
    const d = cursor.toISOString().split("T")[0];
    if (!habitShouldRunOn(habit, d)) { cursor.setDate(cursor.getDate() - 1); continue; }
    if (d === today && !habit.completions[d]) { cursor.setDate(cursor.getDate() - 1); continue; }
    if (habit.completions[d]) { streak++; cursor.setDate(cursor.getDate() - 1); }
    else break;
  }
  return streak;
}

function HabitsSection() {
  const [habits, setHabits] = useState<Habit[]>(() => ls(HABITS_KEY, []));
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("🏃");
  const [newFreq, setNewFreq] = useState<Habit["frequency"]>("daily");
  const today = new Date().toISOString().split("T")[0];
  const days = getDates(7);

  const save = (next: Habit[]) => { setHabits(next); lsSet(HABITS_KEY, next); };

  const toggle = (habitId: string, date: string) => {
    save(habits.map(h => {
      if (h.id !== habitId) return h;
      const c = { ...h.completions };
      if (c[date]) { delete c[date]; } else { c[date] = true; }
      return { ...h, completions: c };
    }));
  };

  const addHabit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    save([...habits, { id: crypto.randomUUID(), name: newName.trim(), emoji: newEmoji, frequency: newFreq, completions: {} }]);
    setNewName(""); setNewEmoji("🏃"); setNewFreq("daily"); setAdding(false);
  };

  const remove = (id: string) => save(habits.filter(h => h.id !== id));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Repeat2 className="w-4 h-4 text-emerald-500" />
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Habits</h2>
        </div>
        <button onClick={() => setAdding(a => !a)}
          className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          <Plus className="w-3 h-3" /> New habit
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <form onSubmit={addHabit} className="mb-3 p-3 rounded-xl border border-primary/20 bg-primary/4 space-y-2.5" style={{ animation: "slide-down-fade 0.15s ease-out both" }}>
          <div className="flex items-center gap-2">
            {/* Emoji picker */}
            <div className="relative group/emoji">
              <button type="button" className="w-9 h-9 rounded-lg border border-border bg-muted flex items-center justify-center text-lg hover:border-primary/30 transition-all">
                {newEmoji}
              </button>
              <div className="absolute top-full left-0 mt-1 z-20 flex flex-wrap gap-1 p-2 rounded-xl border border-border bg-popover shadow-xl w-52 opacity-0 pointer-events-none group-hover/emoji:opacity-100 group-hover/emoji:pointer-events-auto transition-all">
                {HABIT_EMOJIS.map(e => (
                  <button key={e} type="button" onClick={() => setNewEmoji(e)} className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all hover:bg-muted ${newEmoji === e ? "bg-primary/10" : ""}`}>{e}</button>
                ))}
              </div>
            </div>
            <input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Habit name…" autoFocus
              className="flex-1 h-9 px-3 rounded-lg border border-border bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 placeholder:text-muted-foreground/35 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <select value={newFreq} onChange={e => setNewFreq(e.target.value as Habit["frequency"])}
              className="h-8 px-2 rounded-lg border border-border bg-muted/30 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 flex-1"
            >
              <option value="daily">Daily</option>
              <option value="weekdays">Weekdays only</option>
              <option value="weekly">Weekly (Mon)</option>
            </select>
            <button type="submit" className="h-8 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all active:scale-95">
              Create
            </button>
            <button type="button" onClick={() => setAdding(false)} className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Column headers */}
      {habits.length > 0 && (
        <div className="flex items-center gap-2 mb-1 px-0.5">
          <div className="flex-1" />
          <div className="flex gap-1">
            {days.map(d => {
              const isToday = d === today;
              const label = new Date(d + "T12:00:00").toLocaleDateString("en", { weekday: "short" }).slice(0, 1);
              return (
                <div key={d} className={`w-7 text-center text-[10px] font-bold ${isToday ? "text-primary" : "text-muted-foreground/40"}`}>
                  {label}
                </div>
              );
            })}
          </div>
          <div className="w-14 text-right text-[10px] font-bold text-muted-foreground/40 pr-1">Streak</div>
        </div>
      )}

      {/* Habit rows */}
      <div className="space-y-1">
        {habits.length === 0 && (
          <div className="text-xs text-muted-foreground/40 italic py-4 text-center">
            No habits yet — click "New habit" to start tracking
          </div>
        )}
        {habits.map(habit => {
          const streak = getStreak(habit);
          return (
            <div key={habit.id} className="group flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-muted/30 transition-colors">
              <span className="text-base shrink-0">{habit.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium leading-tight truncate">{habit.name}</p>
                <p className="text-[10px] text-muted-foreground/50">{FREQ_LABELS[habit.frequency]}</p>
              </div>
              {/* Day dots */}
              <div className="flex gap-1 shrink-0">
                {days.map(d => {
                  const applicable = habitShouldRunOn(habit, d);
                  const done = !!habit.completions[d];
                  const isToday = d === today;
                  return (
                    <button key={d} onClick={() => applicable && toggle(habit.id, d)}
                      disabled={!applicable}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                        !applicable ? "opacity-20 cursor-default" :
                        done ? "bg-emerald-500 shadow-sm shadow-emerald-500/25 hover:bg-emerald-400 active:scale-95" :
                        isToday ? "border-2 border-border hover:border-primary/40 hover:bg-muted/50 active:scale-95" :
                        "border border-border/50 opacity-50"
                      }`}
                      title={d}
                    >
                      {done && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  );
                })}
              </div>
              {/* Streak */}
              <div className="w-14 flex items-center justify-end gap-1 shrink-0">
                {streak > 0 && <Flame className="w-3 h-3 text-orange-400" />}
                <span className={`text-xs font-bold tabular-nums ${streak > 0 ? "text-orange-400" : "text-muted-foreground/30"}`}>
                  {streak > 0 ? streak : "—"}
                </span>
                <button onClick={() => remove(habit.id)}
                  className="opacity-0 group-hover:opacity-100 ml-1 w-4 h-4 flex items-center justify-center text-muted-foreground/40 hover:text-destructive transition-all"
                ><X className="w-3 h-3" /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TODAY'S TASKS (from API)
   ══════════════════════════════════════════════════════════ */
function TodaysTasks() {
  const queryClient = useQueryClient();
  const { data: allTasks, isLoading } = useListTasks({ filter: "today" });
  const { mutate: createTask } = useCreateTask();
  const [input, setInput] = useState("");

  const tasks = allTasks ?? [];
  const pending = tasks.filter(t => !t.completed);
  const done = tasks.filter(t => t.completed);
  const todayStr = new Date().toISOString().split("T")[0];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    createTask(
      { data: { title: input.trim(), priority: "medium", dueDate: todayStr } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }) }
    );
    setInput("");
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <CalendarCheck className="w-4 h-4 text-primary" />
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Plan Today</h2>
        {pending.length > 0 && (
          <span className="ml-auto text-[10px] font-semibold text-muted-foreground/50">{done.length}/{tasks.length} done</span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-9 rounded-lg shimmer" />)}</div>
      ) : (
        <div className="space-y-1 mb-3">
          {pending.length === 0 && done.length === 0 && (
            <p className="text-xs text-muted-foreground/40 italic py-2">No tasks scheduled for today</p>
          )}
          {pending.map(task => (
            <TodayTaskRow key={task.id} task={task} />
          ))}
          {done.length > 0 && (
            <div className="pt-1 space-y-0.5 opacity-50">
              {done.map(task => <TodayTaskRow key={task.id} task={task} />)}
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleCreate} className="flex items-center gap-2 border-t border-border/40 pt-2">
        <Plus className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
        <input value={input} onChange={e => setInput(e.target.value)}
          placeholder="Add task for today…"
          className="flex-1 text-xs bg-transparent focus:outline-none placeholder:text-muted-foreground/30"
        />
        {input.trim() && <button type="submit" className="text-[11px] font-semibold text-primary">Add</button>}
      </form>
    </div>
  );
}

function TodayTaskRow({ task }: { task: any }) {
  const queryClient = useQueryClient();
  const toggle = async () => {
    const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
    await fetch(`${BASE}/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !task.completed }),
    });
    queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
  };

  const priorityDot: Record<string, string> = {
    high: "bg-rose-500", medium: "bg-amber-500", low: "bg-blue-400",
  };

  return (
    <div className="flex items-center gap-2.5 group px-1 py-1.5 rounded-lg hover:bg-muted/30 transition-colors">
      <button onClick={toggle} className="shrink-0 hover:scale-110 transition-transform">
        {task.completed
          ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          : <Circle className="w-4 h-4 text-muted-foreground/30 hover:text-primary transition-colors" />
        }
      </button>
      <span className={`flex-1 text-[13px] leading-snug ${task.completed ? "line-through text-muted-foreground/40" : ""}`}>
        {task.title}
      </span>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot[task.priority] ?? "bg-muted"}`} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN TRACKER PAGE
   ══════════════════════════════════════════════════════════ */
export default function Tracker() {
  const now = useClock();
  const greeting = (() => {
    const h = now.getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <ScrollArea className="h-full">
      <div className="pb-12">

        {/* ── Hero Banner ─────────────────────────────────── */}
        <div className="relative w-full h-44 overflow-hidden">
          <img
            src="/tracker-banner.jpg"
            alt="Tracker banner"
            className="w-full h-full object-cover object-center"
            style={{ imageRendering: "pixelated" }}
          />
          {/* Gradient overlay bottom */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-background" />
          {/* Gradient overlay sides */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent" />
        </div>

        {/* ── Header ──────────────────────────────────────── */}
        <div className="px-6 -mt-2 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-3xl -mt-1 shrink-0">📋</span>
            <div>
              <h1 className="text-2xl font-black tracking-tight leading-tight">Habit &amp; Goal Tracker</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {greeting} · {format(now, "EEEE, MMMM d")}
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 space-y-6">

          {/* ── Clock + Today's Focus ─────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Clock card */}
            <div className="surface p-5">
              <LiveClock />
            </div>
            {/* Today's focus card */}
            <div className="surface p-5">
              <TodaysFocus />
            </div>
          </div>

          {/* ── The Mission ──────────────────────────────── */}
          <div className="surface p-5">
            <MissionSection />
          </div>

          {/* ── Plan Today + Habits ───────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="surface p-5">
              <TodaysTasks />
            </div>
            <div className="surface p-5">
              <HabitsSection />
            </div>
          </div>

          {/* ── Quick Actions ─────────────────────────────── */}
          <div className="surface p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Quick Actions</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Go to Tasks", href: "/tasks", emoji: "✅", color: "bg-emerald-500/8 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/14" },
                { label: "New Chat", href: "/chat", emoji: "💬", color: "bg-violet-500/8 text-violet-600 border-violet-500/20 hover:bg-violet-500/14" },
                { label: "Research", href: "/research", emoji: "🔬", color: "bg-orange-500/8 text-orange-600 border-orange-500/20 hover:bg-orange-500/14" },
                { label: "Write Post", href: "/posts", emoji: "✍️", color: "bg-pink-500/8 text-pink-600 border-pink-500/20 hover:bg-pink-500/14" },
              ].map(a => (
                <a key={a.href} href={a.href}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all active:scale-95 ${a.color}`}
                >
                  <span className="text-base">{a.emoji}</span>
                  {a.label}
                </a>
              ))}
            </div>
          </div>

        </div>
      </div>
    </ScrollArea>
  );
}
