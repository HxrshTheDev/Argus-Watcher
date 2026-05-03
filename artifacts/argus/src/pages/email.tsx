import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow, format, isToday, isThisYear } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Mail, Sparkles, Trash2, Copy, Check, Loader2, FileText,
  ChevronRight, X, ArrowRight, MailOpen, ChevronLeft, Send,
  Settings, CheckCircle2, AlertCircle, Inbox, RefreshCw, Reply,
  WifiOff, Eye, AlignLeft,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ── Types ── */
interface Draft   { id: number; subject: string; body: string; recipient?: string | null; context?: string | null; status: string; createdAt: string; }
interface Generated { subject: string; body: string }
interface Summary   { summary: string; keyPoints: string[]; actionRequired: boolean }
interface SmtpStatus { configured: boolean; imapConfigured: boolean; from: string | null }
interface InboxEmail { uid: number; from: { name: string; address: string }; subject: string; date: string; snippet: string; seen: boolean; }
interface InboxEmailDetail extends InboxEmail { to: string; text: string; html: string | null; }
interface InboxData { emails: InboxEmail[]; unread: number; configured: boolean; error?: string }
interface ReplyTo { to: string; subject: string; originalText?: string }

type TriageLabel = "action" | "fyi" | "newsletter" | "other";
const TRIAGE_META: Record<TriageLabel, { label: string; emoji: string; color: string; accent: string }> = {
  action:     { label: "Action",     emoji: "🔴", color: "text-orange-400 bg-orange-400/10 border-orange-400/20", accent: "rgb(251,146,60)"  },
  fyi:        { label: "Info",       emoji: "💬", color: "text-blue-400 bg-blue-400/10 border-blue-400/20",       accent: "rgb(96,165,250)"  },
  newsletter: { label: "Newsletter", emoji: "📰", color: "text-purple-400 bg-purple-400/10 border-purple-400/20", accent: "rgb(167,139,250)" },
  other:      { label: "Other",      emoji: "📌", color: "text-muted-foreground bg-muted/30 border-border",        accent: "transparent"      },
};

const TONES = [
  { id: "professional", label: "Professional", emoji: "💼" },
  { id: "casual",       label: "Casual",       emoji: "😊" },
  { id: "formal",       label: "Formal",       emoji: "🎩" },
  { id: "friendly",     label: "Friendly",     emoji: "👋" },
  { id: "assertive",    label: "Assertive",    emoji: "🎯" },
];

/* ── Helpers ── */
function fmtDate(iso: string) {
  const d = new Date(iso);
  if (isToday(d))      return format(d, "h:mm a");
  if (isThisYear(d))   return format(d, "MMM d");
  return format(d, "MMM d, yyyy");
}

/* ── Hooks ── */
function useDrafts()     { return useQuery<Draft[]>({ queryKey: ["email-drafts"], queryFn: async () => { const r = await fetch(`${BASE}/api/emails`); return r.json(); } }); }
function useSmtpStatus() { return useQuery<SmtpStatus>({ queryKey: ["smtp-status"], queryFn: async () => { const r = await fetch(`${BASE}/api/emails/smtp-status`); return r.json(); }, staleTime: 60_000 }); }

function useInbox(refreshKey = 0) {
  return useQuery<InboxData>({
    queryKey: ["inbox", refreshKey],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/emails/inbox${refreshKey > 0 ? "?refresh=1" : ""}`);
      if (!r.ok) { const e = await r.json().catch(() => ({})); return { emails: [], unread: 0, configured: true, error: e?.error ?? "Failed" }; }
      return r.json();
    },
    staleTime: 3 * 60_000,
    retry: 1,
  });
}

function useEmailBody(uid: number | null) {
  return useQuery<InboxEmailDetail>({
    queryKey: ["inbox-email", uid],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/emails/inbox/${uid}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Failed");
      return r.json();
    },
    enabled: uid !== null,
    staleTime: 10 * 60_000,
  });
}

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
      const json = await r.json(); if (!r.ok) throw json; return json;
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
function useReply() {
  return useMutation<{ success: boolean }, Error, { to: string; subject: string; body: string }>({
    mutationFn: async (d) => {
      const r = await fetch(`${BASE}/api/emails/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      const json = await r.json(); if (!r.ok) throw json; return json;
    },
  });
}

