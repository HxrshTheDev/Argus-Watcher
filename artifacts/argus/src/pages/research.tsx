import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDistanceToNow } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookOpen, Plus, Trash2, X, ChevronLeft, Sparkles, FileText,
  Globe, Link2, Copy, Check, Loader2, RotateCcw, Pencil, Save,
  BookMarked, MessageSquare, StickyNote, Wand2, ChevronDown,
  ChevronRight, Search, Upload, AlignLeft, Send, Eraser,
  Image as ImageIcon, FileUp, File as FileIcon, Eye,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ─── Types ─── */
interface NotebookSource { id: number; notebookId: number; title: string; content: string; type: string; url?: string | null; createdAt: string; }
interface NotebookNote   { id: number; notebookId: number; content: string; createdAt: string; updatedAt: string; }
interface ChatMsg        { id: number; notebookId: number; role: string; content: string; citations?: string[] | null; createdAt: string; }
interface Notebook {
  id: number; title: string; emoji: string; description?: string | null;
  createdAt: string; updatedAt: string;
  sources?: NotebookSource[]; notes?: NotebookNote[]; chats?: ChatMsg[];
}

const STUDIO_TYPES = [
  { id: "study-guide", label: "Study Guide", icon: "📚", desc: "Key concepts, definitions & review questions" },
  { id: "faq",         label: "FAQ",         icon: "❓", desc: "Common questions answered from your sources" },
  { id: "timeline",    label: "Timeline",    icon: "📅", desc: "Chronological events extracted from sources" },
  { id: "briefing",    label: "Briefing Doc",icon: "📋", desc: "Executive summary with key findings" },
  { id: "outline",     label: "Outline",     icon: "🗂️", desc: "Hierarchical outline of all topics" },
  { id: "summary",     label: "Summary",     icon: "✨", desc: "Comprehensive summary of all sources" },
] as const;

const NB_EMOJIS = ["📓","📔","📒","📕","📗","📘","📙","🗒️","📄","🔬","💡","🎯","🧠","🔭","⚗️","🌍"];

/* ─── API helpers ─── */
const api = {
  getNotebooks:  ()                    => fetch(`${BASE}/api/notebooks`).then(r=>r.json()),
  getNotebook:   (id:number)           => fetch(`${BASE}/api/notebooks/${id}`).then(r=>r.json()),
  createNotebook:(body:any)            => fetch(`${BASE}/api/notebooks`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(r=>r.json()),
  updateNotebook:(id:number,body:any)  => fetch(`${BASE}/api/notebooks/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(r=>r.json()),
  deleteNotebook:(id:number)           => fetch(`${BASE}/api/notebooks/${id}`,{method:"DELETE"}),
  addSource:     (id:number,body:any)  => fetch(`${BASE}/api/notebooks/${id}/sources`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(r=>r.json()),
  uploadSource:  async (id:number,file:File,title?:string) => {
    const form = new FormData();
    form.append("file", file);
    if (title) form.append("title", title);
    const r = await fetch(`${BASE}/api/notebooks/${id}/sources/upload`,{method:"POST",body:form});
    if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error || "Upload failed"); }
    return r.json();
  },
  deleteSource:  (id:number,sid:number)=> fetch(`${BASE}/api/notebooks/${id}/sources/${sid}`,{method:"DELETE"}),
  createNote:    (id:number,content:string)=> fetch(`${BASE}/api/notebooks/${id}/notes`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content})}).then(r=>r.json()),
  updateNote:    (id:number,nid:number,content:string)=>fetch(`${BASE}/api/notebooks/${id}/notes/${nid}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({content})}).then(r=>r.json()),
  deleteNote:    (id:number,nid:number)=>fetch(`${BASE}/api/notebooks/${id}/notes/${nid}`,{method:"DELETE"}),
  chat:          (id:number,message:string)=>fetch(`${BASE}/api/notebooks/${id}/chat`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message})}).then(r=>r.json()),
  clearChat:     (id:number)           => fetch(`${BASE}/api/notebooks/${id}/chat`,{method:"DELETE"}),
  studio:        (id:number,type:string)=>fetch(`${BASE}/api/notebooks/${id}/studio`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type})}).then(r=>r.json()),
};

/* ─── Hooks ─── */
function useNotebooks() {
  return useQuery<Notebook[]>({ queryKey:["notebooks"], queryFn:api.getNotebooks });
}
function useNotebook(id:number|null) {
  return useQuery<Notebook>({ queryKey:["notebook",id], queryFn:()=>api.getNotebook(id!), enabled:id!=null });
}

