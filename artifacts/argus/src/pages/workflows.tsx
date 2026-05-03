import { useState } from "react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { formatDistanceToNow } from "date-fns";
import {
  Zap, Plus, Play, Trash2, CheckCircle2, AlertCircle,
  Clock, X, Loader2, Sun, ClipboardList, Search,
  Share2, Bot, Sparkles, ChevronRight,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ─── Types ──────────────────────────────────────────────── */
interface Workflow {
  id: number;
  name: string;
  description?: string | null;
  trigger: string;
  steps: string;
  enabled: boolean;
  lastRunAt?: string | null;
  lastRunStatus?: string | null;
  createdAt: string;
}

interface RunResult {
  success: boolean;
  output: string;
  stepsExecuted: number;
  error?: string | null;
}

/* ─── Workflow templates ─────────────────────────────────── */
const TEMPLATES = [
  {
    id: "briefing",
    icon: Sun,
    color: "bg-yellow-500",
    name: "Daily Briefing",
    description: "Generate your AI morning briefing from overdue and today's tasks.",
    trigger: "manual",
    steps: JSON.stringify([{ action: "generate_briefing" }]),
    defaultTrigger: "daily:09:00",
  },
  {
    id: "digest",
    icon: ClipboardList,
    color: "bg-blue-500",
    name: "Task Digest",
    description: "Summarise all pending and overdue tasks into a clear report.",
    trigger: "manual",
    steps: JSON.stringify([{ action: "task_digest" }]),
    defaultTrigger: "manual",
  },
  {
    id: "research",
    icon: Search,
    color: "bg-orange-500",
    name: "Research Topic",
    description: "Search the web and save a research note on any topic.",
    trigger: "manual",
    steps: JSON.stringify([{ action: "research", params: { query: "latest AI news" } }]),
    defaultTrigger: "manual",
  },
  {
    id: "post",
    icon: Share2,
    color: "bg-pink-500",
    name: "Generate Post",
    description: "Auto-write a LinkedIn or Twitter post on a topic and save it.",
    trigger: "manual",
    steps: JSON.stringify([{ action: "generate_post", params: { topic: "productivity tips", platform: "LinkedIn", tone: "professional" } }]),
    defaultTrigger: "manual",
  },
  {
    id: "custom",
    icon: Bot,
    color: "bg-violet-500",
    name: "Custom AI Task",
    description: "Give Argus a free-form instruction and it will execute it.",
    trigger: "manual",
    steps: JSON.stringify([{ action: "custom_ai", params: { prompt: "Summarise the key trends in AI this week." } }]),
    defaultTrigger: "manual",
  },
];

const TRIGGER_OPTIONS = [
  { value: "manual", label: "Manual — run on demand" },
  { value: "daily:07:00", label: "Every day at 7:00 AM" },
  { value: "daily:09:00", label: "Every day at 9:00 AM" },
  { value: "daily:18:00", label: "Every day at 6:00 PM" },
  { value: "weekly:monday", label: "Every Monday" },
];

const WORKFLOW_ICON_MAP: Record<string, React.ElementType> = {
  generate_briefing: Sun,
  task_digest: ClipboardList,
  research: Search,
  generate_post: Share2,
  custom_ai: Bot,
};

function getWorkflowIcon(steps: string): React.ElementType {
  try {
    const parsed = JSON.parse(steps);
    const first = parsed[0]?.action;
    return WORKFLOW_ICON_MAP[first] ?? Zap;
  } catch { return Zap; }
}

const ICON_COLORS: Record<string, string> = {
  generate_briefing: "bg-yellow-500",
  task_digest: "bg-blue-500",
  research: "bg-orange-500",
  generate_post: "bg-pink-500",
  custom_ai: "bg-violet-500",
};

function getIconColor(steps: string): string {
  try {
    const parsed = JSON.parse(steps);
    return ICON_COLORS[parsed[0]?.action] ?? "bg-primary";
  } catch { return "bg-primary"; }
}

/* ─── API hooks ──────────────────────────────────────────── */
function useWorkflows() {
  return useQuery<Workflow[]>({
    queryKey: ["workflows"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/workflows`);
      return r.json();
    },
    refetchInterval: 30_000,
  });
}

function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation<Workflow, Error, { name: string; description: string; trigger: string; steps: string }>({
    mutationFn: async (data) => {
      const r = await fetch(`${BASE}/api/workflows`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflows"] }),
  });
}

function useToggleWorkflow() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: number; enabled: boolean }>({
    mutationFn: async ({ id, enabled }) => {
      await fetch(`${BASE}/api/workflows/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflows"] }),
  });
}

function useDeleteWorkflow() {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => { await fetch(`${BASE}/api/workflows/${id}`, { method: "DELETE" }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflows"] }),
  });
}

function useRunWorkflow() {
  const qc = useQueryClient();
  return useMutation<RunResult, Error, number>({
    mutationFn: async (id) => {
      const r = await fetch(`${BASE}/api/workflows/${id}/run`, { method: "POST" });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflows"] }),
  });
}

/* ─── Create sheet ────────────────────────────────────────── */
function CreateSheet({ onClose, onCreate }: { onClose: () => void; onCreate: (data: any) => void }) {
  const [step, setStep] = useState<"template" | "configure">("template");
  const [selected, setSelected] = useState<typeof TEMPLATES[0] | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState("manual");
  const [steps, setSteps] = useState("[]");
  const [isPending, setIsPending] = useState(false);

  const pickTemplate = (t: typeof TEMPLATES[0]) => {
    setSelected(t);
    setName(t.name);
    setDescription(t.description);
    setTrigger(t.defaultTrigger);
    setSteps(t.steps);
    setStep("configure");
  };

  const handleCreate = async () => {
    setIsPending(true);
    await onCreate({ name, description, trigger, steps });
    setIsPending(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card border border-border rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 md:slide-in-from-bottom-0 fade-in duration-300 mx-0 md:mx-4">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          {step === "configure" && selected ? (
            <button onClick={() => setStep("template")} className="text-primary text-sm font-medium">← Back</button>
          ) : <div />}
          <h2 className="font-bold text-base">{step === "template" ? "Choose a Template" : "Configure Workflow"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <ScrollArea className="max-h-[70vh]">
          {step === "template" ? (
            <div className="p-4 space-y-2">
              {TEMPLATES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => pickTemplate(t)}
                    className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl border border-border hover:border-primary/40 hover:bg-muted/40 transition-all group text-left"
                  >
                    <div className={`w-10 h-10 rounded-xl ${t.color} flex items-center justify-center shrink-0 shadow-sm`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{t.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{t.description}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Description</label>
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Schedule</label>
                <select
                  value={trigger}
                  onChange={e => setTrigger(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {TRIGGER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Steps (JSON)</label>
                <textarea
                  value={steps}
                  onChange={e => setSteps(e.target.value)}
                  rows={5}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Actions: <code className="text-primary">generate_briefing</code>, <code className="text-primary">task_digest</code>, <code className="text-primary">research</code>, <code className="text-primary">generate_post</code>, <code className="text-primary">custom_ai</code>
                </p>
              </div>

              <button
                onClick={handleCreate}
                disabled={!name.trim() || isPending}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
              >
                {isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : <><Sparkles className="w-4 h-4" /> Create Workflow</>}
              </button>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

/* ─── Result panel ────────────────────────────────────────── */
function ResultPanel({ result, onClose }: { result: RunResult; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card border border-border rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300 mx-0 md:mx-4">
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            {result.success
              ? <CheckCircle2 className="w-4 h-4 text-green-500" />
              : <AlertCircle className="w-4 h-4 text-destructive" />}
            <h2 className="font-bold text-base">{result.success ? "Run Complete" : "Run Failed"}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <ScrollArea className="max-h-[60vh]">
          <div className="p-5 space-y-4">
            <div className={`rounded-xl border p-3.5 text-sm ${result.success ? "border-green-500/20 bg-green-500/5" : "border-destructive/20 bg-destructive/5"}`}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{result.stepsExecuted} step{result.stepsExecuted !== 1 ? "s" : ""} executed</p>
              <div className="whitespace-pre-wrap leading-relaxed">{result.output}</div>
            </div>
            {result.error && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3.5 text-sm text-destructive">
                {result.error}
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="p-5 border-t border-border">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-sm font-medium transition-all">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main ───────────────────────────────────────────────── */
export default function Workflows() {
  const [showCreate, setShowCreate] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [runningId, setRunningId] = useState<number | null>(null);

  const { data: workflows = [], isLoading } = useWorkflows();
  const createWorkflow = useCreateWorkflow();
  const toggleWorkflow = useToggleWorkflow();
  const deleteWorkflow = useDeleteWorkflow();
  const runWorkflow = useRunWorkflow();

  const handleCreate = async (data: any) => {
    await createWorkflow.mutateAsync(data);
    setShowCreate(false);
  };

  const handleRun = async (id: number) => {
    setRunningId(id);
    try {
      const result = await runWorkflow.mutateAsync(id);
      setRunResult(result);
    } finally {
      setRunningId(null);
    }
  };

  const active = workflows.filter(w => w.enabled);
  const inactive = workflows.filter(w => !w.enabled);

  return (
    <div className="h-full flex flex-col bg-background overflow-y-auto">
      {/* Header */}
      <div className="px-6 pt-8 pb-5 border-b border-border flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Automations</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {active.length} active · {workflows.length} total
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all shadow-sm shadow-primary/20"
        >
          <Plus className="w-4 h-4" /> New Workflow
        </button>
      </div>

      <div className="flex-1 p-6 max-w-4xl mx-auto w-full">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-yellow-500/10 flex items-center justify-center mb-5">
              <Zap className="w-7 h-7 text-yellow-500" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-1">No automations yet</h3>
            <p className="text-sm max-w-xs mb-6 opacity-75">
              Create workflows to automate your daily briefing, research, posting, and more.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all"
            >
              <Plus className="w-4 h-4" /> Create your first workflow
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Active workflows */}
            {active.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Active</p>
                <div className="space-y-3">
                  {active.map(w => <WorkflowCard key={w.id} workflow={w} onRun={handleRun} onToggle={toggleWorkflow.mutate} onDelete={deleteWorkflow.mutate} isRunning={runningId === w.id} />)}
                </div>
              </div>
            )}

            {/* Inactive workflows */}
            {inactive.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Paused</p>
                <div className="space-y-3 opacity-60">
                  {inactive.map(w => <WorkflowCard key={w.id} workflow={w} onRun={handleRun} onToggle={toggleWorkflow.mutate} onDelete={deleteWorkflow.mutate} isRunning={runningId === w.id} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showCreate && <CreateSheet onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
      {runResult && <ResultPanel result={runResult} onClose={() => setRunResult(null)} />}
    </div>
  );
}

/* ─── Workflow card ──────────────────────────────────────── */
function WorkflowCard({
  workflow, onRun, onToggle, onDelete, isRunning,
}: {
  workflow: Workflow;
  onRun: (id: number) => void;
  onToggle: (data: { id: number; enabled: boolean }) => void;
  onDelete: (id: number) => void;
  isRunning: boolean;
}) {
  const Icon = getWorkflowIcon(workflow.steps);
  const iconColor = getIconColor(workflow.steps);

  const triggerLabel = TRIGGER_OPTIONS.find(t => t.value === workflow.trigger)?.label ?? workflow.trigger;

  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl border border-border bg-card hover:border-primary/30 transition-all group">
      {/* Icon */}
      <div className={`w-11 h-11 rounded-xl ${iconColor} flex items-center justify-center shrink-0 shadow-sm`}>
        <Icon className="w-5 h-5 text-white" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm truncate">{workflow.name}</p>
          {workflow.lastRunStatus === "success" && (
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
          )}
          {workflow.lastRunStatus === "error" && (
            <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-muted-foreground truncate">{workflow.description ?? triggerLabel}</span>
          {workflow.lastRunAt && (
            <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDistanceToNow(new Date(workflow.lastRunAt), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onRun(workflow.id)}
          disabled={isRunning || !workflow.enabled}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold disabled:opacity-40 transition-all"
        >
          {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          Run
        </button>
        <Switch
          checked={workflow.enabled}
          onCheckedChange={() => onToggle({ id: workflow.id, enabled: !workflow.enabled })}
        />
        <button
          onClick={() => onDelete(workflow.id)}
          className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
