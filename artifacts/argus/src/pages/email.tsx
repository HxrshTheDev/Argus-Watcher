import { useState } from "react";
import { 
  useListEmailDrafts, 
  useCreateEmailDraft, 
  useGenerateEmailDraft, 
  useSummarizeEmail, 
  useDeleteEmailDraft,
  getListEmailDraftsQueryKey
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Loader2, Plus, Send, Trash2, Sparkles, AlertTriangle, Search, Inbox, Reply, RefreshCw, Eye, CheckCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
  isUnread: boolean;
}

interface GmailFullMessage extends GmailMessage {
  to: string;
  body: string;
}

function useGmailInbox() {
  return useQuery<{ messages: GmailMessage[] }>({
    queryKey: ["gmail", "inbox"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/gmail/inbox?maxResults=15`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? "Failed to fetch inbox");
      }
      return res.json();
    },
    retry: false,
  });
}

function useGmailMessage(id: string | null) {
  return useQuery<GmailFullMessage>({
    queryKey: ["gmail", "message", id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/gmail/messages/${id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? "Failed to fetch message");
      }
      return res.json();
    },
    enabled: !!id,
    retry: false,
  });
}

export default function Email() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("inbox");
  
  const [context, setContext] = useState("");
  const [recipient, setRecipient] = useState("");
  const [tone, setTone] = useState<"professional" | "casual" | "formal">("professional");
  const [generatedDraft, setGeneratedDraft] = useState<{subject: string, body: string} | null>(null);

  const [emailToSummarize, setEmailToSummarize] = useState("");
  const [summaryResult, setSummaryResult] = useState<{summary: string; keyPoints: string[]; actionRequired: boolean} | null>(null);

  const [draftToSend, setDraftToSend] = useState<number | null>(null);

  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState<{subject: string; to: string; body: string} | null>(null);
  const [replyLoading, setReplyLoading] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [replyTone, setReplyTone] = useState<"professional" | "casual" | "formal">("professional");
  const [replyInstructions, setReplyInstructions] = useState("");

  const { data: drafts, isLoading: draftsLoading } = useListEmailDrafts();
  const { data: inbox, isLoading: inboxLoading, error: inboxError, refetch: refetchInbox } = useGmailInbox();
  const { data: selectedMessage, isLoading: messageLoading } = useGmailMessage(selectedMessageId);

  const generateMutation = useGenerateEmailDraft();
  const createMutation = useCreateEmailDraft();
  const summarizeMutation = useSummarizeEmail();
  const deleteMutation = useDeleteEmailDraft();

  const handleGenerate = () => {
    if (!context.trim()) return;
    generateMutation.mutate(
      { data: { context, recipient, tone } },
      { onSuccess: (data) => setGeneratedDraft(data) }
    );
  };

  const handleSaveDraft = () => {
    if (!generatedDraft) return;
    createMutation.mutate(
      { data: { subject: generatedDraft.subject, body: generatedDraft.body, recipient, context } },
      {
        onSuccess: () => {
          setGeneratedDraft(null);
          setContext("");
          setRecipient("");
          queryClient.invalidateQueries({ queryKey: getListEmailDraftsQueryKey() });
          setActiveTab("drafts");
          toast({ title: "Draft saved successfully" });
        }
      }
    );
  };

  const handleSummarize = () => {
    if (!emailToSummarize.trim()) return;
    summarizeMutation.mutate(
      { data: { content: emailToSummarize } },
      { onSuccess: (data) => setSummaryResult(data) }
    );
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(
      { id },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListEmailDraftsQueryKey() }) }
    );
  };

  const handleSend = () => {
    if (draftToSend) {
      handleDelete(draftToSend);
      setDraftToSend(null);
      toast({ title: "Email sent" });
    }
  };

  const handleSendGmailReply = async (autoSend: boolean) => {
    if (!selectedMessageId) return;
    if (autoSend) setSendingReply(true);
    else setReplyLoading(true);

    try {
      const res = await fetch(`${BASE}/api/gmail/reply/${selectedMessageId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone: replyTone, instructions: replyInstructions, autoSend }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      if (autoSend) {
        toast({ title: "Reply sent", description: `Replied to: ${selectedMessage?.subject}` });
        setSelectedMessageId(null);
        setReplyDraft(null);
        refetchInbox();
      } else {
        setReplyDraft({ subject: data.subject, to: data.to, body: data.body });
      }
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSendingReply(false);
      setReplyLoading(false);
    }
  };

  const handleMarkRead = async (messageId: string) => {
    try {
      await fetch(`${BASE}/api/gmail/mark-read/${messageId}`, { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["gmail", "inbox"] });
    } catch {}
  };

  const handleSendDraftReply = async () => {
    if (!replyDraft) return;
    setSendingReply(true);
    try {
      const res = await fetch(`${BASE}/api/gmail/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: replyDraft.to, subject: replyDraft.subject, body: replyDraft.body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast({ title: "Reply sent" });
      setReplyDraft(null);
      setSelectedMessageId(null);
      refetchInbox();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSendingReply(false);
    }
  };

  const gmailConnected = !inboxError || !(inboxError as Error)?.message?.includes("not connected");

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <div className="flex-1 flex flex-col p-8 max-w-6xl mx-auto w-full overflow-hidden">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Email Manager</h1>
          <p className="text-muted-foreground mt-1">Inbox, drafts, compose and summarize with AI.</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-4 max-w-lg mb-6">
            <TabsTrigger value="inbox" className="gap-2">
              <Inbox className="w-3.5 h-3.5" /> Inbox
            </TabsTrigger>
            <TabsTrigger value="drafts">Saved Drafts</TabsTrigger>
            <TabsTrigger value="compose">AI Compose</TabsTrigger>
            <TabsTrigger value="summarize">Summarize</TabsTrigger>
          </TabsList>

          {/* INBOX TAB */}
          <TabsContent value="inbox" className="flex-1 min-h-0 data-[state=active]:flex flex-col m-0 border-0 p-0">
            {inboxError && (inboxError as Error).message?.includes("not connected") ? (
              <Card className="flex-1 flex flex-col items-center justify-center border-dashed border-2">
                <CardContent className="text-center py-16">
                  <Mail className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <h3 className="text-xl font-semibold mb-2">Gmail Not Connected</h3>
                  <p className="text-muted-foreground max-w-sm">
                    Connect your Gmail account to check your inbox, read emails, and let AI draft replies for you.
                  </p>
                  <p className="text-sm text-muted-foreground mt-4 bg-muted/50 p-3 rounded-lg">
                    Click the Gmail integration button in your Replit sidebar to connect your account.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="flex gap-4 h-full">
                {/* Message List */}
                <Card className="w-80 flex-shrink-0 flex flex-col overflow-hidden">
                  <CardHeader className="py-3 px-4 border-b flex-row items-center justify-between">
                    <CardTitle className="text-sm font-semibold">Inbox</CardTitle>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetchInbox()}>
                      <RefreshCw className={`w-3.5 h-3.5 ${inboxLoading ? "animate-spin" : ""}`} />
                    </Button>
                  </CardHeader>
                  <ScrollArea className="flex-1">
                    {inboxLoading ? (
                      <div className="p-4 flex flex-col gap-2">
                        {[...Array(5)].map((_, i) => (
                          <div key={i} className="h-16 rounded-md bg-muted/40 animate-pulse" />
                        ))}
                      </div>
                    ) : inbox?.messages?.length ? (
                      <div className="divide-y divide-border">
                        {inbox.messages.map((msg) => (
                          <button
                            key={msg.id}
                            className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${selectedMessageId === msg.id ? "bg-primary/10 border-l-2 border-primary" : ""}`}
                            onClick={() => { setSelectedMessageId(msg.id); setReplyDraft(null); handleMarkRead(msg.id); }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-1 min-w-0">
                                {msg.isUnread && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                                <span className={`text-xs truncate ${msg.isUnread ? "font-semibold" : "text-muted-foreground"}`}>
                                  {msg.from.replace(/<.*>/, "").trim() || msg.from}
                                </span>
                              </div>
                            </div>
                            <p className={`text-sm truncate mt-1 ${msg.isUnread ? "font-medium" : ""}`}>{msg.subject || "(no subject)"}</p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{msg.snippet}</p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 text-center text-muted-foreground text-sm">
                        <Inbox className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p>Inbox is empty</p>
                      </div>
                    )}
                  </ScrollArea>
                </Card>

                {/* Message Detail + Reply */}
                <div className="flex-1 flex flex-col gap-4 min-w-0">
                  {selectedMessageId ? (
                    <>
                      <Card className="flex flex-col overflow-hidden flex-1">
                        {messageLoading ? (
                          <div className="p-8 text-center text-muted-foreground">
                            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading...
                          </div>
                        ) : selectedMessage ? (
                          <>
                            <CardHeader className="border-b">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <CardTitle className="text-lg">{selectedMessage.subject || "(no subject)"}</CardTitle>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    From: <span className="text-foreground">{selectedMessage.from}</span>
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-0.5">{selectedMessage.date}</p>
                                </div>
                                {selectedMessage.isUnread && (
                                  <Badge variant="secondary" className="shrink-0">Unread</Badge>
                                )}
                              </div>
                            </CardHeader>
                            <ScrollArea className="flex-1">
                              <CardContent className="py-4 whitespace-pre-wrap text-sm leading-relaxed font-mono">
                                {selectedMessage.body || selectedMessage.snippet}
                              </CardContent>
                            </ScrollArea>
                          </>
                        ) : null}
                      </Card>

                      {/* AI Reply Panel */}
                      <Card className="border-primary/20">
                        <CardHeader className="py-3 pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-primary" /> AI Reply
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pb-3 space-y-3">
                          <div className="flex gap-3">
                            <div className="flex-1">
                              <Select value={replyTone} onValueChange={(v) => setReplyTone(v as typeof replyTone)}>
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="professional">Professional</SelectItem>
                                  <SelectItem value="casual">Casual</SelectItem>
                                  <SelectItem value="formal">Formal</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <Input
                              placeholder="Additional instructions (optional)"
                              className="flex-1 h-8 text-xs"
                              value={replyInstructions}
                              onChange={(e) => setReplyInstructions(e.target.value)}
                            />
                          </div>
                          {replyDraft ? (
                            <div className="space-y-2">
                              <Textarea
                                value={replyDraft.body}
                                onChange={(e) => setReplyDraft({ ...replyDraft, body: e.target.value })}
                                className="min-h-[100px] text-sm resize-none"
                              />
                              <div className="flex gap-2">
                                <Button size="sm" className="gap-2 flex-1" onClick={handleSendDraftReply} disabled={sendingReply}>
                                  {sendingReply ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                  Send Reply
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setReplyDraft(null)}>Discard</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" className="gap-2 flex-1" onClick={() => handleSendGmailReply(false)} disabled={replyLoading}>
                                {replyLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Reply className="w-3.5 h-3.5" />}
                                Draft Reply
                              </Button>
                              <Button size="sm" className="gap-2 flex-1" onClick={() => handleSendGmailReply(true)} disabled={sendingReply}>
                                {sendingReply ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                AI Auto-Reply
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </>
                  ) : (
                    <Card className="flex-1 flex items-center justify-center border-dashed">
                      <div className="text-center text-muted-foreground">
                        <Mail className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>Select an email to read and reply</p>
                      </div>
                    </Card>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* SAVED DRAFTS TAB */}
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

          {/* AI COMPOSE TAB */}
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
                    <Input placeholder="e.g. investors@example.com" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tone</label>
                    <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <Button className="w-full gap-2" onClick={handleGenerate} disabled={!context.trim() || generateMutation.isPending}>
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
                          <Input value={generatedDraft.subject} onChange={(e) => setGeneratedDraft({ ...generatedDraft, subject: e.target.value })} className="mt-1 font-semibold" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Body</label>
                          <Textarea value={generatedDraft.body} onChange={(e) => setGeneratedDraft({ ...generatedDraft, body: e.target.value })} className="mt-1 min-h-[300px]" />
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

          {/* SUMMARIZE TAB */}
          <TabsContent value="summarize" className="flex-1 min-h-0 data-[state=active]:flex flex-col m-0 border-0 p-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
              <Card className="flex flex-col">
                <CardHeader>
                  <CardTitle className="text-lg">Input Email</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <Textarea placeholder="Paste a long email thread here..." className="flex-1 resize-none min-h-[300px]" value={emailToSummarize} onChange={(e) => setEmailToSummarize(e.target.value)} />
                </CardContent>
                <CardFooter>
                  <Button className="w-full gap-2" onClick={handleSummarize} disabled={!emailToSummarize.trim() || summarizeMutation.isPending}>
                    {summarizeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Summarize
                  </Button>
                </CardFooter>
              </Card>

              <Card className="flex flex-col bg-card/50 overflow-hidden">
                <CardHeader><CardTitle className="text-lg">Summary</CardTitle></CardHeader>
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
                              {summaryResult.keyPoints.map((point, i) => (
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
            <DialogDescription>Are you sure you want to send this email? This action cannot be undone.</DialogDescription>
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
