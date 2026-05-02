import { useState } from "react";
import { 
  useListEmailDrafts, 
  useCreateEmailDraft, 
  useGenerateEmailDraft, 
  useSummarizeEmail, 
  useDeleteEmailDraft,
  getListEmailDraftsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Loader2, Plus, Send, Trash2, Sparkles, AlertTriangle, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Email() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("drafts");
  
  // State for Compose
  const [context, setContext] = useState("");
  const [recipient, setRecipient] = useState("");
  const [tone, setTone] = useState<"professional" | "casual" | "formal">("professional");
  const [generatedDraft, setGeneratedDraft] = useState<{subject: string, body: string} | null>(null);

  // State for Summarize
  const [emailToSummarize, setEmailToSummarize] = useState("");
  const [summaryResult, setSummaryResult] = useState<any>(null);

  // State for Send Confirmation
  const [draftToSend, setDraftToSend] = useState<number | null>(null);

  const { data: drafts, isLoading: draftsLoading } = useListEmailDrafts();
  
  const generateMutation = useGenerateEmailDraft();
  const createMutation = useCreateEmailDraft();
  const summarizeMutation = useSummarizeEmail();
  const deleteMutation = useDeleteEmailDraft();

  const handleGenerate = () => {
    if (!context.trim()) return;
    
    generateMutation.mutate(
      { data: { context, recipient, tone } },
      {
        onSuccess: (data) => {
          setGeneratedDraft(data);
        }
      }
    );
  };

  const handleSaveDraft = () => {
    if (!generatedDraft) return;

    createMutation.mutate(
      { 
        data: { 
          subject: generatedDraft.subject, 
          body: generatedDraft.body,
          recipient,
          context 
        } 
      },
      {
        onSuccess: () => {
          setGeneratedDraft(null);
          setContext("");
          setRecipient("");
          queryClient.invalidateQueries({ queryKey: getListEmailDraftsQueryKey() });
          setActiveTab("drafts");
        }
      }
    );
  };

  const handleSummarize = () => {
    if (!emailToSummarize.trim()) return;

    summarizeMutation.mutate(
      { data: { content: emailToSummarize } },
      {
        onSuccess: (data) => {
          setSummaryResult(data);
        }
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListEmailDraftsQueryKey() });
        }
      }
    );
  };

  const handleSend = () => {
    // Mock sending by deleting the draft for now
    if (draftToSend) {
      handleDelete(draftToSend);
      setDraftToSend(null);
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <div className="flex-1 flex flex-col p-8 max-w-6xl mx-auto w-full overflow-hidden">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Email Manager</h1>
          <p className="text-muted-foreground mt-1">Draft, summarize, and manage communications with AI.</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 max-w-md mb-6">
            <TabsTrigger value="drafts">Saved Drafts</TabsTrigger>
            <TabsTrigger value="compose">AI Compose</TabsTrigger>
            <TabsTrigger value="summarize">Summarize</TabsTrigger>
          </TabsList>

          <TabsContent value="drafts" className="flex-1 min-h-0 data-[state=active]:flex flex-col m-0 border-0 p-0">
            <Card className="flex-1 flex flex-col overflow-hidden border-border bg-card/50">
              <ScrollArea className="flex-1">
                {draftsLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Loading drafts...</div>
                ) : drafts?.length ? (
                  <div className="divide-y divide-border">
                    {drafts.map((draft) => (
                      <div key={draft.id} className="p-6 group hover:bg-muted/50 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-semibold text-lg">{draft.subject}</h3>
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="opacity-0 group-hover:opacity-100 h-8 text-primary border-primary/20 hover:bg-primary/10"
                              onClick={() => setDraftToSend(draft.id)}
                            >
                              <Send className="w-3.5 h-3.5 mr-2" /> Send
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="opacity-0 group-hover:opacity-100 h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDelete(draft.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        {draft.recipient && (
                          <div className="text-sm text-muted-foreground mb-3 flex items-center gap-1">
                            <Mail className="w-3 h-3" /> To: {draft.recipient}
                          </div>
                        )}
                        <div className="bg-background/50 p-4 rounded-md text-sm whitespace-pre-wrap border border-border/50">
                          {draft.body}
                        </div>
                        <div className="text-xs text-muted-foreground mt-4">
                          Created {formatDistanceToNow(new Date(draft.createdAt), { addSuffix: true })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <Mail className="w-12 h-12 mb-4 opacity-20" />
                    <p>No saved drafts.</p>
                    <Button variant="link" onClick={() => setActiveTab("compose")} className="mt-2 text-primary">
                      Compose a new email
                    </Button>
                  </div>
                )}
              </ScrollArea>
            </Card>
          </TabsContent>

          <TabsContent value="compose" className="flex-1 min-h-0 data-[state=active]:flex flex-col m-0 border-0 p-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
              <Card className="flex flex-col border-primary/20">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" /> Setup Context
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Recipient (Optional)</label>
                    <Input 
                      placeholder="e.g. investors@example.com" 
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tone</label>
                    <Select value={tone} onValueChange={(v: any) => setTone(v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select tone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="casual">Casual</SelectItem>
                        <SelectItem value="formal">Formal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 flex-1 flex flex-col">
                    <label className="text-sm font-medium">Context / Instructions</label>
                    <Textarea 
                      placeholder="What should this email be about? Provide bullet points or rough thoughts..." 
                      className="flex-1 resize-none min-h-[150px]"
                      value={context}
                      onChange={(e) => setContext(e.target.value)}
                    />
                  </div>
                </CardContent>
                <CardFooter className="pt-0">
                  <Button 
                    className="w-full gap-2" 
                    onClick={handleGenerate}
                    disabled={!context.trim() || generateMutation.isPending}
                  >
                    {generateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Generate Draft
                  </Button>
                </CardFooter>
              </Card>

              <Card className="flex flex-col bg-card/50 overflow-hidden">
                <CardHeader>
                  <CardTitle className="text-lg">Generated Draft</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 p-0">
                  <ScrollArea className="h-full p-6 pt-0">
                    {generatedDraft ? (
                      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Subject</label>
                          <Input 
                            value={generatedDraft.subject} 
                            onChange={(e) => setGeneratedDraft({...generatedDraft, subject: e.target.value})}
                            className="mt-1 font-semibold"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Body</label>
                          <Textarea 
                            value={generatedDraft.body} 
                            onChange={(e) => setGeneratedDraft({...generatedDraft, body: e.target.value})}
                            className="mt-1 min-h-[300px]"
                          />
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button className="flex-1 gap-2" onClick={handleSaveDraft} disabled={createMutation.isPending}>
                            <Plus className="w-4 h-4" /> Save to Drafts
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground opacity-50 flex-col gap-2 pt-20">
                        <Mail className="w-12 h-12" />
                        <p>Your generated draft will appear here</p>
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="summarize" className="flex-1 min-h-0 data-[state=active]:flex flex-col m-0 border-0 p-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
              <Card className="flex flex-col">
                <CardHeader>
                  <CardTitle className="text-lg">Input Email</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <Textarea 
                    placeholder="Paste a long email thread here..." 
                    className="flex-1 resize-none min-h-[300px]"
                    value={emailToSummarize}
                    onChange={(e) => setEmailToSummarize(e.target.value)}
                  />
                </CardContent>
                <CardFooter>
                  <Button 
                    className="w-full gap-2" 
                    onClick={handleSummarize}
                    disabled={!emailToSummarize.trim() || summarizeMutation.isPending}
                  >
                    {summarizeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Summarize
                  </Button>
                </CardFooter>
              </Card>

              <Card className="flex flex-col bg-card/50 overflow-hidden">
                <CardHeader>
                  <CardTitle className="text-lg">Summary</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 p-0">
                  <ScrollArea className="h-full p-6 pt-0">
                    {summaryResult ? (
                      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {summaryResult.actionRequired && (
                          <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-lg flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                            <div>
                              <h4 className="font-semibold">Action Required</h4>
                              <p className="text-sm mt-1">This email requires your attention or a response.</p>
                            </div>
                          </div>
                        )}
                        
                        <div>
                          <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-2">TL;DR</h4>
                          <p className="text-lg font-medium leading-relaxed">{summaryResult.summary}</p>
                        </div>
                        
                        {summaryResult.keyPoints?.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">Key Points</h4>
                            <ul className="space-y-2">
                              {summaryResult.keyPoints.map((point: string, i: number) => (
                                <li key={i} className="flex gap-2 items-start">
                                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                                  <span className="leading-relaxed">{point}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground opacity-50 flex-col gap-2 pt-20">
                        <Search className="w-12 h-12" />
                        <p>Summary will appear here</p>
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Send Confirmation Dialog */}
      <Dialog open={!!draftToSend} onOpenChange={(open) => !open && setDraftToSend(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Send</DialogTitle>
            <DialogDescription>
              Are you sure you want to send this email? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDraftToSend(null)}>Cancel</Button>
            <Button onClick={handleSend} className="gap-2">
              <Send className="w-4 h-4" /> Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
