import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Mail, Sparkles, Trash2, Copy, Check, Loader2,
  FileText, ChevronRight, X, ArrowRight, MailOpen,
  ChevronLeft, Send, Settings, CheckCircle2, AlertCircle,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Draft   { id: number; subject: string; body: string; recipient?: string | null; context?: string | null; status: string; createdAt: string; }
interface Generated { subject: string; body: string }
interface Summary   { summary: string; keyPoints: string[]; actionRequired: boolean }
interface SmtpStatus { configured: boolean; from: string | null }

const TONES = [
  { id: "professional", label: "Professional", emoji: "💼" },
  { id: "casual",       label: "Casual",       emoji: "😊" },
  { id: "formal",       label: "Formal",       emoji: "🎩" },
  { id: "friendly",     label: "Friendly",     emoji: "👋" },
  { id: "assertive",    label: "Assertive",    emoji: "🎯" },
];

/* ── Hooks ── */
function useDrafts()     { return useQuery<Draft[]>({ queryKey: ["email-drafts"], queryFn: async () => { const r = await fetch(`${BASE}/api/emails`); return r.json(); } }); }
function useSmtpStatus() { return useQuery<SmtpStatus>({ queryKey: ["smtp-status"], queryFn: async () => { const r = await fetch(`${BASE}/api/emails/smtp-status`); return r.json(); }, staleTime: 60_000 }); }

