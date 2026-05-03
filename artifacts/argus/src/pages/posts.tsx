import { useState } from "react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Share2, Sparkles, Loader2, Copy, Check, Trash2,
  Twitter, Linkedin, Instagram, Hash, Clock, PenLine,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ─── Types ─────────────────────────────────────────────── */
type Platform = "Twitter" | "LinkedIn" | "Instagram";
type Tone = "professional" | "casual" | "witty" | "inspirational" | "promotional";

interface GeneratedPost {
  content: string;
  caption: string;
  hashtags: string[];
  hook: string;
}

interface SavedPost {
  id: number;
  topic: string;
  content: string;
  caption?: string | null;
  hashtags?: string | null;
  tone: string;
  platform?: string | null;
  createdAt: string;
}

/* ─── Platform config ────────────────────────────────────── */
const PLATFORMS: { id: Platform; label: string; icon: React.ElementType; color: string; limit: number; hint: string }[] = [
  { id: "Twitter",   label: "X / Twitter", icon: Twitter,   color: "text-sky-400",    limit: 280,  hint: "280 characters" },
  { id: "LinkedIn",  label: "LinkedIn",     icon: Linkedin,  color: "text-blue-500",   limit: 3000, hint: "Long-form" },
  { id: "Instagram", label: "Instagram",    icon: Instagram, color: "text-pink-500",   limit: 2200, hint: "Caption + hashtags" },
];

const TONES: { id: Tone; label: string; emoji: string }[] = [
  { id: "professional",  label: "Professional",  emoji: "👔" },
  { id: "casual",        label: "Casual",         emoji: "😊" },
  { id: "witty",         label: "Witty",          emoji: "😏" },
  { id: "inspirational", label: "Inspiring",      emoji: "✨" },
  { id: "promotional",   label: "Promotional",    emoji: "🚀" },
];

/* ─── API hooks ──────────────────────────────────────────── */
function usePosts() {
  return useQuery<SavedPost[]>({
    queryKey: ["posts"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/posts`);
      return r.json();
    },
  });
}

function useGenerate() {
  return useMutation<GeneratedPost, Error, { topic: string; tone: Tone; platform: Platform; length: "short" | "long" }>({
    mutationFn: async (data) => {
      const r = await fetch(`${BASE}/api/posts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Generation failed");
      return r.json();
    },
  });
}

function useSavePost() {
  const qc = useQueryClient();
  return useMutation<SavedPost, Error, Omit<SavedPost, "id" | "createdAt">>({
    mutationFn: async (data) => {
      const r = await fetch(`${BASE}/api/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["posts"] }),
  });
}

function useDeletePost() {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await fetch(`${BASE}/api/posts/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["posts"] }),
  });
}

/* ─── Platform icon badge ────────────────────────────────── */
function PlatformBadge({ platform }: { platform: string }) {
  const cfg = PLATFORMS.find(p => p.id === platform);
  if (!cfg) return <Badge variant="outline">{platform}</Badge>;
  const Icon = cfg.icon;
  return (
    <div className={`flex items-center gap-1 text-[11px] font-semibold ${cfg.color}`}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </div>
  );
}

/* ─── Character counter ──────────────────────────────────── */
function CharCounter({ text, limit }: { text: string; limit: number }) {
  const len = text.length;
  const pct = len / limit;
  const color = pct > 0.9 ? "text-destructive" : pct > 0.75 ? "text-yellow-500" : "text-muted-foreground";
  return (
    <span className={`text-xs tabular-nums ${color}`}>
      {len} / {limit}
    </span>
  );
}

