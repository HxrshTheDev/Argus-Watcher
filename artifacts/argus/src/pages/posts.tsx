import { useState } from "react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Share2, Sparkles, Loader2, Copy, Check, Trash2,
  Twitter, Linkedin, Instagram, Clock, PenLine,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Platform = "Twitter" | "LinkedIn" | "Instagram";
type Tone = "professional" | "casual" | "witty" | "inspirational" | "promotional";

interface GeneratedPost { content: string; caption: string; hashtags: string[]; hook: string; }
interface SavedPost {
  id: number; topic: string; content: string; caption?: string | null;
  hashtags?: string | null; tone: string; platform?: string | null; createdAt: string;
}

const PLATFORMS: { id: Platform; label: string; icon: React.ElementType; color: string; gradient: string; limit: number; hint: string }[] = [
  { id: "Twitter",   label: "X / Twitter", icon: Twitter,   color: "text-sky-400",  gradient: "from-sky-500 to-sky-600",      limit: 280,  hint: "280 chars" },
  { id: "LinkedIn",  label: "LinkedIn",     icon: Linkedin,  color: "text-blue-500", gradient: "from-blue-600 to-blue-700",    limit: 3000, hint: "Long-form" },
  { id: "Instagram", label: "Instagram",    icon: Instagram, color: "text-pink-500", gradient: "from-pink-500 to-rose-500",    limit: 2200, hint: "Caption + tags" },
];

const TONES: { id: Tone; label: string; emoji: string }[] = [
  { id: "professional",  label: "Pro",      emoji: "👔" },
  { id: "casual",        label: "Casual",   emoji: "😊" },
  { id: "witty",         label: "Witty",    emoji: "😏" },
  { id: "inspirational", label: "Inspiring",emoji: "✨" },
  { id: "promotional",   label: "Promo",    emoji: "🚀" },
];

function usePosts() {
  return useQuery<SavedPost[]>({ queryKey: ["posts"], queryFn: async () => { const r = await fetch(`${BASE}/api/posts`); return r.json(); } });
}
function useGenerate() {
  return useMutation<GeneratedPost, Error, { topic: string; tone: Tone; platform: Platform; length: "short" | "long" }>({
    mutationFn: async (data) => {
      const r = await fetch(`${BASE}/api/posts/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!r.ok) throw new Error("Generation failed");
      return r.json();
    },
  });
}
function useSavePost() {
  const qc = useQueryClient();
  return useMutation<SavedPost, Error, Omit<SavedPost, "id" | "createdAt">>({
    mutationFn: async (data) => { const r = await fetch(`${BASE}/api/posts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); return r.json(); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["posts"] }),
  });
}
function useDeletePost() {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => { await fetch(`${BASE}/api/posts/${id}`, { method: "DELETE" }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["posts"] }),
  });
}

function PlatformBadge({ platform }: { platform: string }) {
  const cfg = PLATFORMS.find(p => p.id === platform);
  if (!cfg) return <span className="text-[11px]">{platform}</span>;
  const Icon = cfg.icon;
  return <div className={`flex items-center gap-1.5 text-[11px] font-bold ${cfg.color}`}><Icon className="w-3 h-3" /> {cfg.label}</div>;
}

function CharCounter({ text, limit }: { text: string; limit: number }) {
  const len = text.length;
  const pct = len / limit;
  const color = pct > 0.9 ? "text-destructive" : pct > 0.75 ? "text-amber-400" : "text-muted-foreground/60";
  return <span className={`text-[11px] tabular-nums font-semibold ${color}`}>{len} / {limit}</span>;
}

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const doCopy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <button onClick={doCopy}
      className={`flex items-center gap-1.5 text-[12px] font-bold rounded-xl px-3 py-1.5 transition-all ${copied ? "bg-emerald-500/15 text-emerald-500" : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"} ${className}`}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

