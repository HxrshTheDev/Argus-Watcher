import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Mail, Sparkles, Trash2, Copy, Check, Loader2,
  FileText, ChevronRight, X, ArrowRight, MailOpen, ChevronLeft,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Draft {
  id: number; subject: string; body: string;
  recipient?: string | null; context?: string | null; status: string; createdAt: string;
}
interface GeneratedDraft { subject: string; body: string }
interface Summary { summary: string; keyPoints: string[]; actionRequired: boolean }

const TONES = [
  { id: "professional", label: "Professional", emoji: "💼" },
  { id: "casual",       label: "Casual",       emoji: "😊" },
  { id: "formal",       label: "Formal",       emoji: "🎩" },
  { id: "friendly",     label: "Friendly",     emoji: "👋" },
  { id: "assertive",    label: "Assertive",    emoji: "🎯" },
];

function useDrafts() {
  return useQuery<Draft[]>({
    queryKey: ["email-drafts"],
    queryFn: async () => { const r = await fetch(`${BASE}/api/emails`); return r.json(); },
  });
}

function useGenerateDraft() {
  return useMutation<GeneratedDraft, Error, { context: string; recipient: string; tone: string }>({
    mutationFn: async (data) => {
      const r = await fetch(`${BASE}/api/emails/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      return r.json();
    },
  });
}

function useSummarize() {
  return useMutation<Summary, Error, { content: string; subject?: string }>({
    mutationFn: async (data) => {
      const r = await fetch(`${BASE}/api/emails/summarize`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      return r.json();
    },
  });
}

function useSaveDraft() {
  const qc = useQueryClient();
  return useMutation<Draft, Error, { subject: string; body: string; recipient: string; context: string }>({
    mutationFn: async (data) => {
      const r = await fetch(`${BASE}/api/emails`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-drafts"] }),
  });
}

function useDeleteDraft() {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => { await fetch(`${BASE}/api/emails/${id}`, { method: "DELETE" }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-drafts"] }),
  });
}

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <button onClick={copy} className={`p-1.5 rounded-lg hover:bg-muted transition-all text-muted-foreground hover:text-foreground ${className}`}>
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function DraftDetail({ draft, onDelete, onBack }: { draft: Draft; onDelete: () => void; onBack?: () => void }) {
  const deleteDraft = useDeleteDraft();
  const fullText = draft.recipient ? `To: ${draft.recipient}\nSubject: ${draft.subject}\n\n${draft.body}` : `Subject: ${draft.subject}\n\n${draft.body}`;

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button onClick={onBack} className="shrink-0 p-1 rounded-lg hover:bg-muted text-primary">
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div className="min-w-0">
            <h2 className="font-bold text-base leading-tight truncate">{draft.subject}</h2>
            {draft.recipient && <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Mail className="w-3 h-3" /> {draft.recipient}</p>}
            <p className="text-[11px] text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(draft.createdAt), { addSuffix: true })}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <CopyButton text={fullText} />
          <button onClick={() => { deleteDraft.mutate(draft.id); onDelete(); }}
            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-5">
          <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap">{draft.body}</div>
          {draft.context && (
            <div className="mt-4 rounded-xl border border-border/50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Context</p>
              <p className="text-xs text-muted-foreground">{draft.context}</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function ComposePanel({ onSaved }: { onSaved: (draft: Draft) => void }) {
  const [mode, setMode] = useState<"compose" | "summarize">("compose");
  const [tone, setTone] = useState("professional");
  const [recipient, setRecipient] = useState("");
  const [context, setContext] = useState("");
  const [generated, setGenerated] = useState<GeneratedDraft | null>(null);
  const [editedBody, setEditedBody] = useState("");
  const [editedSubject, setEditedSubject] = useState("");
  const [pastedEmail, setPastedEmail] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);

  const generate = useGenerateDraft();
  const save = useSaveDraft();
  const summarize = useSummarize();

  const handleGenerate = async () => {
    if (!context.trim()) return;
    const result = await generate.mutateAsync({ context, recipient, tone });
    setGenerated(result); setEditedSubject(result.subject); setEditedBody(result.body);
  };

  const handleSave = async () => {
    if (!editedBody || !editedSubject) return;
    const draft = await save.mutateAsync({ subject: editedSubject, body: editedBody, recipient, context });
    onSaved(draft);
    setGenerated(null); setEditedBody(""); setEditedSubject(""); setContext(""); setRecipient("");
  };

  const handleSummarize = async () => {
    if (!pastedEmail.trim()) return;
    const result = await summarize.mutateAsync({ content: pastedEmail });
    setSummary(result);
  };

  if (mode === "summarize") {
    return (
      <div className="flex flex-col h-full">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-base">Summarize Email</h2>
          <button onClick={() => { setMode("compose"); setSummary(null); setPastedEmail(""); }} className="text-xs text-primary font-medium">← Compose</button>
        </div>
        <div className="flex-1 flex flex-col gap-4 p-5 overflow-y-auto">
          {!summary ? (
            <>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Paste email content</label>
                <textarea value={pastedEmail} onChange={e => setPastedEmail(e.target.value)}
                  placeholder="Paste the email you want to summarize here…" rows={8}
                  className="w-full px-3.5 py-3 rounded-2xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>
              <button onClick={handleSummarize} disabled={!pastedEmail.trim() || summarize.isPending}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
              >
                {summarize.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</> : <><Sparkles className="w-4 h-4" /> Summarize</>}
              </button>
            </>
          ) : (
            <div className="space-y-4">
              {summary.actionRequired && (
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-500 text-sm font-medium">
                  <ArrowRight className="w-4 h-4" /> Action required
                </div>
              )}
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Summary</p>
                <p className="text-sm leading-relaxed">{summary.summary}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Key Points</p>
                <ul className="space-y-2">
                  {summary.keyPoints.map((pt, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5 shrink-0">{i + 1}</span>
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
              <button onClick={() => { setSummary(null); setPastedEmail(""); }}
                className="w-full py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-sm font-medium transition-all">Summarize another</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h2 className="font-bold text-base">AI Compose</h2>
        <button onClick={() => setMode("summarize")}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-all"
        >
          <MailOpen className="w-3.5 h-3.5" /> Summarize
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {!generated ? (
          <div className="p-5 space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Tone</label>
              <div className="flex flex-wrap gap-2">
                {TONES.map(t => (
                  <button key={t.id} onClick={() => setTone(t.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${tone === t.id ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 border-border hover:border-primary/40"}`}
                  >{t.emoji} {t.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">To (optional)</label>
              <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="recipient@example.com"
                className="w-full h-10 px-3.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">What should this email say?</label>
              <textarea value={context} onChange={e => setContext(e.target.value)}
                onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleGenerate(); }}
                placeholder="Describe the email purpose, key points, any specific requests…" rows={5}
                className="w-full px-3.5 py-3 rounded-2xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">⌘ + Enter to generate</p>
            </div>
            <button onClick={handleGenerate} disabled={!context.trim() || generate.isPending}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
            >
              {generate.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Writing…</> : <><Sparkles className="w-4 h-4" /> Generate Email</>}
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-xs font-medium">
              <Check className="w-3.5 h-3.5" /> Email generated — edit or save to drafts
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Subject line</label>
              <input value={editedSubject} onChange={e => setEditedSubject(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-medium"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Body</label>
                <CopyButton text={`Subject: ${editedSubject}\n\n${editedBody}`} />
              </div>
              <textarea value={editedBody} onChange={e => setEditedBody(e.target.value)} rows={10}
                className="w-full px-3.5 py-3 rounded-2xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none leading-relaxed"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={!editedSubject || !editedBody || save.isPending}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
              >
                {save.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><FileText className="w-4 h-4" /> Save to Drafts</>}
              </button>
              <button onClick={() => { setGenerated(null); setEditedBody(""); setEditedSubject(""); }}
                className="px-4 py-3 rounded-xl bg-muted hover:bg-muted/80 text-sm font-medium transition-all"
              >Redo</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Email() {
  const isMobile = useIsMobile();
  const { data: drafts = [], isLoading } = useDrafts();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [mobileTab, setMobileTab] = useState<"drafts" | "compose">("compose");
  const [mobileViewDraft, setMobileViewDraft] = useState(false);

  const filtered = drafts.filter(d =>
    d.subject.toLowerCase().includes(search.toLowerCase()) ||
    (d.recipient ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const selected = drafts.find(d => d.id === selectedId) ?? null;

  const handleSelectDraft = (draft: Draft) => {
    setSelectedId(draft.id);
    if (isMobile) setMobileViewDraft(true);
  };

  const DraftsList = () => (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <div className="relative">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search drafts…"
            className="w-full h-9 pl-3.5 pr-8 rounded-xl border border-input bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="w-3.5 h-3.5" /></button>}
        </div>
      </div>
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center text-muted-foreground">
            <Mail className="w-8 h-8 mb-3 opacity-20" />
            <p className="text-sm">{search ? "No drafts match" : "No saved drafts yet"}</p>
          </div>
        ) : (
          <div className="py-2 px-2 space-y-1">
            {filtered.map(draft => (
              <button key={draft.id} onClick={() => handleSelectDraft(draft)}
                className={`w-full text-left px-3 py-3 rounded-xl transition-all group ${selectedId === draft.id ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/60 border border-transparent"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-sm truncate">{draft.subject}</p>
                  <ChevronRight className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${selectedId === draft.id ? "text-primary" : "text-muted-foreground opacity-0 group-hover:opacity-100"}`} />
                </div>
                {draft.recipient && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">To: {draft.recipient}</p>}
                <p className="text-[11px] text-muted-foreground mt-1">{formatDistanceToNow(new Date(draft.createdAt), { addSuffix: true })}</p>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
      <div className="p-3 border-t border-border">
        <p className="text-[11px] text-muted-foreground text-center">{drafts.length} saved draft{drafts.length !== 1 ? "s" : ""}</p>
      </div>
    </div>
  );

  /* ── Mobile ── */
  if (isMobile) {
    if (mobileViewDraft && selected) {
      return (
        <div className="flex flex-col h-full bg-background">
          <DraftDetail draft={selected} onDelete={() => { setSelectedId(null); setMobileViewDraft(false); }} onBack={() => setMobileViewDraft(false)} />
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full bg-background">
        <div className="px-4 pt-5 pb-0 border-b border-border">
          <h1 className="text-xl font-bold mb-3">Email</h1>
          <div className="flex gap-1">
            {([
              { id: "compose" as const, label: "Compose" },
              { id: "drafts"  as const, label: `Drafts (${drafts.length})` },
            ]).map(t => (
              <button key={t.id} onClick={() => setMobileTab(t.id)}
                className={`flex-1 py-2 text-xs font-semibold rounded-t-xl transition-all border-b-2 ${mobileTab === t.id ? "text-primary border-primary" : "text-muted-foreground border-transparent"}`}
              >{t.label}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {mobileTab === "compose" ? (
            <ComposePanel onSaved={(draft) => { setSelectedId(draft.id); setMobileTab("drafts"); setMobileViewDraft(true); }} />
          ) : (
            <DraftsList />
          )}
        </div>
      </div>
    );
  }

  /* ── Desktop ── */
  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <div className="w-72 shrink-0 border-r border-border flex flex-col">
        <div className="px-4 pt-6 pb-4 border-b border-border">
          <h1 className="text-2xl font-bold tracking-tight mb-3">Email</h1>
          <div className="relative">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search drafts…"
              className="w-full h-9 pl-3.5 pr-8 rounded-xl border border-input bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="w-3.5 h-3.5" /></button>}
          </div>
        </div>
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center text-muted-foreground">
              <Mail className="w-8 h-8 mb-3 opacity-20" />
              <p className="text-sm">{search ? "No drafts match" : "No saved drafts yet"}</p>
              <p className="text-xs mt-1 opacity-70">Use AI Compose to write your first email →</p>
            </div>
          ) : (
            <div className="py-2 px-2 space-y-1">
              {filtered.map(draft => (
                <button key={draft.id} onClick={() => setSelectedId(draft.id)}
                  className={`w-full text-left px-3 py-3 rounded-xl transition-all group ${selectedId === draft.id ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/60 border border-transparent"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm truncate">{draft.subject}</p>
                    <ChevronRight className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${selectedId === draft.id ? "text-primary" : "text-muted-foreground opacity-0 group-hover:opacity-100"}`} />
                  </div>
                  {draft.recipient && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">To: {draft.recipient}</p>}
                  <p className="text-[11px] text-muted-foreground mt-1">{formatDistanceToNow(new Date(draft.createdAt), { addSuffix: true })}</p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="p-3 border-t border-border">
          <p className="text-[11px] text-muted-foreground text-center">{drafts.length} saved draft{drafts.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      <div className="flex-1 border-r border-border overflow-hidden">
        {selected ? (
          <DraftDetail draft={selected} onDelete={() => setSelectedId(null)} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center">
              <Mail className="w-7 h-7 text-red-500" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground text-sm">Select a draft</p>
              <p className="text-xs mt-1 opacity-70">or compose a new one with AI →</p>
            </div>
          </div>
        )}
      </div>

      <div className="w-80 shrink-0 overflow-hidden">
        <ComposePanel onSaved={(draft) => setSelectedId(draft.id)} />
      </div>
    </div>
  );
}
