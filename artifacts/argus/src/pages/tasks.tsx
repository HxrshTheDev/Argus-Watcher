import { useState } from "react";
import { 
  useListTasks, 
  useCreateTask, 
  useUpdateTask, 
  useDeleteTask,
  getListTasksQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, isToday, isPast, parseISO } from "date-fns";
import { Calendar, Plus, Trash2, Flag, CheckSquare, CalendarDays, ChevronDown, X } from "lucide-react";

type Priority = "low" | "medium" | "high";
type Filter = "all" | "today" | "upcoming";

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; badge: string }> = {
  low:    { label: "Low",    color: "text-blue-400",   badge: "bg-blue-400/10 text-blue-400 border-blue-400/20" },
  medium: { label: "Medium", color: "text-yellow-400", badge: "bg-yellow-400/10 text-yellow-400 border-yellow-400/20" },
  high:   { label: "High",   color: "text-red-400",    badge: "bg-red-400/10 text-red-400 border-red-400/20" },
};

export default function Tasks() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("medium");
  const [newDueDate, setNewDueDate] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { data: tasks, isLoading } = useListTasks({ filter });
  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createMutation.mutate(
      { data: { title: newTitle.trim(), priority: newPriority, ...(newDueDate ? { dueDate: newDueDate } : {}) } },
      {
        onSuccess: () => {
          setNewTitle("");
          setNewDueDate("");
          setNewPriority("medium");
          setShowAdvanced(false);
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        }
      }
    );
  };

  const handleToggle = (id: number, completed: boolean) => {
    updateMutation.mutate(
      { id, data: { completed: !completed } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }) }
    );
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(
      { id },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }) }
    );
  };

  const todayStr = new Date().toISOString().split("T")[0];

  const pendingTasks = tasks?.filter(t => !t.completed) ?? [];
  const completedTasks = tasks?.filter(t => t.completed) ?? [];
  const overdueCount = pendingTasks.filter(t => t.dueDate && t.dueDate < todayStr).length;

  return (
    <div className="p-8 h-full flex flex-col gap-5 max-w-3xl mx-auto w-full overflow-y-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
            {overdueCount > 0 && (
              <Badge variant="destructive" className="text-xs">{overdueCount} overdue</Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            {pendingTasks.length} pending · {completedTasks.length} completed
          </p>
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Add Task Form */}
      <Card className="overflow-hidden border-primary/20 shadow-sm">
        <form onSubmit={handleCreate}>
          <div className="flex items-center px-3 py-2 border-b border-border bg-card">
            <Plus className="w-4 h-4 text-muted-foreground mr-2 shrink-0" />
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Add a new task..."
              className="border-0 shadow-none focus-visible:ring-0 bg-transparent h-9 text-sm flex-1"
              onFocus={() => setShowAdvanced(true)}
            />
            <Button type="submit" size="sm" className="h-7 text-xs px-3 shrink-0" disabled={!newTitle.trim() || createMutation.isPending}>
              Add
            </Button>
          </div>

          {showAdvanced && (
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border flex-wrap">
              <div className="flex items-center gap-1">
                <Flag className="w-3.5 h-3.5 text-muted-foreground" />
                <Select value={newPriority} onValueChange={(v) => setNewPriority(v as Priority)}>
                  <SelectTrigger className="h-7 text-xs border-0 bg-transparent shadow-none w-24 px-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="h-7 text-xs border-0 bg-transparent shadow-none w-36 px-1 focus-visible:ring-0"
                  min={todayStr}
                />
              </div>
              <button
                type="button"
                onClick={() => setShowAdvanced(false)}
                className="ml-auto text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </form>

        <div>
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading tasks...</div>
          ) : tasks?.length ? (
            <div className="divide-y divide-border">
              {/* Pending tasks */}
              {pendingTasks.map((task) => {
                const isOverdue = task.dueDate && task.dueDate < todayStr;
                const isDueToday = task.dueDate && task.dueDate === todayStr;
                return (
                  <div
                    key={task.id}
                    className="flex items-center justify-between px-4 py-3 group hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 overflow-hidden min-w-0">
                      <Checkbox
                        checked={task.completed}
                        onCheckedChange={() => handleToggle(task.id, task.completed)}
                        className="w-4 h-4 rounded-full shrink-0 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {task.dueDate && (
                            <span className={`flex items-center gap-1 text-[11px] ${
                              isOverdue ? "text-destructive font-medium" : isDueToday ? "text-yellow-400" : "text-muted-foreground"
                            }`}>
                              <Calendar className="w-3 h-3" />
                              {isOverdue ? `Overdue · ${format(parseISO(task.dueDate), "MMM d")}` 
                                : isDueToday ? "Due today"
                                : format(parseISO(task.dueDate), "MMM d")}
                            </span>
                          )}
                          {task.priority && task.priority !== "medium" && (
                            <span className={`text-[11px] font-medium ${PRIORITY_CONFIG[task.priority as Priority]?.color}`}>
                              {PRIORITY_CONFIG[task.priority as Priority]?.label}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 h-7 w-7 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
                      onClick={() => handleDelete(task.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                );
              })}

              {/* Completed tasks */}
              {completedTasks.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-muted/20">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                      Completed · {completedTasks.length}
                    </span>
                  </div>
                  {completedTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between px-4 py-3 group hover:bg-muted/30 transition-colors opacity-50"
                    >
                      <div className="flex items-center gap-3 overflow-hidden min-w-0">
                        <Checkbox
                          checked
                          onCheckedChange={() => handleToggle(task.id, task.completed)}
                          className="w-4 h-4 rounded-full shrink-0 data-[state=checked]:bg-muted-foreground data-[state=checked]:border-muted-foreground"
                        />
                        <p className="text-sm line-through truncate text-muted-foreground">{task.title}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 h-7 w-7 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
                        onClick={() => handleDelete(task.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : (
            <div className="p-12 text-center flex flex-col items-center text-muted-foreground">
              <CheckSquare className="w-10 h-10 mb-3 opacity-20" />
              <p className="font-medium">
                {filter === "today" ? "Nothing due today" : filter === "upcoming" ? "Nothing coming up" : "No tasks yet"}
              </p>
              <p className="text-sm mt-1 opacity-70">Click the input above and start adding your tasks.</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