/* ── Filter chip ── */
function FilterChip({ label, count, active, onClick, emoji }: { label: string; count: number; active: boolean; onClick: () => void; emoji?: string; }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all border ${active ? "bg-primary/12 text-primary border-primary/25" : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-transparent"}`}>
      {emoji && <span>{emoji}</span>}
      {label}
      <span className={`rounded-full px-1 min-w-[14px] text-center text-[9px] ${active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>{count}</span>
    </button>
  );
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

/* ── Inbox List ── */
function InboxList({ emails, isLoading, error, selectedUid, onSelect, refreshing, onRefresh, notConfigured, triageLabels = {}, triageLoading = false }: {
  emails: InboxEmail[]; isLoading: boolean; error?: string;
  selectedUid: number | null; onSelect: (e: InboxEmail) => void;
  refreshing: boolean; onRefresh: () => void; notConfigured: boolean;
  triageLabels?: Record<number, TriageLabel>; triageLoading?: boolean;
}) {
  const [filter, setFilter] = useState<"all" | TriageLabel>("all");

  if (notConfigured) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-5 text-center gap-3 pb-10">
        <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center"><WifiOff className="w-5 h-5 text-muted-foreground" /></div>
        <div>
          <p className="font-bold text-sm text-foreground/70">SMTP not configured</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Add <code className="font-mono text-primary">SMTP_USER</code> and <code className="font-mono text-primary">SMTP_PASS</code> to enable Gmail inbox</p>
        </div>
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <p className="text-xs font-semibold">Connecting to Gmail…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-5 text-center gap-3 pb-10">
        <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center"><AlertCircle className="w-5 h-5 text-destructive" /></div>
        <div>
          <p className="font-bold text-sm text-foreground/70">Connection failed</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{error}</p>
        </div>
        <button onClick={onRefresh} className="px-4 py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-all">Retry</button>
      </div>
    );
  }
  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center pb-10">
        <div className="w-12 h-12 rounded-2xl bg-primary/8 flex items-center justify-center mb-3"><Inbox className="w-5 h-5 text-primary/60" /></div>
        <p className="text-sm font-semibold text-foreground/50">Inbox is empty</p>
      </div>
    );
  }

  /* Triage counts */
  const counts = { action: 0, fyi: 0, newsletter: 0, other: 0 } as Record<TriageLabel, number>;
  for (const uid in triageLabels) counts[triageLabels[Number(uid)]]++;
  const hasTriage = Object.keys(triageLabels).length > 0;

  /* Filtered list */
  const visible = filter === "all" ? emails : emails.filter(e => triageLabels[e.uid] === filter);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Filter chips */}
      {(hasTriage || triageLoading) && (
        <div className="flex items-center gap-1 px-2 pt-2 pb-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <FilterChip label="All" count={emails.length} active={filter === "all"} onClick={() => setFilter("all")} />
          {(["action", "fyi", "newsletter", "other"] as TriageLabel[]).map(cat =>
            counts[cat] > 0 ? (
              <FilterChip key={cat} label={TRIAGE_META[cat].label} count={counts[cat]}
                active={filter === cat} emoji={TRIAGE_META[cat].emoji} onClick={() => setFilter(cat)} />
            ) : null
          )}
          {triageLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground shrink-0 ml-0.5" />}
        </div>
      )}

      <ScrollArea className="flex-1">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            <p className="text-sm font-semibold">No {TRIAGE_META[filter as TriageLabel]?.label.toLowerCase()} emails</p>
          </div>
        ) : (
          <div className="py-1.5 px-2 space-y-0.5">
            {visible.map(email => {
              const label = triageLabels[email.uid] as TriageLabel | undefined;
              const meta = label ? TRIAGE_META[label] : null;
              return (
                <button key={email.uid} onClick={() => onSelect(email)}
                  className={`relative w-full text-left px-3 py-2.5 rounded-xl transition-all group overflow-hidden ${selectedUid === email.uid ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/50 border border-transparent"}`}>
                  {/* Left accent bar */}
                  {meta && meta.accent !== "transparent" && (
                    <div className="absolute left-0 top-[6px] bottom-[6px] w-[3px] rounded-full" style={{ background: meta.accent }} />
                  )}
                  <div className="flex items-start gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${!email.seen ? "bg-primary" : ""}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className={`text-[13px] truncate ${!email.seen ? "font-bold" : "font-medium text-foreground/70"}`}>
                          {email.from.name || email.from.address}
                        </p>
                        <p className="text-[11px] text-muted-foreground/60 shrink-0">{fmtDate(email.date)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className={`text-[12px] truncate flex-1 ${!email.seen ? "font-semibold" : "text-muted-foreground"}`}>{email.subject}</p>
                        {meta && (
                          <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full border shrink-0 ${meta.color}`}>
                            {meta.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

/* ── Inbox Detail ── */
function InboxDetail({ uid, onReply, onBack }: { uid: number; onReply: (r: ReplyTo) => void; onBack?: () => void }) {
  const { data: email, isLoading, error } = useEmailBody(uid);
  const [showHtml, setShowHtml] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeH, setIframeH] = useState(400);

  const wrappedHtml = email?.html
    ? `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;padding:20px;margin:0;line-height:1.6;word-break:break-word;overflow-wrap:break-word;max-width:100%}img{max-width:100%;height:auto}a{color:inherit}</style></head><body>${email.html}</body></html>`
    : null;

  function handleIframeLoad() {
    try {
      const h = iframeRef.current?.contentDocument?.body?.scrollHeight;
      if (h && h > 0) setIframeH(h + 40);
    } catch {}
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        {onBack && (
          <div className="px-5 py-4 border-b border-border/60">
            <button onClick={onBack} className="w-8 h-8 rounded-xl flex items-center justify-center text-primary hover:bg-primary/10 transition-all">
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <p className="text-xs font-semibold">Loading email…</p>
        </div>
      </div>
    );
  }

  if (error || !email) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 text-muted-foreground">
        <AlertCircle className="w-5 h-5 text-destructive" />
        <p className="text-sm font-semibold">Failed to load email</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/60 bg-background/80">
        <div className="flex items-start gap-3">
          {onBack && (
            <button onClick={onBack} className="w-8 h-8 rounded-xl flex items-center justify-center text-primary hover:bg-primary/10 transition-all mt-0.5 shrink-0">
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-[15px] leading-tight tracking-tight">{email.subject}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5">
              <p className="text-[12px] text-muted-foreground">
                <span className="font-semibold text-foreground/70">{email.from.name || email.from.address}</span>
                {email.from.name && <span className="opacity-60"> &lt;{email.from.address}&gt;</span>}
              </p>
              <p className="text-[11px] text-muted-foreground/50">{format(new Date(email.date), "MMM d, yyyy h:mm a")}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <CopyButton text={`From: ${email.from.address}\nSubject: ${email.subject}\n\n${email.text}`} />
            <button
              onClick={() => onReply({ to: email.from.address, subject: email.subject, originalText: email.text })}
              className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-all">
              <Reply className="w-3.5 h-3.5" /> Reply
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <ScrollArea className="flex-1">
        <div className="p-5">
          {/* Toggle view */}
          {email.html && (
            <div className="flex items-center gap-1 mb-4">
              <button onClick={() => setShowHtml(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${showHtml ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
                <Eye className="w-3 h-3" /> Formatted
              </button>
              <button onClick={() => setShowHtml(false)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${!showHtml ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
                <AlignLeft className="w-3 h-3" /> Plain text
              </button>
            </div>
          )}

          {/* Content */}
          {email.html && showHtml ? (
            <div className="rounded-2xl border border-border overflow-hidden bg-white">
              <iframe
                ref={iframeRef}
                srcDoc={wrappedHtml!}
                sandbox="allow-same-origin"
                className="w-full border-0 block"
                style={{ height: iframeH }}
                title="Email content"
                onLoad={handleIframeLoad}
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card/60 p-5 text-sm leading-relaxed whitespace-pre-wrap font-[inherit]">
              {email.text || "(no plain text version)"}
            </div>
          )}

          {/* Reply bar */}
          <div className="mt-5 pt-5 border-t border-border/40">
            <button
              onClick={() => onReply({ to: email.from.address, subject: email.subject, originalText: email.text })}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 text-sm font-bold transition-all text-muted-foreground hover:text-primary">
              <Reply className="w-4 h-4" /> Reply to {email.from.name || email.from.address}
            </button>
          </div>
        </div>
      </ScrollArea>
    </div>
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
function ComposePanel({ onSaved, replyTo, onClearReply }: { onSaved: (draft: Draft) => void; replyTo?: ReplyTo | null; onClearReply?: () => void }) {
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
  const reply       = useReply();
  const { data: smtpStatus } = useSmtpStatus();

  /* Pre-fill when replyTo changes */
  useEffect(() => {
    if (!replyTo) return;
    setMode("compose");
    setGenerated(null);
    setTo(replyTo.to);
    setEditedTo(replyTo.to);
    const reSubject = replyTo.subject.match(/^re:/i) ? replyTo.subject : `Re: ${replyTo.subject}`;
    setEditedSubject(reSubject);
    setContext(replyTo.originalText ? `Reply to this email:\n\n${replyTo.originalText.slice(0, 600)}` : "Write a thoughtful reply");
  }, [replyTo]);

  const inputCls    = "w-full h-11 px-3.5 rounded-xl border border-input bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all font-medium";
  const textareaCls = "w-full px-3.5 py-3 rounded-xl border border-input bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none leading-relaxed";
  const labelCls    = "text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1.5";

  const handleGenerate = async () => {
    if (!context.trim()) return;
    const result = await generate.mutateAsync({ context, recipient: to, tone });
    if (!editedTo) setEditedTo(to);
    if (!editedSubject && result.subject) {
      const pre = replyTo && !replyTo.subject.match(/^re:/i) ? "Re: " : "";
      setEditedSubject(pre + result.subject);
    }
    setGenerated(result); setEditedBody(result.body);
  };

  const handleSave = async () => {
    if (!editedBody || !editedSubject) return;
    const draft = await save.mutateAsync({ subject: editedSubject, body: editedBody, recipient: editedTo, context });
    onSaved(draft);
    reset();
  };

  const handleSend = async () => {
    if (!editedTo || !editedSubject || !editedBody) return;
    setSendResult(null);
    try {
      if (replyTo) {
        await reply.mutateAsync({ to: editedTo, subject: editedSubject, body: editedBody });
      } else {
        await sendEmail.mutateAsync({ to: editedTo, subject: editedSubject, body: editedBody });
      }
      setSendResult({ ok: true, msg: `Sent to ${editedTo}` });
      if (replyTo && onClearReply) onClearReply();
    } catch (err: any) {
      setSendResult({ ok: false, msg: err?.error ?? err?.message ?? "Failed to send" });
    }
  };

  function reset() {
    setGenerated(null); setEditedBody(""); setEditedSubject(""); setContext(""); setTo(""); setEditedTo(""); setSendResult(null);
    if (onClearReply) onClearReply();
  }

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
  const isSendingReply = !!(replyTo && (reply.isPending || sendEmail.isPending));
  const isSending = reply.isPending || sendEmail.isPending;

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between bg-background/50">
        <div className="flex items-center gap-2">
          <h2 className="font-black text-[14px] tracking-tight">AI Compose</h2>
          {replyTo && (
            <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-bold border border-blue-500/20">
              <Reply className="w-2.5 h-2.5" /> Reply
            </span>
          )}
        </div>
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
              <label className={labelCls}>{replyTo ? "Instructions for AI reply" : "What should this email say?"}</label>
              <textarea value={context} onChange={e => setContext(e.target.value)}
                onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleGenerate(); }}
                placeholder={replyTo ? "e.g. Politely decline, confirm availability, ask for more info…" : "Describe the email purpose, key points, specific requests…"} rows={5} className={textareaCls}
              />
              <p className="text-[11px] text-muted-foreground/60 mt-1.5">⌘ + Enter to generate</p>
            </div>
            <button onClick={handleGenerate} disabled={!context.trim() || generate.isPending}
              className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground text-sm font-black disabled:opacity-40 hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-[0.98]">
              {generate.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Writing…</> : <><Sparkles className="w-4 h-4" /> {replyTo ? "Generate Reply" : "Generate Email"}</>}
            </button>
            {replyTo && (
              <button onClick={reset} className="w-full py-2.5 rounded-2xl bg-muted hover:bg-muted/80 text-sm font-bold transition-all text-muted-foreground active:scale-[0.98]">
                Clear reply
              </button>
            )}
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
              <Check className="w-3.5 h-3.5" /> {replyTo ? "Reply ready — edit and send" : "Email generated — edit, send, or save"}
            </div>
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
            {!smtpStatus?.configured && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                <Settings className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span><span className="font-bold">SMTP not configured.</span> Add <code className="font-mono">SMTP_USER</code> and <code className="font-mono">SMTP_PASS</code> to your environment secrets to enable sending.</span>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={handleSend}
                disabled={!editedTo || !editedSubject || !editedBody || isSending || !smtpStatus?.configured}
                title={!smtpStatus?.configured ? "Configure SMTP to send emails" : ""}
                className="flex-1 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-600/90 text-white text-sm font-black disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 active:scale-[0.98]">
                {isSending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Send className="w-4 h-4" /> {replyTo ? "Send Reply" : "Send Now"}</>}
              </button>
              {!replyTo && (
                <button onClick={handleSave} disabled={!editedSubject || !editedBody || save.isPending}
                  className="py-3.5 px-4 rounded-2xl bg-primary/15 hover:bg-primary/25 text-primary text-sm font-black disabled:opacity-40 transition-all flex items-center justify-center gap-2 border border-primary/20 active:scale-[0.98]">
                  {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                </button>
              )}
              <button onClick={reset}
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
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search drafts…"
            className="w-full h-8 pl-3.5 pr-8 rounded-xl border border-input bg-muted/40 text-[12px] focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>}
        </div>
      </div>
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-3 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-xl shimmer" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center text-muted-foreground">
            <div className="w-10 h-10 rounded-2xl bg-red-500/10 flex items-center justify-center mb-3"><Mail className="w-4 h-4 text-red-400 opacity-60" /></div>
            <p className="text-[13px] font-semibold text-foreground/50">{search ? "No drafts match" : "No saved drafts yet"}</p>
            <p className="text-[11px] mt-1 opacity-50">Use AI Compose to write your first email</p>
          </div>
        ) : (
          <div className="py-1 px-2 space-y-0.5">
            {filtered.map(draft => (
              <button key={draft.id} onClick={() => onSelect(draft)}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-all group ${selectedId === draft.id ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/50 border border-transparent"}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-[12px] truncate">{draft.subject}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    {draft.status === "sent" && <span className="text-[9px] font-black uppercase tracking-wider text-emerald-500">Sent</span>}
                    <ChevronRight className={`w-3.5 h-3.5 mt-0.5 ${selectedId === draft.id ? "text-primary" : "text-muted-foreground opacity-0 group-hover:opacity-100"}`} />
                  </div>
                </div>
                {draft.recipient && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">To: {draft.recipient}</p>}
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">{formatDistanceToNow(new Date(draft.createdAt), { addSuffix: true })}</p>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
      <div className="px-4 py-2 border-t border-border/40">
        <p className="text-[10px] text-muted-foreground/60 text-center">{drafts.length} email{drafts.length !== 1 ? "s" : ""}</p>
      </div>
    </div>
  );
}

/* ── Main ── */
export default function Email() {
  const isMobile = useIsMobile();
  const { data: drafts = [], isLoading: draftsLoading } = useDrafts();

  /* Inbox state */
  const [inboxRefreshKey, setInboxRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const { data: inboxData, isLoading: inboxLoading } = useInbox(inboxRefreshKey);
  const inboxEmails = inboxData?.emails ?? [];
  const inboxUnread = inboxData?.unread ?? 0;
  const inboxError  = inboxData?.error;
  const inboxConfigured = inboxData?.configured ?? true;

  /* Triage state */
  const [triageLabels, setTriageLabels] = useState<Record<number, TriageLabel>>({});
  const [triageLoading, setTriageLoading] = useState(false);
  const triagingRef = useRef(false);

  useEffect(() => {
    if (inboxEmails.length === 0 || triagingRef.current) return;
    const untriaged = inboxEmails.filter(e => !(e.uid in triageLabels));
    if (untriaged.length === 0) return;
    triagingRef.current = true;
    setTriageLoading(true);
    fetch(`${BASE}/api/emails/triage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails: untriaged.map(e => ({ uid: e.uid, from: e.from.name || e.from.address, subject: e.subject })) }),
    })
      .then(r => r.json())
      .then(({ labels }: { labels: Record<string, TriageLabel> }) => {
        setTriageLabels(prev => {
          const next = { ...prev };
          for (const [uid, label] of Object.entries(labels)) next[Number(uid)] = label;
          return next;
        });
      })
      .catch(() => {})
      .finally(() => { setTriageLoading(false); triagingRef.current = false; });
  }, [inboxEmails.length, inboxRefreshKey]);

  /* Selection state */
  const [leftTab, setLeftTab] = useState<"inbox" | "drafts">("inbox");
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<number | null>(null);
  const [draftSearch, setDraftSearch] = useState("");
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);

  /* Mobile state */
  const [mobileTab, setMobileTab] = useState<"inbox" | "compose" | "drafts">("inbox");
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  const selectedDraft = drafts.find(d => d.id === selectedDraftId) ?? null;

  function handleRefresh() {
    setTriageLabels({});
    setRefreshing(true);
    setInboxRefreshKey(k => k + 1);
    setTimeout(() => setRefreshing(false), 3000);
  }

  function handleReply(r: ReplyTo) {
    setReplyTo(r);
  }

  /* ── Mobile ── */
  if (isMobile) {
    if (mobileView === "detail") {
      if (mobileTab === "inbox" && selectedUid !== null) {
        return (
          <div className="flex flex-col h-full bg-background">
            <InboxDetail uid={selectedUid} onReply={r => { setReplyTo(r); setMobileTab("compose"); setMobileView("list"); }} onBack={() => setMobileView("list")} />
          </div>
        );
      }
      if (mobileTab === "drafts" && selectedDraft) {
        return (
          <div className="flex flex-col h-full bg-background">
            <DraftDetail draft={selectedDraft} onDelete={() => { setSelectedDraftId(null); setMobileView("list"); }} onBack={() => setMobileView("list")} />
          </div>
        );
      }
    }
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="px-5 pt-7 pb-0">
          <h1 className="text-[28px] font-black tracking-tight leading-none mb-4">Email</h1>
          <div className="flex gap-1.5">
            {(["inbox", "compose", "drafts"] as const).map(t => (
              <button key={t} onClick={() => setMobileTab(t)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all capitalize relative ${mobileTab === t ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground"}`}>
                {t === "inbox" ? `Inbox${inboxUnread > 0 ? ` (${inboxUnread})` : ""}` : t === "drafts" ? `Drafts (${drafts.length})` : "Compose"}
              </button>
            ))}
          </div>
          <div className="h-px bg-border/60 mt-4" />
        </div>
        <div className="flex-1 overflow-hidden">
          {mobileTab === "inbox" && (
            <InboxList emails={inboxEmails} isLoading={inboxLoading} error={inboxError}
              selectedUid={selectedUid} onSelect={e => { setSelectedUid(e.uid); setMobileView("detail"); }}
              refreshing={refreshing} onRefresh={handleRefresh} notConfigured={!inboxConfigured}
              triageLabels={triageLabels} triageLoading={triageLoading} />
          )}
          {mobileTab === "compose" && (
            <ComposePanel onSaved={d => { setSelectedDraftId(d.id); setMobileTab("drafts"); setMobileView("detail"); }}
              replyTo={replyTo} onClearReply={() => setReplyTo(null)} />
          )}
          {mobileTab === "drafts" && (
            <DraftsList drafts={drafts} isLoading={draftsLoading} selectedId={selectedDraftId}
              onSelect={d => { setSelectedDraftId(d.id); setMobileView("detail"); }}
              search={draftSearch} setSearch={setDraftSearch} />
          )}
        </div>
      </div>
    );
  }

  /* ── Desktop ── */
  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* Left panel */}
      <div className="w-72 shrink-0 border-r border-border flex flex-col bg-sidebar">
        {/* Header */}
        <div className="px-4 pt-5 pb-3 border-b border-border/60">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-[20px] font-black tracking-tight leading-none">Email</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">Inbox & drafts</p>
            </div>
            {leftTab === "inbox" && (
              <button onClick={handleRefresh} disabled={refreshing || inboxLoading}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all disabled:opacity-40">
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing || inboxLoading ? "animate-spin" : ""}`} />
              </button>
            )}
          </div>
          {/* Tabs */}
          <div className="flex gap-1 p-0.5 rounded-xl bg-muted/50 border border-border/40">
            <button onClick={() => setLeftTab("inbox")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[10px] text-xs font-bold transition-all ${leftTab === "inbox" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <Inbox className="w-3.5 h-3.5" />
              Inbox
              {inboxUnread > 0 && (
                <span className="min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-black flex items-center justify-center">{inboxUnread}</span>
              )}
            </button>
            <button onClick={() => setLeftTab("drafts")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[10px] text-xs font-bold transition-all ${leftTab === "drafts" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <FileText className="w-3.5 h-3.5" />
              Drafts
              {drafts.length > 0 && (
                <span className="min-w-[16px] h-4 px-1 rounded-full bg-muted-foreground/20 text-muted-foreground text-[10px] font-black flex items-center justify-center">{drafts.length}</span>
              )}
            </button>
          </div>
        </div>

        {leftTab === "inbox" ? (
          <InboxList emails={inboxEmails} isLoading={inboxLoading} error={inboxError}
            selectedUid={selectedUid} onSelect={e => { setSelectedUid(e.uid); setSelectedDraftId(null); }}
            refreshing={refreshing} onRefresh={handleRefresh} notConfigured={!inboxConfigured}
            triageLabels={triageLabels} triageLoading={triageLoading} />
        ) : (
          <DraftsList drafts={drafts} isLoading={draftsLoading} selectedId={selectedDraftId}
            onSelect={d => { setSelectedDraftId(d.id); setSelectedUid(null); }}
            search={draftSearch} setSearch={setDraftSearch} />
        )}
      </div>

      {/* Middle panel */}
      <div className="flex-1 border-r border-border overflow-hidden">
        {leftTab === "inbox" && selectedUid !== null ? (
          <InboxDetail uid={selectedUid} onReply={handleReply} />
        ) : leftTab === "drafts" && selectedDraft ? (
          <DraftDetail draft={selectedDraft} onDelete={() => setSelectedDraftId(null)} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4">
            <div className={`w-16 h-16 rounded-3xl bg-gradient-to-br ${leftTab === "inbox" ? "from-blue-500 to-indigo-600 shadow-blue-500/20" : "from-red-500 to-rose-600 shadow-red-500/20"} flex items-center justify-center shadow-xl`}>
              {leftTab === "inbox" ? <Inbox className="w-7 h-7 text-white" /> : <Mail className="w-7 h-7 text-white" />}
            </div>
            <div className="text-center">
              <p className="font-black text-base text-foreground/60 tracking-tight">
                {leftTab === "inbox" ? "Select an email to read" : "Select a draft"}
              </p>
              <p className="text-[12px] mt-1 opacity-50">
                {leftTab === "inbox" ? "or compose a new one with AI →" : "or compose a new one with AI →"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Right panel — Compose */}
      <div className="w-[360px] shrink-0 overflow-hidden border-l border-border">
        <ComposePanel onSaved={d => { setSelectedDraftId(d.id); setLeftTab("drafts"); }}
          replyTo={replyTo} onClearReply={() => setReplyTo(null)} />
      </div>
    </div>
  );
}