/* ─── Copy button ─── */
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={()=>{ navigator.clipboard.writeText(text); setCopied(true); setTimeout(()=>setCopied(false),1800); }}
      className="p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50 transition-all">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500"/> : <Copy className="w-3.5 h-3.5"/>}
    </button>
  );
}

/* ─── Helpers ─── */
type AddTab = "file" | "text" | "url";

interface UploadItem {
  id: string;
  file: File;
  title: string;
  status: "pending" | "processing" | "done" | "error";
  error?: string;
}

function srcTypeIcon(type: string) {
  if (type === "image") return <ImageIcon className="w-3 h-3 text-blue-400"/>;
  if (type === "pdf")   return <FileText  className="w-3 h-3 text-red-400"/>;
  return                       <AlignLeft className="w-3 h-3 text-muted-foreground"/>;
}

function srcTypeBadge(type: string) {
  if (type === "image") return "bg-blue-500/10 text-blue-400 border-blue-500/20";
  if (type === "pdf")   return "bg-red-500/10 text-red-400 border-red-500/20";
  return "bg-muted/50 text-muted-foreground border-border/40";
}

function srcTypeLabel(type: string) {
  if (type === "image") return "Image";
  if (type === "pdf")   return "PDF";
  if (type === "url")   return "Web";
  return "Text";
}

