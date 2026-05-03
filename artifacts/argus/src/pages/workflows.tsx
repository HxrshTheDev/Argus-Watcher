import { useState, useEffect } from "react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { formatDistanceToNow } from "date-fns";
import {
  Zap, Plus, Play, Trash2, CheckCircle2, AlertCircle,
  Clock, X, Loader2, Sun, ClipboardList, Search,
  Share2, Bot, Sparkles, ChevronRight, Mail, CheckSquare, Globe,
  Calendar, CalendarClock, Timer, Repeat,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Workflow  { id: number; name: string; description?: string | null; trigger: string; steps: string; enabled: boolean; lastRunAt?: string | null; lastRunStatus?: string | null; createdAt: string; }
interface RunResult { success: boolean; output: string; stepsExecuted: number; error?: string | null; }

/* ── Step action definitions ── */
const STEP_ACTIONS: Record<string, {
  icon: React.ElementType; gradient: string; label: string;
  params: Array<{ key: string; label: string; placeholder: string; type?: string; options?: { v: string; l: string }[] }>;
}> = {
  generate_briefing: { icon: Sun,          gradient: "from-yellow-400 to-orange-500", label: "Generate Briefing",  params: [] },
  task_digest:       { icon: ClipboardList, gradient: "from-blue-500 to-blue-600",    label: "Task Digest",        params: [] },
  research:          { icon: Search,        gradient: "from-purple-500 to-indigo-600", label: "Research Topic",     params: [{ key: "query", label: "Topic / Query", placeholder: "latest AI news" }] },
  generate_post:     { icon: Share2,        gradient: "from-pink-500 to-rose-500",    label: "Generate Post",      params: [
    { key: "topic",    label: "Topic",    placeholder: "productivity tips" },
    { key: "platform", label: "Platform", placeholder: "LinkedIn", options: [{ v: "LinkedIn", l: "LinkedIn" }, { v: "Twitter", l: "Twitter/X" }, { v: "Instagram", l: "Instagram" }] },
    { key: "tone",     label: "Tone",     placeholder: "professional", options: [{ v: "professional", l: "Professional" }, { v: "casual", l: "Casual" }, { v: "inspiring", l: "Inspiring" }] },
  ]},
  custom_ai:         { icon: Bot,           gradient: "from-violet-500 to-violet-600", label: "Custom AI Task",    params: [{ key: "prompt", label: "Prompt / Instruction", placeholder: "Summarize the key AI trends this week.", type: "textarea" }] },
  send_email:        { icon: Mail,          gradient: "from-red-500 to-rose-600",     label: "Send Email",         params: [
    { key: "to",      label: "To",      placeholder: "recipient@example.com", type: "email" },
    { key: "subject", label: "Subject", placeholder: "Your subject line" },
    { key: "body",    label: "Body",    placeholder: "Email body content…", type: "textarea" },
  ]},
  create_task:       { icon: CheckSquare,   gradient: "from-teal-500 to-emerald-600", label: "Create Task",        params: [
    { key: "title",       label: "Title",       placeholder: "Task title" },
    { key: "description", label: "Description", placeholder: "Optional details", type: "textarea" },
    { key: "priority",    label: "Priority",    placeholder: "medium", options: [{ v: "low", l: "Low" }, { v: "medium", l: "Medium" }, { v: "high", l: "High" }] },
    { key: "dueDate",     label: "Due Date",    placeholder: "YYYY-MM-DD", type: "date" },
  ]},
  http_request:      { icon: Globe,         gradient: "from-cyan-500 to-sky-600",     label: "HTTP Request",       params: [
    { key: "url",    label: "URL",    placeholder: "https://api.example.com/endpoint" },
    { key: "method", label: "Method", placeholder: "GET", options: [{ v: "GET", l: "GET" }, { v: "POST", l: "POST" }, { v: "PUT", l: "PUT" }, { v: "PATCH", l: "PATCH" }, { v: "DELETE", l: "DELETE" }] },
    { key: "body",   label: "Body (JSON)", placeholder: '{"key": "value"}', type: "textarea" },
  ]},
};

const TEMPLATES = [
  { id: "briefing", label: "Daily Briefing",  desc: "Generate your AI morning briefing from overdue and today's tasks.",    trigger: "daily:09:00", steps: [{ action: "generate_briefing" }] },
  { id: "digest",   label: "Task Digest",     desc: "Summarise all pending and overdue tasks into a clear report.",          trigger: "manual",      steps: [{ action: "task_digest" }] },
  { id: "research", label: "Research Topic",  desc: "Search the web and save a research note on any topic.",                trigger: "manual",      steps: [{ action: "research", params: { query: "latest AI news" } }] },
  { id: "post",     label: "Generate Post",   desc: "Auto-write a LinkedIn or Twitter post on a topic and save it.",        trigger: "manual",      steps: [{ action: "generate_post", params: { topic: "productivity tips", platform: "LinkedIn", tone: "professional" } }] },
  { id: "custom",   label: "Custom AI Task",  desc: "Give Argus a free-form AI instruction and it will execute it.",        trigger: "manual",      steps: [{ action: "custom_ai", params: { prompt: "Summarise the key AI trends this week." } }] },
  { id: "email",    label: "Send Email",      desc: "Automatically compose and send an email to a recipient.",              trigger: "manual",      steps: [{ action: "send_email", params: { to: "", subject: "", body: "" } }] },
  { id: "task",     label: "Create Task",     desc: "Automatically create a task with a title, priority, and due date.",    trigger: "manual",      steps: [{ action: "create_task", params: { title: "", priority: "medium" } }] },
  { id: "http",     label: "HTTP Request",    desc: "Make an HTTP request to any API endpoint as part of your workflow.",   trigger: "manual",      steps: [{ action: "http_request", params: { url: "", method: "GET" } }] },
];

const TRIGGERS = [
  { value: "manual",         label: "Manual — run on demand",       icon: Play },
  { value: "daily:07:00",    label: "Every day at 7:00 AM",          icon: CalendarClock },
  { value: "daily:09:00",    label: "Every day at 9:00 AM",          icon: CalendarClock },
  { value: "daily:12:00",    label: "Every day at 12:00 PM",         icon: CalendarClock },
  { value: "daily:18:00",    label: "Every day at 6:00 PM",          icon: CalendarClock },
  { value: "hourly",         label: "Every hour",                    icon: Timer },
  { value: "weekly:monday",  label: "Every Monday at 9:00 AM",       icon: Calendar },
  { value: "weekly:friday",  label: "Every Friday at 9:00 AM",       icon: Calendar },
];

function triggerLabel(v: string) { return TRIGGERS.find(t => t.value === v)?.label ?? v; }

function getFirstStepCfg(steps: string) {
  try { const p = JSON.parse(steps); return STEP_ACTIONS[p[0]?.action] ?? null; }
  catch { return null; }
}

/* ── Hooks ── */
function useWorkflows() {
  return useQuery<Workflow[]>({ queryKey: ["workflows"], queryFn: async () => { const r = await fetch(`${BASE}/api/workflows`); return r.json(); }, refetchInterval: 30_000 });
}
function useSchedulerStatus() {
  return useQuery<{ scheduled: number; ids: number[] }>({ queryKey: ["scheduler-status"], queryFn: async () => { const r = await fetch(`${BASE}/api/workflows/scheduler/status`); return r.json(); }, refetchInterval: 30_000 });
}
function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation<Workflow, Error, { name: string; description: string; trigger: string; steps: string }>({
    mutationFn: async (d) => { const r = await fetch(`${BASE}/api/workflows`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }); return r.json(); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["workflows"] }); qc.invalidateQueries({ queryKey: ["scheduler-status"] }); },
  });
}
function useToggleWorkflow() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: number; enabled: boolean }>({
    mutationFn: async ({ id, enabled }) => { await fetch(`${BASE}/api/workflows/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["workflows"] }); qc.invalidateQueries({ queryKey: ["scheduler-status"] }); },
  });
}
function useDeleteWorkflow() {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => { await fetch(`${BASE}/api/workflows/${id}`, { method: "DELETE" }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["workflows"] }); qc.invalidateQueries({ queryKey: ["scheduler-status"] }); },
  });
}
function useRunWorkflow() {
  const qc = useQueryClient();
  return useMutation<RunResult, Error, number>({
    mutationFn: async (id) => { const r = await fetch(`${BASE}/api/workflows/${id}/run`, { method: "POST" }); return r.json(); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflows"] }),
  });
}

/* ── Step editor ── */
interface StepState { action: string; params: Record<string, string> }

function StepEditor({ step, idx, onChange, onRemove, showRemove }: {
  step: StepState; idx: number; onChange: (s: StepState) => void; onRemove: () => void; showRemove: boolean;
}) {
  const cfg = STEP_ACTIONS[step.action];
  const inputCls = "w-full h-9 px-3 rounded-xl border border-input bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all";
  const textareaCls = "w-full px-3 py-2.5 rounded-xl border border-input bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none";

  return (
    <div className="rounded-2xl border border-border bg-muted/20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-black flex items-center justify-center">{idx + 1}</span>
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Step {idx + 1}</span>
        </div>
        {showRemove && (
          <button onClick={onRemove} className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="p-4 space-y-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1.5">Action</label>
          <select value={step.action} onChange={e => onChange({ action: e.target.value, params: {} })}
            className="w-full h-9 px-3 rounded-xl border border-input bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-medium">
            {Object.entries(STEP_ACTIONS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        {cfg?.params.map(p => (
          <div key={p.key}>
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1.5">{p.label}</label>
            {p.options ? (
              <select value={step.params[p.key] ?? p.options[0]!.v} onChange={e => onChange({ ...step, params: { ...step.params, [p.key]: e.target.value } })}
                className="w-full h-9 px-3 rounded-xl border border-input bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-medium">
                {p.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            ) : p.type === "textarea" ? (
              <textarea value={step.params[p.key] ?? ""} onChange={e => onChange({ ...step, params: { ...step.params, [p.key]: e.target.value } })}
                placeholder={p.placeholder} rows={3} className={textareaCls} />
            ) : (
              <input value={step.params[p.key] ?? ""} onChange={e => onChange({ ...step, params: { ...step.params, [p.key]: e.target.value } })}
                placeholder={p.placeholder} type={p.type ?? "text"} className={inputCls} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Workflow card ── */
function WorkflowCard({ workflow, onRun, onToggle, onDelete, isRunning }: {
  workflow: Workflow; onRun: (id: number) => void;
  onToggle: (d: { id: number; enabled: boolean }) => void;
  onDelete: (id: number) => void; isRunning: boolean;
}) {
  const cfg = getFirstStepCfg(workflow.steps);
  const Icon = cfg?.icon ?? Zap;
  const gradient = cfg?.gradient ?? "from-primary to-violet-600";
  const isScheduled = workflow.trigger !== "manual";

  return (
    <div className={`group flex items-center gap-4 p-4 rounded-2xl border bg-card transition-all duration-200 hover:border-primary/20 hover:shadow-sm hover:-translate-y-px ${!workflow.enabled ? "opacity-55" : ""}`}>
      <div className={`relative w-12 h-12 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0 shadow-lg shadow-black/20`}>
        <Icon className="w-5 h-5 text-white" />
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/20 to-transparent" />
        {isRunning && (
          <div className="absolute inset-0 rounded-2xl bg-black/30 flex items-center justify-center">
            <Loader2 className="w-4 h-4 text-white animate-spin" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <p className="font-bold text-sm truncate tracking-tight">{workflow.name}</p>
          {workflow.lastRunStatus === "success" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
          {workflow.lastRunStatus === "error"   && <AlertCircle  className="w-3.5 h-3.5 text-destructive shrink-0" />}
          {isScheduled && workflow.enabled && (
            <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-cyan-500 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full">
              <Repeat className="w-2.5 h-2.5" /> Scheduled
            </span>
          )}
        </div>
        <p className="text-[12px] text-muted-foreground truncate">{workflow.description ?? triggerLabel(workflow.trigger)}</p>
        {workflow.lastRunAt && (
          <p className="text-[11px] text-muted-foreground/60 mt-1 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDistanceToNow(new Date(workflow.lastRunAt), { addSuffix: true })}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={() => onRun(workflow.id)} disabled={isRunning || !workflow.enabled}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold disabled:opacity-40 transition-all active:scale-95 border border-primary/15">
          {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Run
        </button>
        <Switch checked={workflow.enabled} onCheckedChange={() => onToggle({ id: workflow.id, enabled: !workflow.enabled })} className="scale-90" />
        <button onClick={() => onDelete(workflow.id)}
          className="w-7 h-7 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ── Create sheet ── */
function CreateSheet({ onClose, onCreate }: { onClose: () => void; onCreate: (d: any) => Promise<void> }) {
  const [view, setView] = useState<"template" | "configure">("template");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState("manual");
  const [steps, setSteps] = useState<StepState[]>([{ action: "custom_ai", params: {} }]);
  const [isPending, setIsPending] = useState(false);

  const pickTemplate = (t: typeof TEMPLATES[0]) => {
    setName(t.label); setDescription(t.desc); setTrigger(t.trigger);
    setSteps(t.steps.map(s => ({ action: s.action, params: ("params" in s ? s.params : {}) as Record<string, string> })));
    setView("configure");
  };

  const handleCreate = async () => {
    setIsPending(true);
    const stepsJson = JSON.stringify(steps.map(s => ({ action: s.action, params: s.params })));
    await onCreate({ name, description, trigger, steps: stepsJson });
    setIsPending(false);
  };

  const inputCls = "w-full h-11 px-3.5 rounded-xl border border-input bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all font-medium";
  const labelCls = "text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card border border-border rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300 mx-0 md:mx-4">
        <div className="flex justify-center pt-3 pb-0 md:hidden"><div className="w-9 h-1 rounded-full bg-border/80" /></div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          {view === "configure"
            ? <button onClick={() => setView("template")} className="text-primary text-sm font-bold">← Back</button>
            : <div />}
          <h2 className="font-black text-base tracking-tight">{view === "template" ? "Choose a Template" : "Configure Workflow"}</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-muted text-muted-foreground transition-all"><X className="w-4 h-4" /></button>
        </div>

        <ScrollArea className="max-h-[78vh]">
          {view === "template" ? (
            <div className="p-4 grid grid-cols-2 gap-2">
              {TEMPLATES.map(t => {
                const stepCfg = STEP_ACTIONS[t.steps[0]!.action];
                const Icon = stepCfg?.icon ?? Zap;
                const gradient = stepCfg?.gradient ?? "from-primary to-violet-600";
                return (
                  <button key={t.id} onClick={() => pickTemplate(t)}
                    className="flex flex-col items-start gap-3 p-4 rounded-2xl border border-border hover:border-primary/30 hover:bg-muted/30 transition-all group text-left active:scale-[0.98]">
                    <div className={`relative w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md shadow-black/20 shrink-0`}>
                      <Icon className="w-4.5 h-4.5 text-white" />
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-white/20 to-transparent" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-[13px] tracking-tight leading-snug">{t.label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">{t.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-5 space-y-4">
              <div>
                <label className={labelCls}>Name</label>
                <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Description</label>
                <input value={description} onChange={e => setDescription(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Schedule / Trigger</label>
                <select value={trigger} onChange={e => setTrigger(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-input bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-medium">
                  {TRIGGERS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {trigger !== "manual" && (
                  <p className="text-[11px] text-cyan-500 mt-1.5 flex items-center gap-1.5">
                    <Repeat className="w-3 h-3" /> This workflow will run automatically on schedule
                  </p>
                )}
              </div>

              {/* Step builder */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={labelCls + " !mb-0"}>Steps</label>
                  <button onClick={() => setSteps(prev => [...prev, { action: "custom_ai", params: {} }])}
                    className="text-[11px] text-primary font-bold hover:underline">+ Add step</button>
                </div>
                <div className="space-y-3">
                  {steps.map((step, i) => (
                    <StepEditor key={i} step={step} idx={i}
                      onChange={updated => setSteps(prev => prev.map((s, si) => si === i ? updated : s))}
                      onRemove={() => setSteps(prev => prev.filter((_, si) => si !== i))}
                      showRemove={steps.length > 1}
                    />
                  ))}
                </div>
              </div>

              <button onClick={handleCreate} disabled={!name.trim() || isPending}
                className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground text-sm font-black disabled:opacity-40 hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/25 active:scale-[0.98]">
                {isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : <><Sparkles className="w-4 h-4" /> Create Workflow</>}
              </button>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

/* ── Result panel ── */
function ResultPanel({ result, onClose }: { result: RunResult; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card border border-border rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300 mx-0 md:mx-4">
        <div className="flex justify-center pt-3 md:hidden"><div className="w-9 h-1 rounded-full bg-border/80" /></div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${result.success ? "bg-emerald-500/10" : "bg-destructive/10"}`}>
              {result.success ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-destructive" />}
            </div>
            <h2 className="font-black text-base tracking-tight">{result.success ? "Run Complete" : "Run Failed"}</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-muted text-muted-foreground transition-all"><X className="w-4 h-4" /></button>
        </div>
        <ScrollArea className="max-h-[55vh]">
          <div className="p-5 space-y-3">
            <div className={`rounded-2xl border p-4 text-sm font-mono leading-relaxed whitespace-pre-wrap ${result.success ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300/90" : "border-destructive/20 bg-destructive/5 text-destructive"}`}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2 text-muted-foreground">{result.stepsExecuted} step{result.stepsExecuted !== 1 ? "s" : ""} executed</p>
              {result.output}
            </div>
            {result.error && <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{result.error}</div>}
          </div>
        </ScrollArea>
        <div className="p-5 border-t border-border/60">
          <button onClick={onClose} className="w-full py-3 rounded-2xl bg-muted hover:bg-muted/80 text-sm font-bold transition-all active:scale-[0.98]">Done</button>
        </div>
      </div>
    </div>
  );
}

/* ── Main ── */
export default function Workflows() {
  const [showCreate, setShowCreate] = useState(false);
  const [runResult, setRunResult]   = useState<RunResult | null>(null);
  const [runningId, setRunningId]   = useState<number | null>(null);

  const { data: workflows = [], isLoading } = useWorkflows();
  const { data: schedulerStatus } = useSchedulerStatus();
  const createWorkflow  = useCreateWorkflow();
  const toggleWorkflow  = useToggleWorkflow();
  const deleteWorkflow  = useDeleteWorkflow();
  const runWorkflow     = useRunWorkflow();

  const handleCreate = async (data: any) => { await createWorkflow.mutateAsync(data); setShowCreate(false); };
  const handleRun = async (id: number) => {
    setRunningId(id);
    try { const r = await runWorkflow.mutateAsync(id); setRunResult(r); }
    finally { setRunningId(null); }
  };

  const active   = workflows.filter(w =>  w.enabled);
  const inactive = workflows.filter(w => !w.enabled);

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-5 sm:px-7 pt-7 pb-5 border-b border-border/60">
        <div className="max-w-3xl mx-auto flex items-end justify-between">
          <div>
            <h1 className="text-[28px] font-black tracking-tight leading-none">Automations</h1>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <p className="text-sm text-muted-foreground">
                <span className="text-emerald-400 font-semibold">{active.length} active</span>
                {inactive.length > 0 && <span> · {inactive.length} paused</span>}
              </p>
              {schedulerStatus && schedulerStatus.scheduled > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-cyan-500 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-full">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                  {schedulerStatus.scheduled} scheduled
                </div>
              )}
            </div>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/25 active:scale-95">
            <Plus className="w-4 h-4" /> New
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1 px-5 sm:px-7">
        <div className="max-w-3xl mx-auto py-5">
          {isLoading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-[76px] rounded-2xl shimmer" />)}</div>
          ) : workflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="relative w-20 h-20 mb-6">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-yellow-400/20 to-orange-500/10 animate-pulse" />
                <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-xl shadow-orange-500/25">
                  <Zap className="w-9 h-9 text-white" />
                </div>
              </div>
              <h3 className="text-xl font-black tracking-tight mb-2">No automations yet</h3>
              <p className="text-sm text-muted-foreground max-w-xs mb-6 leading-relaxed">Create workflows to automate your daily briefing, research, posting, emails, and more.</p>
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/25 active:scale-95">
                <Plus className="w-4 h-4" /> Create your first workflow
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {active.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Active</p>
                  <div className="space-y-2">
                    {active.map(w => <WorkflowCard key={w.id} workflow={w} onRun={handleRun} onToggle={toggleWorkflow.mutate} onDelete={deleteWorkflow.mutate} isRunning={runningId === w.id} />)}
                  </div>
                </div>
              )}
              {inactive.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Paused</p>
                  <div className="space-y-2">
                    {inactive.map(w => <WorkflowCard key={w.id} workflow={w} onRun={handleRun} onToggle={toggleWorkflow.mutate} onDelete={deleteWorkflow.mutate} isRunning={runningId === w.id} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {showCreate && <CreateSheet onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
      {runResult  && <ResultPanel result={runResult}  onClose={() => setRunResult(null)} />}
    </div>
  );
}
