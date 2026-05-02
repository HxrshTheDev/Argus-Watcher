import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import {
  Search, Sparkles, BookOpen, Trash2, Globe, ArrowRight,
  Clock, ChevronRight, Lightbulb, FileText, ExternalLink, X
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Source { title: string; url: string; }
interface ResearchNote {
  id: number;
  query: string;
  summary: string;
  insights: string[];
  conclusion?: string | null;
  sources?: Source[];
  createdAt: string;
}

function getDomain(url: string) {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}

function useNotes() {
  return useQuery<ResearchNote[]>({
    queryKey: ["research"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/research`);
      const data = await r.json();
      return data.map((n: any) => ({
        ...n,
        insights: (() => { try { return JSON.parse(n.insights); } catch { return [n.insights]; } })(),
        sources: (() => { try { return n.sources ? JSON.parse(n.sources) : []; } catch { return []; } })(),
      }));
    },
  });
}

function useRunResearch() {
  const qc = useQueryClient();
  return useMutation<ResearchNote, Error, string>({
    mutationFn: async (query: string) => {
      const r = await fetch(`${BASE}/api/research/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!r.ok) throw new Error("Research failed");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["research"] }),
  });
}

function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id: number) => {
      await fetch(`${BASE}/api/research/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["research"] }),
  });
}

const SUGGESTED = [
  "Latest advances in quantum computing",
  "How does the human gut microbiome affect mood?",
  "Best practices for building AI products in 2025",
  "Impact of sleep on cognitive performance",
];

export default function Research() {
  const [query, setQuery] = useState("");
  const [activeNote, setActiveNote] = useState<ResearchNote | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: notes = [] } = useNotes();
  const runResearch = useRunResearch();
  const deleteNote = useDeleteNote();

  const handleSearch = (q = query) => {
    const trimmed = q.trim();
    if (!trimmed || runResearch.isPending) return;
    setQuery(trimmed);
    setActiveNote(null);
    runResearch.mutate(trimmed, {
      onSuccess: (note) => {
        setActiveNote(note);
        setQuery("");
      },
    });
  };

  const handleDelete = async (id: number) => {
    await deleteNote.mutateAsync(id);
    if (activeNote?.id === id) setActiveNote(null);
  };

  const isSearching = runResearch.isPending;

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* iOS-style sidebar */}
      <div className="w-72 border-r border-border bg-sidebar flex flex-col shrink-0">
        <div className="px-4 pt-6 pb-4">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Research</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{notes.length} saved {notes.length === 1 ? "note" : "notes"}</p>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-3 pb-4 space-y-1">
            {notes.length === 0 && !isSearching && (
              <div className="text-center py-10 text-muted-foreground">
                <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-25" />
                <p className="text-sm">Your research notes will appear here</p>
              </div>
            )}
            {notes.map((note) => (
              <div
                key={note.id}
                onClick={() => setActiveNote(note)}
                className={`group relative rounded-xl px-3 py-3 cursor-pointer transition-all duration-150 ${
                  activeNote?.id === note.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "hover:bg-muted/70"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`text-sm font-medium line-clamp-2 leading-snug ${activeNote?.id === note.id ? "text-primary-foreground" : ""}`}>
                      {note.query}
                    </p>
                    <p className={`text-[11px] mt-1 flex items-center gap-1 ${activeNote?.id === note.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(note.id); }}
                    className={`shrink-0 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity ${
                      activeNote?.id === note.id ? "hover:bg-white/20 text-primary-foreground" : "hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Search bar */}
        <div className="px-6 py-5 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className={`relative max-w-2xl mx-auto transition-all duration-200 ${isSearching ? "opacity-70" : ""}`}>
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-muted-foreground" />
            </div>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Ask anything — Argus will search the web for you…"
              disabled={isSearching}
              className="w-full pl-11 pr-28 h-12 rounded-2xl border border-input bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all shadow-sm"
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-24 inset-y-0 flex items-center text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => handleSearch()}
              disabled={!query.trim() || isSearching}
              className="absolute right-2 inset-y-2 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Search
            </button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="max-w-2xl mx-auto px-6 py-6">

            {/* Loading state */}
            {isSearching && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 py-4">
                  <div className="relative w-8 h-8 shrink-0">
                    <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                    <div className="relative w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Globe className="w-4 h-4 text-primary animate-pulse" />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Searching the web…</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Argus is finding and synthesizing sources</p>
                  </div>
                </div>
                {/* Skeleton cards */}
                <div className="rounded-2xl border border-border bg-card p-5 space-y-3 animate-pulse">
                  <div className="h-4 bg-muted rounded-full w-3/4" />
                  <div className="h-3 bg-muted rounded-full w-full" />
                  <div className="h-3 bg-muted rounded-full w-5/6" />
                </div>
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="rounded-xl border border-border bg-card p-4 flex gap-3 animate-pulse" style={{ animationDelay: `${i * 100}ms` }}>
                      <div className="w-6 h-6 rounded-full bg-muted shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-muted rounded-full w-full" />
                        <div className="h-3 bg-muted rounded-full w-4/5" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Result */}
            {!isSearching && activeNote && (
              <div className="space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-400">
                {/* Header */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="bg-primary/10 p-1.5 rounded-lg">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">AI Research Report</span>
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight leading-tight">{activeNote.query}</h1>
                </div>

                {/* Summary card */}
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-primary">Summary</span>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground">{activeNote.summary}</p>
                </div>

                {/* Insights */}
                {activeNote.insights?.length > 0 && (
                  <div className="rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border bg-muted/30">
                      <Lightbulb className="w-4 h-4 text-yellow-500" />
                      <span className="text-sm font-semibold">Key Insights</span>
                    </div>
                    <div className="divide-y divide-border">
                      {activeNote.insights.map((insight, i) => (
                        <div key={i} className="flex items-start gap-3.5 px-5 py-4">
                          <div className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                            {i + 1}
                          </div>
                          <p className="text-sm leading-relaxed text-foreground">{insight}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conclusion */}
                {activeNote.conclusion && (
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Conclusion</p>
                    <p className="text-sm leading-relaxed">{activeNote.conclusion}</p>
                  </div>
                )}

                {/* Sources */}
                {activeNote.sources && activeNote.sources.length > 0 && (
                  <div className="rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border bg-muted/30">
                      <Globe className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">Sources</span>
                      <span className="text-xs text-muted-foreground ml-auto">{activeNote.sources.length} web references</span>
                    </div>
                    <div className="divide-y divide-border">
                      {activeNote.sources.map((s, i) => (
                        <a
                          key={i}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition-colors group"
                        >
                          <img
                            src={`https://www.google.com/s2/favicons?domain=${getDomain(s.url)}&sz=32`}
                            className="w-4 h-4 rounded shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            alt=""
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{s.title || getDomain(s.url)}</p>
                            <p className="text-xs text-muted-foreground truncate">{getDomain(s.url)}</p>
                          </div>
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Empty state */}
            {!isSearching && !activeNote && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
                  <Search className="w-7 h-7 text-primary" />
                </div>
                <h2 className="text-xl font-bold mb-1">Deep Research</h2>
                <p className="text-sm text-muted-foreground max-w-xs mb-8">
                  Ask any question. Argus searches the web and synthesizes findings into a structured report.
                </p>

                <div className="w-full max-w-sm space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Try asking about…</p>
                  {SUGGESTED.map((s) => (
                    <button
                      key={s}
                      onClick={() => { setQuery(s); handleSearch(s); }}
                      className="w-full text-left flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm hover:bg-muted/50 hover:border-primary/30 transition-all group"
                    >
                      <span className="text-foreground">{s}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
