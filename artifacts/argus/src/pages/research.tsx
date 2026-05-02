import { useState } from "react";
import { 
  useListResearchNotes, 
  useGetResearchNote,
  useDeleteResearchNote,
  useRunResearchQuery,
  getListResearchNotesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Loader2, Sparkles, BookOpen, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Research() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);

  const { data: notes } = useListResearchNotes();
  const { data: activeNote, isLoading: noteLoading } = useGetResearchNote(activeNoteId!, {
    query: { enabled: !!activeNoteId }
  });

  const runResearch = useRunResearchQuery();
  const deleteNote = useDeleteResearchNote();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setActiveNoteId(null);
    runResearch.mutate(
      { data: { query } },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getListResearchNotesQueryKey() });
          setQuery("");
          // Note: The API returns the note object, we should probably set activeNoteId to result.id 
          // if the API returned it. The schema says ResearchResult, we might need to rely on the list refetch
          // and pick the newest. For now, let's just clear the query.
        }
      }
    );
  };

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteNote.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListResearchNotesQueryKey() });
          if (activeNoteId === id) setActiveNoteId(null);
        }
      }
    );
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Sidebar with history */}
      <div className="w-80 border-r border-border bg-card/30 flex flex-col hidden md:flex">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold flex items-center gap-2">
            <BookOpen className="w-4 h-4" /> Saved Research
          </h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-2">
            {notes?.map((note) => (
              <div
                key={note.id}
                onClick={() => setActiveNoteId(note.id)}
                className={`p-3 rounded-lg cursor-pointer transition-colors group ${
                  activeNoteId === note.id ? "bg-primary/10 border border-primary/20" : "bg-card hover:bg-muted border border-border"
                }`}
              >
                <div className="flex justify-between items-start gap-2">
                  <h3 className="font-medium text-sm line-clamp-2 leading-tight">{note.query}</h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-6 h-6 opacity-0 group-hover:opacity-100 -mr-1 -mt-1 text-muted-foreground hover:text-destructive"
                    onClick={(e) => handleDelete(note.id, e)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Research Area */}
      <div className="flex-1 flex flex-col bg-background">
        <div className="p-6 border-b border-border">
          <form onSubmit={handleSearch} className="max-w-2xl mx-auto relative flex items-center shadow-sm rounded-xl">
            <Search className="w-5 h-5 absolute left-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What do you want to research?"
              className="w-full pl-12 pr-24 rounded-xl border-input bg-card h-14 text-lg"
              disabled={runResearch.isPending}
            />
            <Button 
              type="submit" 
              className="absolute right-2 h-10 rounded-lg bg-primary text-primary-foreground font-medium"
              disabled={!query.trim() || runResearch.isPending}
            >
              {runResearch.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Research"}
            </Button>
          </form>
        </div>

        <ScrollArea className="flex-1 p-6">
          <div className="max-w-3xl mx-auto">
            {runResearch.isPending ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="animate-pulse">Synthesizing intelligence...</p>
              </div>
            ) : activeNote ? (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight mb-6">{activeNote.query}</h1>
                  <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center gap-2 text-primary">
                        <Sparkles className="w-5 h-5" /> Executive Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="leading-relaxed">{activeNote.summary}</p>
                    </CardContent>
                  </Card>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-4">Key Insights</h3>
                  <div className="space-y-3">
                    {/* Hacky way to parse insights array if stored as string/JSON */}
                    {(() => {
                      try {
                        const parsed = typeof activeNote.insights === 'string' 
                          ? JSON.parse(activeNote.insights) 
                          : activeNote.insights;
                        
                        if (Array.isArray(parsed)) {
                          return parsed.map((insight, i) => (
                            <div key={i} className="flex gap-3 bg-card p-4 rounded-lg border border-border">
                              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-sm font-semibold mt-0.5">
                                {i + 1}
                              </div>
                              <p className="leading-relaxed">{insight}</p>
                            </div>
                          ));
                        }
                        return <p className="whitespace-pre-wrap">{activeNote.insights}</p>;
                      } catch (e) {
                        return <p className="whitespace-pre-wrap leading-relaxed bg-card p-4 rounded-lg border border-border">{activeNote.insights}</p>;
                      }
                    })()}
                  </div>
                </div>

                {activeNote.conclusion && (
                  <div>
                    <h3 className="text-xl font-semibold mb-4">Conclusion</h3>
                    <Card>
                      <CardContent className="p-6">
                        <p className="leading-relaxed">{activeNote.conclusion}</p>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-32 text-center opacity-60">
                <Search className="w-16 h-16 mb-4 text-muted-foreground" />
                <h3 className="text-xl font-medium mb-2">Deep Research Protocol</h3>
                <p className="text-muted-foreground max-w-sm">
                  Enter any topic, question, or entity. Argus will synthesize information, extract insights, and draw conclusions.
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
