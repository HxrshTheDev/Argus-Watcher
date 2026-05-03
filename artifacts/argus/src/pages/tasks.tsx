import { useState } from "react";
import {
  useListTasks, useCreateTask, useUpdateTask, useDeleteTask, getListTasksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, parseISO } from "date-fns";
import { Plus, Trash2, Flag, CheckSquare, CalendarDays, X, Sparkles, Circle, CheckCircle2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

type Priority = "low" | "medium" | "high";
type Filter = "all" | "today" | "upcoming";

const PRIORITY: Record<Priority, { dot: string; label: string; border: string }> = {
  high:   { dot: "bg-red-500",    label: "High",   border: "border-l-red-500/70" },
  medium: { dot: "bg-amber-400",  label: "Medium", border: "border-l-amber-400/70" },
  low:    { dot: "bg-blue-400",   label: "Low",    border: "border-l-blue-400/50" },
};

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all",      label: "All" },
  { value: "today",    label: "Today" },
  { value: "upcoming", label: "Upcoming" },
];

export default function Tasks() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("medium");
  const [newDueDate, setNewDueDate] = useState("");
  const [inputFocused, setInputFocused] = useState(false);

  const { data: tasks, isLoading } = useListTasks({ filter });
  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();
  const todayStr = new Date().toISOString().split("T")[0];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || createMutation.isPending) return;
    createMutation.mutate(
      { data: { title: newTitle.trim(), priority: newPriority, ...(newDueDate ? { dueDate: newDueDate } : {}) } },
      { onSuccess: () => { setNewTitle(""); setNewDueDate(""); setNewPriority("medium"); setInputFocused(false); queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }); } }
    );
  };

  const handleToggle = (id: number, completed: boolean) => {
    updateMutation.mutate({ id, data: { completed: !completed } }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }) });
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }) });
  };

  const pending = tasks?.filter(t => !t.completed) ?? [];
  const completed = tasks?.filter(t => t.completed) ?? [];
  const overdueCount = pending.filter(t => t.dueDate && t.dueDate < todayStr).length;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* ── Header ── */}
      <div className="px-5 sm:px-7 pt-7 pb-5">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-end justify-between mb-5">
            <div>
              <h1 className="text-[28px] font-black tracking-tight leading-none">Tasks</h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                {pending.length} pending
                {overdueCount > 0 && <span className="ml-1.5 text-destructive font-semibold">· {overdueCount} overdue</span>}
                {completed.length > 0 && <span className="ml-1.5 text-muted-foreground/60">· {completed.length} done</span>}
              </p>
            </div>
          </div>

          {/* Filter pills */}
          <div className="flex gap-1.5">
            {FILTERS.map(f => (
              <button key={f.value} onClick={() => setFilter(f.value)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold tracking-tight transition-all duration-200 ${
                  filter === f.value
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 px-5 sm:px-7">
        <div className="max-w-2xl mx-auto pb-6 space-y-3">

          {/* ── Add task card ── */}
          <div className={`rounded-2xl border bg-card transition-all duration-200 ${inputFocused ? "border-primary/40 shadow-lg shadow-primary/8" : "border-border"}`}>
            <form onSubmit={handleCreate}>
              <div className="flex items-center px-4 py-3 gap-3">
                <div className="w-5 h-5 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center shrink-0">
                  <Plus className="w-3 h-3 text-muted-foreground/40" />
                </div>
                <input
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onFocus={() => setInputFocused(true)}
                  placeholder="Add a task…"
                  className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/50 focus:outline-none font-medium"
                />
                {newTitle.trim() && (
                  <button type="submit" disabled={createMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50 hover:bg-primary/90 transition-all shadow-sm shadow-primary/20 active:scale-95 shrink-0"
                  >
                    <Sparkles className="w-3 h-3" /> Add
                  </button>
                )}
              </div>

              {inputFocused && (
                <div className="flex items-center gap-3 px-4 py-2.5 border-t border-border/60 bg-muted/20">
                  <Flag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <Select value={newPriority} onValueChange={v => setNewPriority(v as Priority)}>
                    <SelectTrigger className="h-7 text-xs border-0 bg-transparent shadow-none w-24 px-0 focus:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <input
                      type="date"
                      value={newDueDate}
                      onChange={e => setNewDueDate(e.target.value)}
                      min={todayStr}
                      className="h-7 text-xs bg-transparent focus:outline-none w-32 text-muted-foreground"
                    />
                  </div>

                  <button type="button" onClick={() => setInputFocused(false)} className="ml-auto text-muted-foreground/60 hover:text-foreground transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </form>
          </div>

          {/* ── Task list ── */}
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <div key={i} className="h-16 rounded-2xl shimmer" style={{ animationDelay: `${i * 80}ms` }} />)}
            </div>
          ) : !tasks?.length ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 flex items-center justify-center mb-5">
                <CheckSquare className="w-7 h-7 text-emerald-500 opacity-70" />
              </div>
              <p className="font-bold text-sm text-foreground/50">
                {filter === "today" ? "Nothing due today" : filter === "upcoming" ? "Nothing coming up" : "No tasks yet"}
              </p>
              <p className="text-xs mt-1 opacity-50">Tap the input above to add your first task</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {/* Pending */}
              {pending.map((task) => {
                const isOverdue = task.dueDate && task.dueDate < todayStr;
                const isDueToday = task.dueDate && task.dueDate === todayStr;
                const p = (task.priority as Priority) || "medium";
                const pc = PRIORITY[p];

                return (
                  <div key={task.id}
                    className={`group flex items-center gap-3 px-4 py-3.5 rounded-2xl border bg-card border-l-2 hover:border-primary/20 hover:bg-muted/20 transition-all duration-150 ${isOverdue ? "border-l-destructive/60 border-destructive/15" : pc.border} border-border`}
                  >
                    <button
                      onClick={() => handleToggle(task.id, task.completed)}
                      className="shrink-0 transition-all duration-200 hover:scale-110 active:scale-95"
                    >
                      <Circle className="w-5 h-5 text-muted-foreground/30 hover:text-emerald-500 transition-colors" />
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-snug truncate">{task.title}</p>
                      <div className="flex items-center gap-2.5 mt-0.5 flex-wrap">
                        {task.dueDate && (
                          <span className={`text-[11px] font-semibold flex items-center gap-1 ${isOverdue ? "text-destructive" : isDueToday ? "text-amber-400" : "text-muted-foreground"}`}>
                            <CalendarDays className="w-3 h-3" />
                            {isOverdue ? `Overdue · ${format(parseISO(task.dueDate), "MMM d")}` : isDueToday ? "Due today" : format(parseISO(task.dueDate), "MMM d")}
                          </span>
                        )}
                        {p !== "medium" && (
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground/70">
                            <span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`} />
                            {pc.label}
                          </span>
                        )}
                      </div>
                    </div>

                    <button onClick={() => handleDelete(task.id)}
                      className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-xl flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-150 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}

              {/* Completed section */}
              {completed.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 pt-3 pb-2">
                    <div className="h-px flex-1 bg-border/60" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-2">
                      Completed · {completed.length}
                    </span>
                    <div className="h-px flex-1 bg-border/60" />
                  </div>
                  <div className="space-y-1">
                    {completed.map(task => (
                      <div key={task.id}
                        className="group flex items-center gap-3 px-4 py-3 rounded-2xl border border-border/40 bg-muted/10 opacity-50 hover:opacity-70 transition-all"
                      >
                        <button onClick={() => handleToggle(task.id, task.completed)} className="shrink-0 transition-all hover:scale-110">
                          <CheckCircle2 className="w-5 h-5 text-emerald-500/60" />
                        </button>
                        <p className="text-sm line-through text-muted-foreground flex-1 truncate">{task.title}</p>
                        <button onClick={() => handleDelete(task.id)}
                          className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-xl flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