/* ─── Copy button ────────────────────────────────────────── */
function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const doCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={doCopy}
      className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1.5 transition-all ${
        copied
          ? "bg-green-500/10 text-green-500"
          : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
      } ${className}`}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

/* ─── Main component ─────────────────────────────────────── */
export default function Posts() {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<Tone>("professional");
  const [platform, setPlatform] = useState<Platform>("LinkedIn");
  const [length, setLength] = useState<"short" | "long">("short");
  const [generated, setGenerated] = useState<GeneratedPost | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);

  const { data: posts = [] } = usePosts();
  const generate = useGenerate();
  const savePost = useSavePost();
  const deletePost = useDeletePost();

  const activePlatform = PLATFORMS.find(p => p.id === platform)!;

  const handleGenerate = () => {
    if (!topic.trim()) return;
    setGenerated(null);
    setSavedId(null);
    generate.mutate({ topic, tone, platform, length }, {
      onSuccess: (data) => setGenerated(data),
    });
  };

  const handleSave = () => {
    if (!generated) return;
    savePost.mutate({
      topic,
      content: generated.content,
      caption: generated.caption,
      hashtags: generated.hashtags?.join(" "),
      tone,
      platform,
    }, {
      onSuccess: (saved) => setSavedId(saved.id),
    });
  };

  const handleRegenerate = () => {
    if (!topic.trim()) return;
    setSavedId(null);
    generate.mutate({ topic, tone, platform, length }, {
      onSuccess: (data) => setGenerated(data),
    });
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* ── Left panel: Generator ── */}
      <div className="w-[380px] shrink-0 border-r border-border flex flex-col bg-sidebar overflow-hidden">
        <div className="px-5 pt-6 pb-4 border-b border-border">
          <h1 className="text-xl font-bold tracking-tight">Social Posts</h1>
          <p className="text-xs text-muted-foreground mt-0.5">AI-generated content for every platform</p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-5 space-y-5">
            {/* Platform selector */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Platform</label>
              <div className="flex flex-col gap-1.5">
                {PLATFORMS.map((p) => {
                  const Icon = p.icon;
                  const active = platform === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setPlatform(p.id)}
                      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                        active
                          ? "border-primary/40 bg-primary/8 text-foreground shadow-sm"
                          : "border-border bg-card hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${active ? p.color : "opacity-50"}`} />
                      <span>{p.label}</span>
                      <span className={`ml-auto text-[11px] ${active ? "text-primary" : "text-muted-foreground"}`}>{p.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tone pills */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Tone</label>
              <div className="flex flex-wrap gap-1.5">
                {TONES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTone(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      tone === t.id
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                    }`}
                  >
                    <span>{t.emoji}</span> {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Length */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Length</label>
              <div className="grid grid-cols-2 gap-2">
                {(["short", "long"] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLength(l)}
                    className={`py-2 rounded-xl text-sm font-medium border transition-all ${
                      length === l
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {l === "short" ? "Short" : "Long-form"}
                  </button>
                ))}
              </div>
            </div>

            {/* Topic input */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Topic or idea</label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleGenerate(); }}
                placeholder="What do you want to post about? Paste a URL, describe an idea, or enter a topic…"
                rows={4}
                className="w-full rounded-xl border border-input bg-card px-3.5 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 resize-none transition-all"
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">Tip: ⌘ + Enter to generate</p>
            </div>

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={!topic.trim() || generate.isPending}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 hover:bg-primary/90 transition-all shadow-sm shadow-primary/20 active:scale-[0.98]"
            >
              {generate.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                : <><Sparkles className="w-4 h-4" /> Generate Post</>}
            </button>
          </div>
        </ScrollArea>
      </div>

      {/* ── Center panel: Preview ── */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-border bg-background">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenLine className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Preview</span>
            {generated && <PlatformBadge platform={platform} />}
          </div>
          {generated && (
            <div className="flex items-center gap-2">
              <CopyButton text={`${generated.content}\n\n${generated.hashtags?.map(h => `#${h}`).join(" ")}`} />
              <button
                onClick={handleRegenerate}
                disabled={generate.isPending}
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" /> Regenerate
              </button>
            </div>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="p-6 max-w-lg mx-auto">
            {generate.isPending ? (
              <div className="space-y-4 animate-pulse">
                <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-muted" />
                    <div className="space-y-1.5">
                      <div className="h-3 w-24 bg-muted rounded-full" />
                      <div className="h-2.5 w-16 bg-muted rounded-full" />
                    </div>
                  </div>
                  <div className="space-y-2 pt-1">
                    <div className="h-3 bg-muted rounded-full w-full" />
                    <div className="h-3 bg-muted rounded-full w-11/12" />
                    <div className="h-3 bg-muted rounded-full w-4/5" />
                    <div className="h-3 bg-muted rounded-full w-3/4" />
                  </div>
                  <div className="flex gap-1.5 pt-2">
                    {[...Array(4)].map((_, i) => <div key={i} className="h-5 w-16 bg-muted rounded-full" />)}
                  </div>
                </div>
                <p className="text-center text-sm text-muted-foreground animate-pulse">Writing your {platform} post…</p>
              </div>
            ) : generated ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
                {/* Platform post card */}
                <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                  {/* Post header */}
                  <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border/50">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/60 to-primary flex items-center justify-center text-white text-sm font-bold shrink-0">
                      A
                    </div>
                    <div>
                      <p className="text-sm font-semibold leading-none">Argus</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Just now · <span className="capitalize">{tone}</span></p>
                    </div>
                    {(() => { const Icon = activePlatform.icon; return <Icon className={`w-4 h-4 ml-auto ${activePlatform.color}`} />; })()}
                  </div>

                  {/* Post content */}
                  <div className="px-4 py-3">
                    {generated.hook && (
                      <p className="text-sm font-semibold text-foreground mb-2">{generated.hook}</p>
                    )}
                    <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                      {generated.content}
                    </p>

                    {/* Hashtags */}
                    {generated.hashtags?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {generated.hashtags.map((tag, i) => (
                          <span key={i} className="text-xs text-primary font-medium">
                            #{tag.replace(/^#/, "")}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Char count footer */}
                  <div className="px-4 py-2.5 border-t border-border/50 bg-muted/20 flex items-center justify-between">
                    <CharCounter text={generated.content} limit={activePlatform.limit} />
                    <span className="text-[11px] text-muted-foreground">{activePlatform.hint}</span>
                  </div>
                </div>

                {/* Save / saved */}
                {savedId ? (
                  <div className="flex items-center justify-center gap-2 py-3 rounded-xl border border-green-500/30 bg-green-500/5 text-green-500 text-sm font-medium">
                    <Check className="w-4 h-4" /> Saved to library
                  </div>
                ) : (
                  <button
                    onClick={handleSave}
                    disabled={savePost.isPending}
                    className="w-full py-3 rounded-xl border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/5 transition-all"
                  >
                    {savePost.isPending ? "Saving…" : "Save to Library"}
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
                <div className="w-16 h-16 rounded-2xl bg-pink-500/10 flex items-center justify-center mb-5">
                  <Share2 className="w-7 h-7 text-pink-500" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">Ready to create</h3>
                <p className="text-sm max-w-xs opacity-70">
                  Pick a platform, choose your tone, describe your topic, and let Argus write it.
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── Right panel: Library ── */}
      <div className="w-80 shrink-0 flex flex-col bg-sidebar overflow-hidden">
        <div className="px-4 pt-6 pb-4 border-b border-border">
          <h2 className="font-bold text-base">Library</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{posts.length} saved {posts.length === 1 ? "post" : "posts"}</p>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {posts.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Share2 className="w-7 h-7 mx-auto mb-2 opacity-20" />
                <p className="text-sm">Saved posts appear here</p>
              </div>
            ) : posts.map((post) => {
              const tags = post.hashtags?.split(" ").filter(Boolean) ?? [];
              return (
                <div
                  key={post.id}
                  className="group rounded-xl border border-border bg-card p-3 hover:border-primary/30 transition-all"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    {post.platform && <PlatformBadge platform={post.platform} />}
                    <div className="flex items-center gap-1 ml-auto">
                      <CopyButton text={post.content} />
                      <button
                        onClick={() => deletePost.mutate(post.id)}
                        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground mb-1.5 truncate">
                    {post.topic}
                  </p>
                  <p className="text-sm leading-relaxed line-clamp-3 text-foreground">
                    {post.content}
                  </p>

                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {tags.slice(0, 4).map((t, i) => (
                        <span key={i} className="text-[10px] text-primary">#{t.replace(/^#/, "")}</span>
                      ))}
                      {tags.length > 4 && <span className="text-[10px] text-muted-foreground">+{tags.length - 4}</span>}
                    </div>
                  )}

                  <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                    <span className="ml-1 capitalize">· {post.tone}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