const labelClass = "text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-2";
const primaryBtn = "w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-primary-foreground text-sm font-black disabled:opacity-40 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-[0.98]";

/* ── Generator panel ───────────────────────────────────── */
function GeneratorPanel({ topic, setTopic, tone, setTone, platform, setPlatform, length, setLength, onGenerate, isPending }: any) {
  return (
    <ScrollArea className="flex-1">
      <div className="p-5 space-y-5">
        {/* Platform */}
        <div>
          <label className={labelClass}>Platform</label>
          <div className="flex flex-col gap-1.5">
            {PLATFORMS.map((p) => {
              const Icon = p.icon;
              const active = platform === p.id;
              return (
                <button key={p.id} onClick={() => setPlatform(p.id)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-sm font-semibold transition-all ${active ? "border-primary/30 bg-primary/8 text-foreground" : "border-border bg-card/50 hover:bg-muted/40 text-muted-foreground hover:text-foreground"}`}
                >
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${p.gradient} flex items-center justify-center shrink-0`}>
                    <Icon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span>{p.label}</span>
                  <span className={`ml-auto text-[11px] font-semibold ${active ? "text-primary" : "text-muted-foreground/60"}`}>{p.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tone */}
        <div>
          <label className={labelClass}>Tone</label>
          <div className="flex flex-wrap gap-1.5">
            {TONES.map((t) => (
              <button key={t.id} onClick={() => setTone(t.id)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${tone === t.id ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/30"}`}
              >
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Length */}
        <div>
          <label className={labelClass}>Length</label>
          <div className="grid grid-cols-2 gap-2">
            {(["short", "long"] as const).map((l) => (
              <button key={l} onClick={() => setLength(l)}
                className={`py-2.5 rounded-xl text-sm font-bold border transition-all ${length === l ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card border-border text-muted-foreground hover:border-primary/30"}`}
              >
                {l === "short" ? "Short" : "Long-form"}
              </button>
            ))}
          </div>
        </div>

        {/* Topic */}
        <div>
          <label className={labelClass}>Topic or idea</label>
          <textarea
            value={topic} onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) onGenerate(); }}
            placeholder="What do you want to post about?…" rows={4}
            className="w-full rounded-xl border border-input bg-muted/30 px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none leading-relaxed font-medium"
          />
          <p className="text-[11px] text-muted-foreground/50 mt-1">⌘ + Enter to generate</p>
        </div>

        <button onClick={onGenerate} disabled={!topic.trim() || isPending} className={primaryBtn}>
          {isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</> : <><Sparkles className="w-4 h-4" /> Generate Post</>}
        </button>
      </div>
    </ScrollArea>
  );
}

/* ── Preview panel ─────────────────────────────────────── */
function PreviewPanel({ generated, platform, tone, onSave, onRegenerate, savedId, isPending, isSaving }: any) {
  const activePlatform = PLATFORMS.find(p => p.id === platform)!;
  return (
    <ScrollArea className="flex-1">
      <div className="p-5 max-w-lg mx-auto">
        {isPending ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full shimmer" />
                <div className="space-y-1.5 flex-1"><div className="h-3 shimmer rounded-full" /><div className="h-2.5 w-1/2 shimmer rounded-full" /></div>
              </div>
              <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-3 shimmer rounded-full" style={{ width: `${90 - i * 10}%` }} />)}</div>
            </div>
            <p className="text-center text-[12px] text-muted-foreground animate-pulse">Writing your {platform} post…</p>
          </div>
        ) : generated ? (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Post preview card */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-lg shadow-black/10">
              <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border/50">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center text-white text-sm font-black shrink-0">A</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold leading-none">Argus</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Just now · <span className="capitalize">{tone}</span></p>
                </div>
                {(() => { const Icon = activePlatform.icon; return (
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${activePlatform.gradient} flex items-center justify-center shrink-0`}>
                    <Icon className="w-3.5 h-3.5 text-white" />
                  </div>
                ); })()}
              </div>
              <div className="px-4 py-4">
                {generated.hook && <p className="text-sm font-bold mb-2 leading-snug">{generated.hook}</p>}
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{generated.content}</p>
                {generated.hashtags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {generated.hashtags.map((tag: string, i: number) => (
                      <span key={i} className="text-[12px] text-primary font-semibold">#{tag.replace(/^#/, "")}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-4 py-2.5 border-t border-border/40 bg-muted/20 flex items-center justify-between">
                <CharCounter text={generated.content} limit={activePlatform.limit} />
                <CopyButton text={`${generated.content}\n\n${generated.hashtags?.map((h: string) => `#${h}`).join(" ")}`} />
              </div>
            </div>

            <div className="flex gap-2">
              {savedId ? (
                <div className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/8 text-emerald-400 text-sm font-bold">
                  <Check className="w-4 h-4" /> Saved to library
                </div>
              ) : (
                <button onClick={onSave} disabled={isSaving}
                  className="flex-1 py-3 rounded-2xl border border-primary/30 text-primary text-sm font-black hover:bg-primary/8 transition-all disabled:opacity-50 active:scale-[0.98]"
                >
                  {isSaving ? "Saving…" : "Save to Library"}
                </button>
              )}
              <button onClick={onRegenerate} disabled={isPending}
                className="px-4 py-3 rounded-2xl bg-muted hover:bg-muted/80 text-sm font-bold transition-all flex items-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" /> Redo
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-3xl bg-pink-500/20 blur-xl scale-125" />
              <div className="relative w-16 h-16 rounded-3xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center shadow-xl shadow-pink-500/25">
                <Share2 className="w-7 h-7 text-white" />
              </div>
            </div>
            <h3 className="text-base font-black tracking-tight text-foreground/60">Ready to create</h3>
            <p className="text-[13px] max-w-xs opacity-60 mt-1 leading-relaxed">Pick a platform, set your tone, describe your topic, and let Argus write it.</p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

/* ── Library panel ─────────────────────────────────────── */
function LibraryPanel({ posts, onDelete }: { posts: SavedPost[]; onDelete: (id: number) => void }) {
  return (
    <ScrollArea className="flex-1">
      <div className="p-3 space-y-2">
        {posts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Share2 className="w-8 h-8 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-semibold text-foreground/40">Saved posts appear here</p>
          </div>
        ) : posts.map((post) => {
          const tags = post.hashtags?.split(" ").filter(Boolean) ?? [];
          return (
            <div key={post.id}
              className="group rounded-2xl border border-border bg-card p-3.5 hover:border-primary/20 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                {post.platform && <PlatformBadge platform={post.platform} />}
                <div className="flex items-center gap-1 ml-auto">
                  <CopyButton text={post.content} />
                  <button onClick={() => onDelete(post.id)}
                    className="w-7 h-7 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground/60 mb-1.5 truncate">{post.topic}</p>
              <p className="text-sm leading-relaxed line-clamp-3">{post.content}</p>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {tags.slice(0, 4).map((t, i) => <span key={i} className="text-[11px] text-primary font-semibold">#{t.replace(/^#/, "")}</span>)}
                  {tags.length > 4 && <span className="text-[11px] text-muted-foreground/50">+{tags.length - 4}</span>}
                </div>
              )}
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-muted-foreground/50">
                <Clock className="w-3 h-3" />
                {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                <span className="capitalize">· {post.tone}</span>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

/* ── Main ─────────────────────────────────────────────── */
export default function Posts() {
  const isMobile = useIsMobile();
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<Tone>("professional");
  const [platform, setPlatform] = useState<Platform>("LinkedIn");
  const [length, setLength] = useState<"short" | "long">("short");
  const [generated, setGenerated] = useState<GeneratedPost | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [mobileTab, setMobileTab] = useState<"create" | "preview" | "library">("create");

  const { data: posts = [] } = usePosts();
  const generate = useGenerate();
  const savePost = useSavePost();
  const deletePost = useDeletePost();

  const handleGenerate = () => {
    if (!topic.trim()) return;
    setGenerated(null); setSavedId(null);
    generate.mutate({ topic, tone, platform, length }, {
      onSuccess: (data) => { setGenerated(data); if (isMobile) setMobileTab("preview"); },
    });
  };

  const handleSave = () => {
    if (!generated) return;
    savePost.mutate({ topic, content: generated.content, caption: generated.caption, hashtags: generated.hashtags?.join(" "), tone, platform }, {
      onSuccess: (saved) => setSavedId(saved.id),
    });
  };

  const handleRegenerate = () => {
    if (!topic.trim()) return;
    setSavedId(null);
    generate.mutate({ topic, tone, platform, length }, { onSuccess: (data) => setGenerated(data) });
  };

  /* ── Mobile ── */
  if (isMobile) {
    const TABS = [
      { id: "create" as const,  label: "Create" },
      { id: "preview" as const, label: "Preview" },
      { id: "library" as const, label: `Library (${posts.length})` },
    ];
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="px-5 pt-7 pb-0">
          <h1 className="text-[28px] font-black tracking-tight leading-none mb-4">Social Posts</h1>
          <div className="flex gap-1.5">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setMobileTab(t.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${mobileTab === t.id ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground"}`}
              >{t.label}</button>
            ))}
          </div>
          <div className="h-px bg-border/60 mt-4" />
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          {mobileTab === "create" && <GeneratorPanel topic={topic} setTopic={setTopic} tone={tone} setTone={setTone} platform={platform} setPlatform={setPlatform} length={length} setLength={setLength} onGenerate={handleGenerate} isPending={generate.isPending} />}
          {mobileTab === "preview" && <PreviewPanel generated={generated} platform={platform} tone={tone} onSave={handleSave} onRegenerate={handleRegenerate} savedId={savedId} isPending={generate.isPending} isSaving={savePost.isPending} />}
          {mobileTab === "library" && <LibraryPanel posts={posts} onDelete={(id) => deletePost.mutate(id)} />}
        </div>
      </div>
    );
  }

  /* ── Desktop ── */
  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <div className="w-[360px] shrink-0 border-r border-border flex flex-col bg-sidebar overflow-hidden">
        <div className="px-5 pt-6 pb-4 border-b border-border/60">
          <h1 className="text-[22px] font-black tracking-tight leading-none mb-0.5">Social Posts</h1>
          <p className="text-[12px] text-muted-foreground">AI-generated content for every platform</p>
        </div>
        <GeneratorPanel topic={topic} setTopic={setTopic} tone={tone} setTone={setTone} platform={platform} setPlatform={setPlatform} length={length} setLength={setLength} onGenerate={handleGenerate} isPending={generate.isPending} />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
        <div className="px-5 py-4 border-b border-border/60 flex items-center gap-2.5 bg-background/80 glass">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center shadow-sm">
            <PenLine className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-[14px] tracking-tight">Preview</span>
          {generated && <PlatformBadge platform={platform} />}
        </div>
        <PreviewPanel generated={generated} platform={platform} tone={tone} onSave={handleSave} onRegenerate={handleRegenerate} savedId={savedId} isPending={generate.isPending} isSaving={savePost.isPending} />
      </div>

      <div className="w-72 shrink-0 flex flex-col bg-sidebar overflow-hidden">
        <div className="px-4 pt-6 pb-4 border-b border-border/60">
          <h2 className="font-black text-[15px] tracking-tight">Library</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">{posts.length} saved {posts.length === 1 ? "post" : "posts"}</p>
        </div>
        <LibraryPanel posts={posts} onDelete={(id) => deletePost.mutate(id)} />
      </div>
    </div>
  );
}