/* ══════════════════════════════════════════
   SOURCES PANEL
══════════════════════════════════════════ */
function SourcesPanel({ notebook, onRefresh }: { notebook: Notebook; onRefresh:()=>void }) {
  const [tab, setTab]           = useState<AddTab>("file");
  const [panelOpen, setPanelOpen] = useState(false);
  const [title, setTitle]       = useState("");
  const [content, setContent]   = useState("");
  const [url, setUrl]           = useState("");
  const [expandedId, setExpandedId] = useState<number|null>(null);
  const [saving, setSaving]     = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads]   = useState<UploadItem[]>([]);
  const fileInputRef            = useRef<HTMLInputElement>(null);
  const dropRef                 = useRef<HTMLDivElement>(null);
  const sources = notebook.sources ?? [];

  /* ── Text/URL add ── */
  const handleAddText = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    await api.addSource(notebook.id, { title: title.trim(), content: content.trim(), type: tab === "url" ? "url" : "text", url: url || undefined });
    setTitle(""); setContent(""); setUrl(""); setPanelOpen(false);
    onRefresh(); setSaving(false);
  };

  /* ── File processing ── */
  const processFiles = useCallback(async (files: File[]) => {
    const supported = files.filter(f =>
      f.type.startsWith("image/") || f.type === "application/pdf" || f.type.startsWith("text/")
    );
    if (!supported.length) return;

    const items: UploadItem[] = supported.map(f => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      title: f.name.replace(/\.[^.]+$/, ""),
      status: "pending",
    }));
    setUploads(prev => [...prev, ...items]);
    setPanelOpen(true);
    setTab("file");

    for (const item of items) {
      setUploads(prev => prev.map(u => u.id === item.id ? { ...u, status: "processing" } : u));
      try {
        await api.uploadSource(notebook.id, item.file, item.title);
        setUploads(prev => prev.map(u => u.id === item.id ? { ...u, status: "done" } : u));
        onRefresh();
      } catch (e: any) {
        setUploads(prev => prev.map(u => u.id === item.id ? { ...u, status: "error", error: e.message } : u));
      }
    }
    // Clean up done items after a moment
    setTimeout(() => setUploads(prev => prev.filter(u => u.status !== "done")), 3000);
  }, [notebook.id, onRefresh]);

  /* ── Drag & drop ── */
  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = (e: React.DragEvent) => { if (!dropRef.current?.contains(e.relatedTarget as Node)) setIsDragging(false); };
  const onDrop      = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    processFiles(Array.from(e.dataTransfer.files));
  };

  const handleDelete = async (sid: number) => {
    await api.deleteSource(notebook.id, sid);
    onRefresh();
  };

  const TABS: { id: AddTab; icon: React.ReactNode; label: string }[] = [
    { id: "file", icon: <FileUp className="w-3.5 h-3.5"/>, label: "File" },
    { id: "text", icon: <AlignLeft className="w-3.5 h-3.5"/>, label: "Text" },
    { id: "url",  icon: <Link2 className="w-3.5 h-3.5"/>,    label: "URL" },
  ];

  return (
    <div className="h-full flex flex-col" ref={dropRef} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-primary/10 border-2 border-dashed border-primary/50 rounded-xl m-1 backdrop-blur-sm animate-in fade-in duration-150 pointer-events-none">
          <FileUp className="w-10 h-10 text-primary mb-2"/>
          <p className="text-sm font-semibold text-primary">Drop files here</p>
          <p className="text-[11px] text-primary/70 mt-1">Images, PDFs, or text files</p>
        </div>
      )}

      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Sources</p>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">{sources.length} added</p>
        </div>
        <button
          onClick={() => setPanelOpen(p => !p)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all
            ${panelOpen ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
          <Plus className="w-3.5 h-3.5"/> Add
        </button>
      </div>

      {/* Add panel */}
      {panelOpen && (
        <div className="px-3 pt-3 pb-2 border-b border-border bg-muted/10 shrink-0 space-y-2 animate-in slide-in-from-top-2 duration-150">
          {/* Tab switcher */}
          <div className="flex gap-1 bg-muted/40 rounded-lg p-0.5">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-semibold transition-all
                  ${tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {/* File upload tab */}
          {tab === "file" && (
            <div className="space-y-2">
              {/* Upload progress items */}
              {uploads.length > 0 && (
                <div className="space-y-1">
                  {uploads.map(u => (
                    <div key={u.id} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[11px]
                      ${u.status === "error" ? "border-red-400/30 bg-red-500/5" :
                        u.status === "done"  ? "border-green-400/30 bg-green-500/5" :
                                               "border-border/60 bg-muted/20"}`}>
                      {u.status === "processing" ? <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0"/> :
                       u.status === "done"        ? <Check    className="w-3 h-3 text-green-500 shrink-0"/> :
                       u.status === "error"       ? <X        className="w-3 h-3 text-red-400 shrink-0"/> :
                                                    <FileIcon  className="w-3 h-3 text-muted-foreground shrink-0"/>}
                      <span className="flex-1 truncate text-muted-foreground">
                        {u.status === "processing" ? `Extracting from ${u.title}…` :
                         u.status === "done"        ? `${u.title} added` :
                         u.status === "error"       ? u.error :
                                                      u.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Drop zone */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-border/60 rounded-xl py-5 px-3 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-primary/5 transition-all group">
                <div className="flex items-center gap-3">
                  <ImageIcon className="w-5 h-5 text-blue-400/70 group-hover:text-blue-400"/>
                  <FileText  className="w-5 h-5 text-red-400/70 group-hover:text-red-400"/>
                  <FileIcon  className="w-5 h-5 text-muted-foreground/50 group-hover:text-muted-foreground"/>
                </div>
                <div className="text-center">
                  <p className="text-[12px] font-semibold">Click to browse or drag & drop</p>
                  <p className="text-[10px] opacity-60 mt-0.5">Images (JPG, PNG, GIF, WebP) · PDF · Text</p>
                  <p className="text-[10px] opacity-50 mt-0.5">Up to 20 MB per file</p>
                </div>
              </button>
              <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,text/*"
                className="hidden" onChange={e => { if (e.target.files) processFiles(Array.from(e.target.files)); e.target.value=""; }}/>

              {/* Supported format pills */}
              <div className="flex flex-wrap gap-1">
                {[["🖼️","Screenshots"],["📄","PDFs"],["📝","Text files"],["🗒️","Notes"]].map(([icon,label])=>(
                  <span key={label} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/50 border border-border/40 text-[10px] text-muted-foreground">
                    {icon} {label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Text tab */}
          {tab === "text" && (
            <div className="space-y-2">
              <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Source title…"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/40"/>
              <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="Paste or type your source content…"
                rows={5} style={{resize:"none"}}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/40"/>
              <div className="flex gap-2">
                <button onClick={()=>{ setPanelOpen(false); setTitle(""); setContent(""); }}
                  className="flex-1 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-all">Cancel</button>
                <button onClick={handleAddText} disabled={!title.trim()||!content.trim()||saving}
                  className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40 hover:bg-primary/90 transition-all flex items-center justify-center gap-1">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin"/> : <Plus className="w-3 h-3"/>} Add
                </button>
              </div>
            </div>
          )}

          {/* URL tab */}
          {tab === "url" && (
            <div className="space-y-2">
              <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Source title…"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/40"/>
              <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="URL (for reference)…"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/40"/>
              <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="Paste the page content here…"
                rows={4} style={{resize:"none"}}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/40"/>
              <div className="flex gap-2">
                <button onClick={()=>{ setPanelOpen(false); setTitle(""); setContent(""); setUrl(""); }}
                  className="flex-1 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-all">Cancel</button>
                <button onClick={handleAddText} disabled={!title.trim()||!content.trim()||saving}
                  className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40 hover:bg-primary/90 transition-all flex items-center justify-center gap-1">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin"/> : <Plus className="w-3 h-3"/>} Add
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sources list */}
      <ScrollArea className="flex-1">
        {sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center text-muted-foreground">
            <div className="flex items-center gap-2 mb-3 opacity-30">
              <ImageIcon className="w-6 h-6 text-blue-400"/>
              <FileText  className="w-6 h-6 text-red-400"/>
              <FileIcon  className="w-5 h-5"/>
            </div>
            <p className="text-sm font-medium">No sources yet</p>
            <p className="text-[11px] mt-1 opacity-60 max-w-[160px]">Upload images, PDFs, or paste text to ground your AI chat</p>
            <button onClick={() => { setPanelOpen(true); setTab("file"); }}
              className="mt-3 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[11px] font-semibold hover:bg-primary/20 transition-all flex items-center gap-1.5">
              <FileUp className="w-3 h-3"/> Upload file
            </button>
          </div>
        ) : (
          <div className="px-2 py-2 space-y-1">
            {sources.map((src, i) => (
              <div key={src.id} className="rounded-xl border border-border/60 bg-card overflow-hidden group/src">
                <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedId(expandedId === src.id ? null : src.id)}>
                  {/* Source number badge */}
                  <div className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-primary">{i + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[13px] font-medium truncate">{src.title}</p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`inline-flex items-center gap-0.5 px-1.5 py-px rounded-full border text-[9px] font-semibold uppercase tracking-wide ${srcTypeBadge(src.type)}`}>
                        {srcTypeIcon(src.type)} {srcTypeLabel(src.type)}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50">{(src.content.length / 1000).toFixed(1)}k chars</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={e => { e.stopPropagation(); handleDelete(src.id); }}
                      className="p-1 rounded opacity-0 group-hover/src:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all">
                      <Trash2 className="w-3 h-3"/>
                    </button>
                    {expandedId === src.id
                      ? <ChevronDown  className="w-3.5 h-3.5 text-muted-foreground"/>
                      : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground"/>}
                  </div>
                </div>
                {expandedId === src.id && (
                  <div className="border-t border-border/40 animate-in slide-in-from-top-1 duration-100">
                    <ScrollArea className="h-40">
                      <p className="px-3 py-3 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap">{src.content}</p>
                    </ScrollArea>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

/* ══════════════════════════════════════════
   CHAT PANEL
══════════════════════════════════════════ */
function ChatPanel({ notebook, onRefresh }: { notebook: Notebook; onRefresh:()=>void }) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chats = notebook.chats ?? [];
  const sources = notebook.sources ?? [];

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [chats.length]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setInput(""); setSending(true);
    await api.chat(notebook.id, msg);
    onRefresh(); setSending(false);
  };

  const handleClear = async () => {
    setClearing(true);
    await api.clearChat(notebook.id);
    onRefresh(); setClearing(false);
  };

  const SUGGESTED = [
    "What are the main themes across all sources?",
    "Summarize the key points in a few sentences",
    "What questions do these sources answer?",
    "Are there any contradictions between sources?",
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">AI Chat</p>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">
            {sources.length > 0 ? `Grounded in ${sources.length} source${sources.length>1?"s":""}` : "Add sources to ground answers"}
          </p>
        </div>
        {chats.length > 0 && (
          <button onClick={handleClear} disabled={clearing} title="Clear chat history"
            className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-all">
            {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Eraser className="w-3.5 h-3.5"/>}
          </button>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="px-4 py-4 space-y-6">
          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <MessageSquare className="w-5 h-5 text-primary"/>
              </div>
              <p className="text-sm font-semibold mb-1">Ask anything about your sources</p>
              <p className="text-[12px] text-muted-foreground mb-6 max-w-xs">
                {sources.length > 0
                  ? "AI answers are grounded in your uploaded sources with inline citations"
                  : "Add sources first — then the AI will answer based only on that content"}
              </p>
              {sources.length > 0 && (
                <div className="w-full max-w-xs space-y-2">
                  {SUGGESTED.map(s => (
                    <button key={s} onClick={()=>{ setInput(s); }}
                      className="w-full text-left px-3 py-2.5 rounded-xl border border-border/60 bg-card text-[12px] text-muted-foreground hover:bg-muted/40 hover:text-foreground hover:border-primary/30 transition-all">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            chats.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role==="user"?"justify-end":""}`}>
                {msg.role==="assistant" && (
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-3 h-3 text-primary"/>
                  </div>
                )}
                <div className={`group max-w-[85%] ${msg.role==="user"?"":"flex-1"}`}>
                  {msg.role==="user" ? (
                    <div className="px-4 py-2.5 rounded-2xl rounded-tr-sm bg-primary text-primary-foreground text-[13px] leading-relaxed">
                      {msg.content}
                    </div>
                  ) : (
                    <div>
                      <div className="chat-prose text-[13px]">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {msg.citations.map((c,i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/8 text-primary text-[10px] font-medium border border-primary/20">
                              <FileText className="w-2.5 h-2.5"/> {c}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <CopyBtn text={msg.content}/>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-3 h-3 text-primary animate-pulse"/>
              </div>
              <div className="flex items-center gap-1.5 py-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{animationDelay:"0ms"}}/>
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{animationDelay:"150ms"}}/>
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{animationDelay:"300ms"}}/>
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="px-3 py-3 border-t border-border shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleSend();} }}
            placeholder="Ask about your sources…"
            rows={1}
            style={{ resize:"none", minHeight:"36px", maxHeight:"120px" }}
            className="flex-1 px-3 py-2 rounded-xl border border-input bg-muted/30 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/50"
          />
          <button onClick={handleSend} disabled={!input.trim()||sending}
            className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-all shrink-0">
            {sending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground/40 mt-1.5 text-center">Shift+Enter for new line</p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   NOTES + STUDIO PANEL
══════════════════════════════════════════ */
function NotesStudioPanel({ notebook, onRefresh }: { notebook: Notebook; onRefresh:()=>void }) {
  const [panel, setPanel] = useState<"notes"|"studio">("notes");
  const [newNote, setNewNote] = useState("");
  const [editId, setEditId] = useState<number|null>(null);
  const [editContent, setEditContent] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [studioResult, setStudioResult] = useState<{type:string;content:string}|null>(null);
  const [generatingType, setGeneratingType] = useState<string|null>(null);
  const notes = notebook.notes ?? [];
  const sources = notebook.sources ?? [];

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setSavingNote(true);
    await api.createNote(notebook.id, newNote.trim());
    setNewNote(""); onRefresh(); setSavingNote(false);
  };

  const handleSaveEdit = async () => {
    if (!editId || !editContent.trim()) return;
    await api.updateNote(notebook.id, editId, editContent.trim());
    setEditId(null); setEditContent(""); onRefresh();
  };

  const handleDeleteNote = async (nid: number) => {
    await api.deleteNote(notebook.id, nid);
    onRefresh();
  };

  const handleStudio = async (type: string) => {
    if (sources.length === 0) return;
    setGeneratingType(type); setStudioResult(null);
    const result = await api.studio(notebook.id, type);
    setStudioResult(result); setGeneratingType(null);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Tab switcher */}
      <div className="px-3 pt-3 pb-0 shrink-0">
        <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
          <button onClick={()=>{setPanel("notes");setStudioResult(null);}}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5
              ${panel==="notes"?"bg-background text-foreground shadow-sm":"text-muted-foreground hover:text-foreground"}`}>
            <StickyNote className="w-3.5 h-3.5"/> Notes
          </button>
          <button onClick={()=>setPanel("studio")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5
              ${panel==="studio"?"bg-background text-foreground shadow-sm":"text-muted-foreground hover:text-foreground"}`}>
            <Wand2 className="w-3.5 h-3.5"/> Studio
          </button>
        </div>
      </div>

      {panel === "notes" ? (
        <>
          <div className="px-3 py-3 shrink-0">
            <div className="flex gap-2">
              <textarea value={newNote} onChange={e=>setNewNote(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter"&&e.metaKey) handleAddNote(); }}
                placeholder="Add a note… (⌘+Enter to save)"
                rows={2} style={{resize:"none"}}
                className="flex-1 px-3 py-2 rounded-xl border border-input bg-muted/30 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/50"/>
              <button onClick={handleAddNote} disabled={!newNote.trim()||savingNote}
                className="w-9 h-9 mt-auto rounded-xl bg-primary/10 text-primary flex items-center justify-center disabled:opacity-40 hover:bg-primary/20 transition-all shrink-0">
                {savingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Plus className="w-3.5 h-3.5"/>}
              </button>
            </div>
          </div>
          <ScrollArea className="flex-1 px-3 pb-3">
            {notes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                <StickyNote className="w-8 h-8 mb-3 opacity-20"/>
                <p className="text-sm">No notes yet</p>
                <p className="text-[11px] opacity-60 mt-1">Capture ideas as you research</p>
              </div>
            ) : (
              <div className="space-y-2">
                {notes.map(note => (
                  <div key={note.id} className="rounded-xl border border-border/60 bg-card p-3 group">
                    {editId === note.id ? (
                      <div className="space-y-2">
                        <textarea value={editContent} onChange={e=>setEditContent(e.target.value)}
                          rows={3} style={{resize:"none"}}
                          className="w-full px-2 py-1.5 rounded-lg border border-input bg-muted/30 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"/>
                        <div className="flex gap-2">
                          <button onClick={()=>{setEditId(null);setEditContent("");}}
                            className="flex-1 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-all">Cancel</button>
                          <button onClick={handleSaveEdit}
                            className="flex-1 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all flex items-center justify-center gap-1">
                            <Save className="w-3 h-3"/> Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{note.content}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[10px] text-muted-foreground/50">
                            {formatDistanceToNow(new Date(note.updatedAt), {addSuffix:true})}
                          </span>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={()=>{setEditId(note.id);setEditContent(note.content);}}
                              className="p-1 rounded hover:bg-muted text-muted-foreground transition-all">
                              <Pencil className="w-3 h-3"/>
                            </button>
                            <button onClick={()=>handleDeleteNote(note.id)}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all">
                              <Trash2 className="w-3 h-3"/>
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </>
      ) : (
        <ScrollArea className="flex-1 px-3 py-3">
          {studioResult ? (
            <div className="animate-in fade-in duration-300">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">{STUDIO_TYPES.find(s=>s.id===studioResult.type)?.icon}</span>
                  <span className="text-sm font-semibold">{STUDIO_TYPES.find(s=>s.id===studioResult.type)?.label}</span>
                </div>
                <div className="flex gap-1">
                  <CopyBtn text={studioResult.content}/>
                  <button onClick={()=>setStudioResult(null)}
                    className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-all">
                    <RotateCcw className="w-3.5 h-3.5"/>
                  </button>
                </div>
              </div>
              <div className="chat-prose text-[13px]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{studioResult.content}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider font-semibold px-1 mb-3">Generate from sources</p>
              {sources.length === 0 && (
                <div className="rounded-xl border border-amber-200/40 bg-amber-50/10 px-3 py-2.5 mb-3">
                  <p className="text-[12px] text-amber-600/80">Add sources first to use Studio generation</p>
                </div>
              )}
              {STUDIO_TYPES.map(st => (
                <button key={st.id} onClick={()=>handleStudio(st.id)}
                  disabled={sources.length===0||generatingType!==null}
                  className={`w-full text-left px-3 py-3 rounded-xl border transition-all
                    ${generatingType===st.id
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/60 bg-card hover:border-primary/30 hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed"}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{st.icon}</span>
                    <div>
                      <p className="text-[13px] font-semibold flex items-center gap-2">
                        {st.label}
                        {generatingType===st.id && <Loader2 className="w-3 h-3 animate-spin text-primary"/>}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{st.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   NOTEBOOK VIEW (3-panel)
══════════════════════════════════════════ */
function NotebookView({ notebookId, onBack }: { notebookId: number; onBack: ()=>void }) {
  const qc = useQueryClient();
  const { data: notebook, isLoading } = useNotebook(notebookId);
  const isMobile = useIsMobile();
  const [mobilePanel, setMobilePanel] = useState<"sources"|"chat"|"notes">("chat");

  const refresh = useCallback(()=>{ qc.invalidateQueries({queryKey:["notebook",notebookId]}); },[qc,notebookId]);

  if (isLoading || !notebook) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground"/>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="flex flex-col h-full bg-background">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <button onClick={onBack} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-all">
            <ChevronLeft className="w-4 h-4"/>
          </button>
          <span className="text-base">{notebook.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold truncate">{notebook.title}</p>
          </div>
        </div>
        {/* Tab bar */}
        <div className="flex border-b border-border shrink-0 bg-card/50">
          {([["sources","Sources",<Upload className="w-3.5 h-3.5"/>],["chat","Chat",<MessageSquare className="w-3.5 h-3.5"/>],["notes","Notes",<StickyNote className="w-3.5 h-3.5"/>]] as const).map(([id,label,icon])=>(
            <button key={id} onClick={()=>setMobilePanel(id as any)}
              className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-all
                ${mobilePanel===id?"border-primary text-primary":"border-transparent text-muted-foreground"}`}>
              {icon}{label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-hidden">
          {mobilePanel==="sources" && <SourcesPanel notebook={notebook} onRefresh={refresh}/>}
          {mobilePanel==="chat"    && <ChatPanel notebook={notebook} onRefresh={refresh}/>}
          {mobilePanel==="notes"   && <NotesStudioPanel notebook={notebook} onRefresh={refresh}/>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sources */}
      <div className="w-64 border-r border-border flex flex-col shrink-0 bg-sidebar">
        <SourcesPanel notebook={notebook} onRefresh={refresh}/>
      </div>
      {/* Chat */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        <ChatPanel notebook={notebook} onRefresh={refresh}/>
      </div>
      {/* Notes + Studio */}
      <div className="w-72 border-l border-border flex flex-col shrink-0 bg-sidebar">
        <NotesStudioPanel notebook={notebook} onRefresh={refresh}/>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   CREATE NOTEBOOK MODAL
══════════════════════════════════════════ */
function CreateNotebookModal({ onClose, onCreate }: { onClose:()=>void; onCreate:(nb:Notebook)=>void }) {
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("📓");
  const [desc, setDesc]   = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const nb = await api.createNotebook({ title: title.trim(), emoji, description: desc.trim()||undefined });
    onCreate(nb); onClose(); setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
        onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <span className="text-[14px] font-semibold">New Notebook</span>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-all">
            <X className="w-4 h-4"/>
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {/* Emoji picker */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Icon</p>
            <div className="flex flex-wrap gap-1.5">
              {NB_EMOJIS.map(e=>(
                <button key={e} onClick={()=>setEmoji(e)}
                  className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all
                    ${emoji===e?"bg-primary/10 ring-2 ring-primary/40":"hover:bg-muted"}`}>
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Title</label>
            <input value={title} onChange={e=>setTitle(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleCreate()}
              placeholder="e.g. Quantum Computing Research"
              autoFocus
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"/>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Description <span className="font-normal opacity-50">(optional)</span></label>
            <input value={desc} onChange={e=>setDesc(e.target.value)}
              placeholder="What is this notebook about?"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-input bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"/>
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-all">
            Cancel
          </button>
          <button onClick={handleCreate} disabled={!title.trim()||saving}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 hover:bg-primary/90 transition-all flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Plus className="w-4 h-4"/>}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   NOTEBOOKS LIST SIDEBAR
══════════════════════════════════════════ */
function NotebooksSidebar({ notebooks: nbs, activeId, onSelect, onDelete, onNew }: {
  notebooks: Notebook[]; activeId: number|null;
  onSelect:(id:number)=>void; onDelete:(id:number)=>void; onNew:()=>void;
}) {
  const [search, setSearch] = useState("");
  const filtered = nbs.filter(n => n.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="h-full flex flex-col bg-sidebar">
      <div className="px-4 pt-5 pb-3 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[15px] font-bold tracking-tight">Notebooks</h2>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">{nbs.length} notebook{nbs.length!==1?"s":""}</p>
          </div>
          <button onClick={onNew}
            className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-all">
            <Plus className="w-4 h-4"/>
          </button>
        </div>
        {nbs.length > 3 && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search notebooks…"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-muted/50 border border-border/50 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/40"/>
          </div>
        )}
      </div>
      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center text-muted-foreground">
            <BookOpen className="w-8 h-8 mb-3 opacity-20"/>
            <p className="text-sm">No notebooks yet</p>
            <p className="text-[11px] mt-1 opacity-60">Create one to start organizing your research</p>
            <button onClick={onNew}
              className="mt-4 px-4 py-2 rounded-xl bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-all flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5"/> New Notebook
            </button>
          </div>
        ) : (
          <div className="px-2 pb-4 space-y-1">
            {filtered.map(nb=>(
              <div key={nb.id} onClick={()=>onSelect(nb.id)}
                className={`group flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all
                  ${activeId===nb.id?"bg-primary/10 text-primary":"hover:bg-muted/60 text-foreground"}`}>
                <span className="text-lg shrink-0">{nb.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold truncate">{nb.title}</p>
                  {nb.description && (
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">{nb.description}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                    {formatDistanceToNow(new Date(nb.updatedAt),{addSuffix:true})}
                  </p>
                </div>
                <button onClick={e=>{e.stopPropagation();onDelete(nb.id);}}
                  className="shrink-0 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all">
                  <Trash2 className="w-3.5 h-3.5"/>
                </button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

/* ══════════════════════════════════════════
   ROOT
══════════════════════════════════════════ */
export default function Research() {
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const { data: nbs = [], isLoading } = useNotebooks();
  const [activeId, setActiveId] = useState<number|null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const handleDelete = async (id: number) => {
    await api.deleteNotebook(id);
    if (activeId===id) setActiveId(null);
    qc.invalidateQueries({queryKey:["notebooks"]});
  };

  const handleCreate = (nb: Notebook) => {
    qc.invalidateQueries({queryKey:["notebooks"]});
    setActiveId(nb.id);
  };

  /* ── Mobile: show notebook list or notebook view ── */
  if (isMobile) {
    if (activeId !== null) {
      return (
        <div className="h-full flex flex-col">
          {showCreate && <CreateNotebookModal onClose={()=>setShowCreate(false)} onCreate={handleCreate}/>}
          <NotebookView notebookId={activeId} onBack={()=>setActiveId(null)}/>
        </div>
      );
    }
    return (
      <div className="flex flex-col h-full bg-background">
        {showCreate && <CreateNotebookModal onClose={()=>setShowCreate(false)} onCreate={handleCreate}/>}
        <div className="px-4 pt-5 pb-3 border-b border-border shrink-0 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Notebooks</h1>
            <p className="text-xs text-muted-foreground mt-0.5">NotebookLM-style research assistant</p>
          </div>
          <button onClick={()=>setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-all">
            <Plus className="w-3.5 h-3.5"/> New
          </button>
        </div>
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground"/></div>
          ) : nbs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 text-3xl">📓</div>
              <h2 className="text-lg font-bold mb-2">Welcome to Notebooks</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-xs">
                Organize your research like NotebookLM — add sources, chat with AI grounded in your content, and generate structured outputs.
              </p>
              <button onClick={()=>setShowCreate(true)}
                className="px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all flex items-center gap-2">
                <Plus className="w-4 h-4"/> Create your first notebook
              </button>
            </div>
          ) : (
            <div className="px-4 py-4 space-y-2">
              {nbs.map(nb=>(
                <div key={nb.id} onClick={()=>setActiveId(nb.id)}
                  className="flex items-center gap-3 px-4 py-4 rounded-2xl border border-border bg-card cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-all">
                  <span className="text-2xl">{nb.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold truncate">{nb.title}</p>
                    {nb.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{nb.description}</p>}
                    <p className="text-[11px] text-muted-foreground/50 mt-1">{formatDistanceToNow(new Date(nb.updatedAt),{addSuffix:true})}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0"/>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    );
  }

  /* ── Desktop: sidebar + notebook view ── */
  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {showCreate && <CreateNotebookModal onClose={()=>setShowCreate(false)} onCreate={handleCreate}/>}

      {/* Notebooks sidebar */}
      <div className="w-64 border-r border-border shrink-0 flex flex-col">
        <NotebooksSidebar
          notebooks={nbs}
          activeId={activeId}
          onSelect={setActiveId}
          onDelete={handleDelete}
          onNew={()=>setShowCreate(true)}
        />
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeId === null ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-5 text-4xl">📓</div>
            <h2 className="text-2xl font-bold mb-2 tracking-tight">Welcome to Notebooks</h2>
            <p className="text-sm text-muted-foreground mb-2 max-w-md leading-relaxed">
              Your personal NotebookLM. Add sources, chat with AI grounded in your content, take notes, and generate study guides, FAQs, timelines, and more.
            </p>
            <p className="text-xs text-muted-foreground/60 mb-8">Select a notebook on the left, or create a new one</p>
            <button onClick={()=>setShowCreate(true)}
              className="px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all flex items-center gap-2 shadow-lg shadow-primary/20">
              <Plus className="w-4 h-4"/> New Notebook
            </button>
            {/* Feature cards */}
            <div className="grid grid-cols-3 gap-4 mt-10 max-w-lg">
              {[
                {icon:"📎",title:"Sources",desc:"Add text, URLs, or paste any content"},
                {icon:"💬",title:"Grounded Chat",desc:"AI answers only from your sources with citations"},
                {icon:"🪄",title:"Studio",desc:"Generate study guides, FAQs, timelines & more"},
              ].map(f=>(
                <div key={f.title} className="rounded-2xl border border-border/60 bg-card/60 p-4 text-center">
                  <div className="text-2xl mb-2">{f.icon}</div>
                  <p className="text-[12px] font-semibold">{f.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <NotebookView notebookId={activeId} onBack={()=>setActiveId(null)}/>
        )}
      </div>
    </div>
  );
}