function useGenerateDraft() {
  return useMutation<Generated, Error, { context: string; recipient: string; tone: string }>({
    mutationFn: async (d) => { const r = await fetch(`${BASE}/api/emails/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }); return r.json(); },
  });
}
function useSummarize() {
  return useMutation<Summary, Error, { content: string; subject?: string }>({
    mutationFn: async (d) => { const r = await fetch(`${BASE}/api/emails/summarize`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }); return r.json(); },
  });
}
function useSaveDraft() {
  const qc = useQueryClient();
  return useMutation<Draft, Error, { subject: string; body: string; recipient: string; context: string }>({
    mutationFn: async (d) => { const r = await fetch(`${BASE}/api/emails`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }); return r.json(); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-drafts"] }),
  });
}
function useSendEmail() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean; messageId: string; message: string }, { message: string }, { to: string; subject: string; body: string }>({
    mutationFn: async (d) => {
      const r = await fetch(`${BASE}/api/emails/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      const json = await r.json();
      if (!r.ok) throw json;
      return json;
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

/* ── Copy button ── */
function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${copied ? "bg-emerald-500/15 text-emerald-500" : "hover:bg-muted text-muted-foreground hover:text-foreground"} ${className}`}>
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

/* ── Draft detail ── */
function DraftDetail({ draft, onDelete, onBack }: { draft: Draft; onDelete: () => void; onBack?: () => void }) {
  const deleteDraft = useDeleteDraft();
  const fullText = `${draft.recipient ? `To: ${draft.recipient}\n` : ""}Subject: ${draft.subject}\n\n${draft.body}`;
  const isSent = draft.status === "sent";
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-5 py-4 border-b border-border/60 flex items-start gap-3 bg-background/80">
        {onBack && (
          <button onClick={onBack} className="w-8 h-8 rounded-xl flex items-center justify-center text-primary hover:bg-primary/10 transition-all mt-0.5 shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h2 className="font-bold text-[15px] leading-tight tracking-tight truncate">{draft.subject}</h2>
            {isSent && <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0">Sent</span>}
          </div>
          {draft.recipient && (
            <p className="text-[12px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <Mail className="w-3 h-3" /> {draft.recipient}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">{formatDistanceToNow(new Date(draft.createdAt), { addSuffix: true })}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <CopyButton text={fullText} />
          <button onClick={() => { deleteDraft.mutate(draft.id); onDelete(); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-5 max-w-2xl">
          <div className="rounded-2xl border border-border bg-card/60 p-5 text-sm leading-relaxed whitespace-pre-wrap">{draft.body}</div>
          {draft.context && (
            <div className="mt-3 rounded-xl border border-border/40 p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Context</p>
              <p className="text-[12px] text-muted-foreground leading-relaxed">{draft.context}</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ── Compose panel ── */
function ComposePanel({ onSaved }: { onSaved: (draft: Draft) => void }) {
  const [mode, setMode] = useState<"compose" | "summarize">("compose");
  const [tone, setTone] = useState("professional");
  const [to, setTo]     = useState("");
  const [context, setContext]       = useState("");
  const [generated, setGenerated]   = useState<Generated | null>(null);
  const [editedBody, setEditedBody] = useState("");
  const [editedSubject, setEditedSubject] = useState("");
  const [editedTo, setEditedTo]     = useState("");
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pastedEmail, setPastedEmail] = useState("");
  const [summary, setSummary]       = useState<Summary | null>(null);

  const generate    = useGenerateDraft();
  const save        = useSaveDraft();
  const summarize   = useSummarize();
  const sendEmail   = useSendEmail();
  const { data: smtpStatus } = useSmtpStatus();

  const inputCls    = "w-full h-11 px-3.5 rounded-xl border border-input bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all font-medium";
  const textareaCls = "w-full px-3.5 py-3 rounded-xl border border-input bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none leading-relaxed";
  const labelCls    = "text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1.5";

  const handleGenerate = async () => {
    if (!context.trim()) return;
    const result = await generate.mutateAsync({ context, recipient: to, tone });
    setGenerated(result); setEditedSubject(result.subject); setEditedBody(result.body); setEditedTo(to);
  };

  const handleSave = async () => {
    if (!editedBody || !editedSubject) return;
    const draft = await save.mutateAsync({ subject: editedSubject, body: editedBody, recipient: editedTo, context });
    onSaved(draft);
    setGenerated(null); setEditedBody(""); setEditedSubject(""); setContext(""); setTo("");
  };

  const handleSend = async () => {
    if (!editedTo || !editedSubject || !editedBody) return;
    setSendResult(null);
    try {
      await sendEmail.mutateAsync({ to: editedTo, subject: editedSubject, body: editedBody });
      setSendResult({ ok: true, msg: `Sent to ${editedTo}` });
    } catch (err: any) {
      setSendResult({ ok: false, msg: err?.error ?? err?.message ?? "Failed to send" });
    }
  };

  /* Clear send result after 5s */
  useEffect(() => {
    if (!sendResult) return;
    const t = setTimeout(() => setSendResult(null), 5000);
    return () => clearTimeout(t);
  }, [sendResult]);

  /* ── Summarize mode ── */
  if (mode === "summarize") {
    return (
      <div className="flex flex-col h-full">
        <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between bg-background/50">
          <h2 className="font-black text-[14px] tracking-tight">Summarize Email</h2>
          <button onClick={() => { setMode("compose"); setSummary(null); setPastedEmail(""); }} className="text-[12px] text-primary font-bold">← Compose</button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-5 space-y-4">
            {!summary ? (
              <>
                <div>
                  <label className={labelCls}>Paste email content</label>
                  <textarea value={pastedEmail} onChange={e => setPastedEmail(e.target.value)} placeholder="Paste the email you want to summarize…" rows={8} className={textareaCls} />
                </div>
                <button onClick={() => summarize.mutateAsync({ content: pastedEmail }).then(setSummary)} disabled={!pastedEmail.trim() || summarize.isPending}
                  className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground text-sm font-black disabled:opacity-40 hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-[0.98]">
                  {summarize.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</> : <><Sparkles className="w-4 h-4" /> Summarize</>}
                </button>
              </>
            ) : (
              <div className="space-y-3">
                {summary.actionRequired && (
                  <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm font-bold">
                    <ArrowRight className="w-4 h-4" /> Action required
                  </div>
                )}
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                  <p className={labelCls}>Summary</p>
                  <p className="text-sm leading-relaxed">{summary.summary}</p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                  <p className={labelCls}>Key Points</p>
                  <ul className="space-y-2">
                    {summary.keyPoints.map((pt, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm">
                        <span className="w-5 h-5 rounded-full bg-primary/12 text-primary text-[10px] font-black flex items-center justify-center mt-0.5 shrink-0">{i + 1}</span>
                        <span className="leading-relaxed">{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <button onClick={() => { setSummary(null); setPastedEmail(""); }}
                  className="w-full py-3 rounded-2xl bg-muted hover:bg-muted/80 text-sm font-bold transition-all active:scale-[0.98]">Summarize another</button>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  /* ── Compose mode ── */
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between bg-background/50">
        <h2 className="font-black text-[14px] tracking-tight">AI Compose</h2>
        <div className="flex items-center gap-3">
          {smtpStatus?.configured && (
            <div className="flex items-center gap-1 text-[11px] text-emerald-500 font-semibold">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> SMTP ready
            </div>
          )}
          <button onClick={() => setMode("summarize")} className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground font-semibold transition-all">
            <MailOpen className="w-3.5 h-3.5" /> Summarize
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {!generated ? (
          <div className="p-5 space-y-4">
            <div>
              <label className={labelCls}>Tone</label>
              <div className="flex flex-wrap gap-1.5">
                {TONES.map(t => (
                  <button key={t.id} onClick={() => setTone(t.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${tone === t.id ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-muted/40 border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"}`}>
                    {t.emoji} {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>To</label>
              <input value={to} onChange={e => setTo(e.target.value)} placeholder="recipient@example.com" type="email" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>What should this email say?</label>
              <textarea value={context} onChange={e => setContext(e.target.value)}
                onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleGenerate(); }}
                placeholder="Describe the email purpose, key points, specific requests…" rows={5} className={textareaCls}
              />
              <p className="text-[11px] text-muted-foreground/60 mt-1.5">⌘ + Enter to generate</p>
            </div>
            <button onClick={handleGenerate} disabled={!context.trim() || generate.isPending}
              className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground text-sm font-black disabled:opacity-40 hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-[0.98]">
              {generate.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Writing…</> : <><Sparkles className="w-4 h-4" /> Generate Email</>}
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
              <Check className="w-3.5 h-3.5" /> Email generated — edit, send, or save
            </div>

            {/* Send result feedback */}
            {sendResult && (
              <div className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl text-xs font-bold border ${sendResult.ok ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-destructive/10 border-destructive/20 text-destructive"}`}>
                {sendResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                {sendResult.msg}
              </div>
            )}

            <div>
              <label className={labelCls}>To <span className="text-destructive">*</span></label>
              <input value={editedTo} onChange={e => setEditedTo(e.target.value)} placeholder="recipient@example.com" type="email" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Subject</label>
              <input value={editedSubject} onChange={e => setEditedSubject(e.target.value)} className={inputCls} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={labelCls + " !mb-0"}>Body</label>
                <CopyButton text={`To: ${editedTo}\nSubject: ${editedSubject}\n\n${editedBody}`} />
              </div>
              <textarea value={editedBody} onChange={e => setEditedBody(e.target.value)} rows={10} className={textareaCls} />
            </div>

            {/* SMTP not configured warning */}
            {!smtpStatus?.configured && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                <Settings className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span><span className="font-bold">SMTP not configured.</span> Add <code className="font-mono">SMTP_USER</code> and <code className="font-mono">SMTP_PASS</code> to your environment secrets to enable sending.</span>
              </div>
            )}

            <div className="flex gap-2">
              {/* Send Now */}
              <button onClick={handleSend}
                disabled={!editedTo || !editedSubject || !editedBody || sendEmail.isPending || !smtpStatus?.configured}
                title={!smtpStatus?.configured ? "Configure SMTP to send emails" : ""}
                className="flex-1 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-600/90 text-white text-sm font-black disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 active:scale-[0.98]">
                {sendEmail.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Send className="w-4 h-4" /> Send Now</>}
              </button>
              {/* Save Draft */}
              <button onClick={handleSave} disabled={!editedSubject || !editedBody || save.isPending}
                className="py-3.5 px-4 rounded-2xl bg-primary/15 hover:bg-primary/25 text-primary text-sm font-black disabled:opacity-40 transition-all flex items-center justify-center gap-2 border border-primary/20 active:scale-[0.98]">
                {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              </button>
              {/* Redo */}
              <button onClick={() => { setGenerated(null); setEditedBody(""); setEditedSubject(""); setSendResult(null); }}
                className="px-4 py-3.5 rounded-2xl bg-muted hover:bg-muted/80 text-sm font-bold transition-all active:scale-[0.98]">↺</button>
            </div>
            {smtpStatus?.configured && (
              <p className="text-[11px] text-muted-foreground/50 text-center">From: {smtpStatus.from}</p>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

/* ── Drafts list ── */
function DraftsList({ drafts, isLoading, selectedId, onSelect, search, setSearch }: {
  drafts: Draft[]; isLoading: boolean; selectedId: number | null;
  onSelect: (d: Draft) => void; search: string; setSearch: (s: string) => void;
}) {
  const filtered = drafts.filter(d =>
    d.subject.toLowerCase().includes(search.toLowerCase()) ||
    (d.recipient ?? "").toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 border-b border-border/60">
        <div className="relative">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search drafts…"
            className="w-full h-9 pl-4 pr-8 rounded-xl border border-input bg-muted/40 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>}
        </div>
      </div>
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-3 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl shimmer" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 px-4 text-center text-muted-foreground">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4"><Mail className="w-5 h-5 text-red-400 opacity-60" /></div>
            <p className="text-sm font-semibold text-foreground/50">{search ? "No drafts match" : "No saved drafts yet"}</p>
            <p className="text-xs mt-1 opacity-50">Use AI Compose to write your first email</p>
          </div>
        ) : (
          <div className="py-2 px-2 space-y-1">
            {filtered.map(draft => (
              <button key={draft.id} onClick={() => onSelect(draft)}
                className={`w-full text-left px-3 py-3 rounded-xl transition-all group ${selectedId === draft.id ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/50 border border-transparent"}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-[13px] truncate">{draft.subject}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    {draft.status === "sent" && <span className="text-[9px] font-black uppercase tracking-wider text-emerald-500">Sent</span>}
                    <ChevronRight className={`w-3.5 h-3.5 mt-0.5 ${selectedId === draft.id ? "text-primary" : "text-muted-foreground opacity-0 group-hover:opacity-100"}`} />
                  </div>
                </div>
                {draft.recipient && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">To: {draft.recipient}</p>}
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">{formatDistanceToNow(new Date(draft.createdAt), { addSuffix: true })}</p>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
      <div className="px-4 py-2.5 border-t border-border/40">
        <p className="text-[11px] text-muted-foreground/60 text-center">{drafts.length} email{drafts.length !== 1 ? "s" : ""}</p>
      </div>
    </div>
  );
}

/* ── Main ── */
export default function Email() {
  const isMobile = useIsMobile();
  const { data: drafts = [], isLoading } = useDrafts();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [mobileTab, setMobileTab] = useState<"compose" | "drafts">("compose");
  const [mobileViewDraft, setMobileViewDraft] = useState(false);

  const selected = drafts.find(d => d.id === selectedId) ?? null;

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
        <div className="px-5 pt-7 pb-0">
          <h1 className="text-[28px] font-black tracking-tight leading-none mb-4">Email</h1>
          <div className="flex gap-1.5">
            {(["compose", "drafts"] as const).map(t => (
              <button key={t} onClick={() => setMobileTab(t)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all capitalize ${mobileTab === t ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground"}`}>
                {t === "drafts" ? `Drafts (${drafts.length})` : "Compose"}
              </button>
            ))}
          </div>
          <div className="h-px bg-border/60 mt-4" />
        </div>
        <div className="flex-1 overflow-hidden">
          {mobileTab === "compose"
            ? <ComposePanel onSaved={d => { setSelectedId(d.id); setMobileTab("drafts"); setMobileViewDraft(true); }} />
            : <DraftsList drafts={drafts} isLoading={isLoading} selectedId={selectedId} onSelect={d => { setSelectedId(d.id); setMobileViewDraft(true); }} search={search} setSearch={setSearch} />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <div className="w-72 shrink-0 border-r border-border flex flex-col bg-sidebar">
        <div className="px-5 pt-6 pb-4 border-b border-border/60">
          <h1 className="text-[22px] font-black tracking-tight leading-none mb-0.5">Email</h1>
          <p className="text-[12px] text-muted-foreground">AI compose & send</p>
        </div>
        <DraftsList drafts={drafts} isLoading={isLoading} selectedId={selectedId} onSelect={d => setSelectedId(d.id)} search={search} setSearch={setSearch} />
      </div>
      <div className="flex-1 border-r border-border overflow-hidden">
        {selected ? <DraftDetail draft={selected} onDelete={() => setSelectedId(null)} /> : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-xl shadow-red-500/20">
              <Mail className="w-7 h-7 text-white" />
            </div>
            <div className="text-center">
              <p className="font-black text-base text-foreground/60 tracking-tight">Select an email</p>
              <p className="text-[12px] mt-1 opacity-50">or compose a new one with AI →</p>
            </div>
          </div>
        )}
      </div>
      <div className="w-[360px] shrink-0 overflow-hidden border-l border-border">
        <ComposePanel onSaved={d => setSelectedId(d.id)} />
      </div>
    </div>
  );
}
