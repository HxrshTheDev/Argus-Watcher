import { useState } from "react";
import { 
  useListTasks, 
  useCreateTask, 
  useUpdateTask, 
  useDeleteTask,
  getListTasksQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { Calendar, Plus, Trash2, MoreVertical, Flag } from "lucide-react";

export default function Tasks() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "today" | "upcoming">("all");
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const { data: tasks, isLoading } = useListTasks({ filter });
  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    createMutation.mutate(
      { data: { title: newTaskTitle, priority: "medium" } },
      {
        onSuccess: () => {
          setNewTaskTitle("");
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        }
      }
    );
  };

  const handleToggleComplete = (id: number, completed: boolean) => {
    updateMutation.mutate(
      { id, data: { completed: !completed } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        }
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        }
      }
    );
  };

  const priorityColors = {
    low: "text-blue-500",
    medium: "text-yellow-500",
    high: "text-destructive"
  };

  return (
    <div className="p-8 h-full flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground mt-1">Manage your focus and priorities.</p>
        </div>
        <Tabs value={filter} onValueChange={(v: any) => setFilter(v)} className="w-full md:w-auto">
          <TabsList className="grid w-full grid-cols-3 md:w-auto">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card className="overflow-hidden border-primary/20 shadow-sm">
        <form onSubmit={handleCreate} className="flex items-center p-2 border-b border-border bg-muted/30">
          <Plus className="w-5 h-5 ml-2 text-muted-foreground" />
          <Input
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="Add a new task..."
            className="border-0 shadow-none focus-visible:ring-0 bg-transparent h-10 text-base"
          />
          <Button type="submit" size="sm" disabled={!newTaskTitle.trim() || createMutation.isPending}>
            Add
          </Button>
        </form>

        <div className="max-h-[600px] overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading tasks...</div>
          ) : tasks?.length ? (
            <div className="divide-y divide-border">
              {tasks.map((task) => (
                <div 
                  key={task.id} 
                  className={`flex items-center justify-between p-4 group transition-colors hover:bg-muted/50 ${
                    task.completed ? "opacity-60 bg-muted/20" : ""
                  }`}
                >
                  <div className="flex items-start gap-3 overflow-hidden">
                    <Checkbox 
                      checked={task.completed} 
                      onCheckedChange={() => handleToggleComplete(task.id, task.completed)}
                      className="mt-1 w-5 h-5 rounded-full data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <div className="min-w-0">
                      <p className={`text-base font-medium truncate ${task.completed ? "line-through text-muted-foreground" : ""}`}>
                        {task.title}
                      </p>
                      {(task.dueDate || task.description) && (
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {task.dueDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {format(new Date(task.dueDate), "MMM d")}
                            </span>
                          )}
                          {task.priority && (
                            <span className={`flex items-center gap-1 ${priorityColors[task.priority]}`}>
                              <Flag className="w-3 h-3" />
                              {task.priority}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                    onClick={() => handleDelete(task.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center flex flex-col items-center justify-center text-muted-foreground">
              <CheckSquare className="w-12 h-12 mb-4 opacity-20" />
              <p>No tasks found in this view.</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
