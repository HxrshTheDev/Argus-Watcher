import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import {
  useListConversations, useGetConversation, useCreateConversation,
  useDeleteConversation, getListConversationsQueryKey, getGetConversationQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { Plus, Trash2, MessageSquare, Mic, MicOff, Bot, User, ChevronLeft, Send, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

declare global {
  interface Window { SpeechRecognition: typeof SpeechRecognition; webkitSpeechRecognition: typeof SpeechRecognition; }
}

function useVoiceInput(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SR);
  }, []);

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.continuous = false; recognition.interimResults = true; recognition.lang = "en-US";
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) transcript += event.results[i][0].transcript;
      if (event.results[event.results.length - 1].isFinal) onTranscript(transcript.trim());
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, [onTranscript]);

  const stopListening = useCallback(() => { recognitionRef.current?.stop(); setIsListening(false); }, []);
  const toggle = useCallback(() => { if (isListening) stopListening(); else startListening(); }, [isListening, startListening, stopListening]);
  return { isListening, isSupported, toggle };
}

/* ── Conversation list ────────────────────────────────── */
function ConversationList({ conversations, activeId, onCreate, onSelect, onDelete, isCreating }: {
  conversations: any[]; activeId?: number;
  onCreate: () => void; onSelect: (id: number) => void;
  onDelete: (id: number, e: React.MouseEvent) => void; isCreating: boolean;
}) {
  return (
    <div className="flex flex-col h-full bg-sidebar">
      <div className="px-4 pt-6 pb-4">
        <h2 className="text-[15px] font-black tracking-tight mb-3">Conversations</h2>
        <button onClick={onCreate} disabled={isCreating}
          className="w-full flex items-center justify-center gap-2 h-9 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all disabled:opacity-50 shadow-sm shadow-primary/20 active:scale-95"
        >
          {isCreating
            ? <span className="w-3 h-3 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
            : <Plus className="w-3.5 h-3.5" />}
          New Chat
        </button>
      </div>
      <ScrollArea className="flex-1 px-2 pb-4">
        {conversations.length === 0 ? (
          <p className="text-[12px] text-muted-foreground text-center py-8 px-4">No conversations yet. Start one above.</p>
        ) : (
          <div className="space-y-0.5">
            {conversations.map((conv) => (
              <div key={conv.id}
                className={`group flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 ${activeId === conv.id ? "bg-primary/12 text-primary" : "hover:bg-sidebar-accent text-sidebar-foreground"}`}
                onClick={() => onSelect(conv.id)}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${activeId === conv.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    <MessageSquare className="w-3 h-3" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold truncate leading-tight">{conv.title}</p>
                    <p className="text-[10px] opacity-50 mt-0.5">{formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true })}</p>
                  </div>
                </div>
                <button
                  className="w-6 h-6 rounded-lg opacity-0 group-hover:opacity-100 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
                  onClick={(e) => onDelete(conv.id, e)}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

/* ── Chat window ──────────────────────────────────────── */
function ChatWindow({ id, conversation, isLoading, onBack }: {
  id: number; conversation: any; isLoading: boolean; onBack?: () => void;
}) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); };
  useEffect(() => { scrollToBottom(); }, [conversation?.messages, streamingContent]);

  const handleVoiceTranscript = useCallback((text: string) => {
    setInput(prev => prev ? `${prev} ${text}` : text);
    textareaRef.current?.focus();
  }, []);

  const { isListening, isSupported, toggle: toggleVoice } = useVoiceInput(handleVoiceTranscript);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isStreaming) return;
    const messageContent = input;
    setInput(""); setIsStreaming(true); setStreamingContent("");
    queryClient.setQueryData(getGetConversationQueryKey(id), (old: unknown) => {
      if (!old || typeof old !== "object") return old;
      const o = old as { messages?: unknown[] };
      return { ...o, messages: [...(o.messages || []), { id: Date.now(), conversationId: id, role: "user", content: messageContent, createdAt: new Date().toISOString() }] };
    });
    try {
      const response = await fetch(`${BASE}/api/openai/conversations/${id}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: messageContent }),
      });
      if (!response.body) throw new Error("No body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) setStreamingContent(prev => prev + data.content);
              if (data.done) queryClient.invalidateQueries({ queryKey: getGetConversationQueryKey(id) });
            } catch {}
          }
        }
      }
    } catch {}
    finally { setIsStreaming(false); setStreamingContent(""); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-border bg-background/80 glass z-10 shrink-0">
        {onBack && (
          <button onClick={onBack} className="w-8 h-8 rounded-xl flex items-center justify-center text-primary hover:bg-primary/10 transition-all active:scale-90">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shadow-sm">
          <Bot className="w-4.5 h-4.5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-[14px] leading-tight truncate tracking-tight">{conversation?.title ?? "Conversation"}</h2>
          <p className="text-[11px] text-muted-foreground">Argus AI · GPT-4.1</p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 sm:px-6">
        <div className="space-y-5 max-w-2xl mx-auto py-6">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            </div>
          ) : conversation?.messages?.length ? (
            conversation.messages.map((msg: any, i: number) => {
              const isUser = msg.role === "user";
              return (
                <div key={msg.id} className={`flex items-end gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}
                  style={{ animationDelay: `${i * 20}ms` }}>
                  {/* Avatar */}
                  <div className={`w-7 h-7 rounded-2xl flex items-center justify-center shrink-0 ${isUser ? "bg-gradient-to-br from-blue-500 to-primary" : "bg-gradient-to-br from-violet-500 to-violet-600"}`}>
                    {isUser ? <User className="w-3.5 h-3.5 text-white" /> : <Bot className="w-3.5 h-3.5 text-white" />}
                  </div>
                  {/* Bubble */}
                  <div className={`group max-w-[78%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
                    <div className={`px-4 py-3 text-sm leading-relaxed ${
                      isUser
                        ? "bg-gradient-to-br from-primary to-violet-600 text-white rounded-2xl rounded-br-sm shadow-lg shadow-primary/20"
                        : "bg-card border border-border text-foreground rounded-2xl rounded-bl-sm shadow-sm"
                    }`}>
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-center">
              <div className="relative mb-6">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-violet-500/20 to-blue-500/10 animate-pulse scale-110 blur-xl" />
                <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shadow-2xl shadow-violet-500/30">
                  <Bot className="w-9 h-9 text-white" />
                </div>
              </div>
              <h3 className="text-lg font-black tracking-tight text-foreground">Hi, I'm Argus</h3>
              <p className="text-sm mt-1.5 max-w-xs opacity-70 leading-relaxed">
                Ask me anything — tasks, research, writing, or just a chat. I'm here to help.
              </p>
            </div>
          )}

          {/* Streaming bubble */}
          {isStreaming && (
            <div className="flex items-end gap-2.5">
              <div className="w-7 h-7 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="max-w-[78%] px-4 py-3 bg-card border border-border rounded-2xl rounded-bl-sm shadow-sm text-sm leading-relaxed">
                <div className="whitespace-pre-wrap">{streamingContent}</div>
                {!streamingContent && (
                  <div className="flex gap-1 items-center h-5">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                )}
                {streamingContent && <span className="inline-block w-1 h-4 ml-0.5 bg-primary/70 animate-pulse rounded-sm align-middle" />}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input bar */}
      <div className="shrink-0 px-4 sm:px-6 pb-4 pt-3 border-t border-border/60 bg-background/80 glass">
        <form onSubmit={handleSend} className="max-w-2xl mx-auto">
          <div className={`flex items-end gap-2 bg-card border rounded-2xl px-4 py-2.5 transition-all duration-200 ${isListening ? "border-destructive/50 shadow-lg shadow-destructive/10" : "border-border focus-within:border-primary/40 focus-within:shadow-lg focus-within:shadow-primary/8"}`}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={autoResize}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? "🎤 Listening…" : "Message Argus…"}
              rows={1}
              disabled={isStreaming}
              className="flex-1 bg-transparent text-sm resize-none focus:outline-none placeholder:text-muted-foreground/50 leading-relaxed font-medium min-h-[22px] max-h-[120px] py-0.5"
            />
            <div className="flex items-center gap-1.5 shrink-0 pb-0.5">
              {isSupported && (
                <button type="button" onClick={toggleVoice} disabled={isStreaming}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90 ${isListening ? "bg-destructive/15 text-destructive" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                >
                  {isListening ? <MicOff className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
                </button>
              )}
              <button type="submit" disabled={!input.trim() || isStreaming}
                className="w-8 h-8 rounded-xl flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:scale-100 transition-all active:scale-90 shadow-sm shadow-primary/20"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {isListening && (
            <p className="text-[11px] text-destructive text-center mt-2 flex items-center justify-center gap-1.5 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
              Listening — speak now, tap mic to stop
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────── */
export default function Chat() {
  const isMobile = useIsMobile();
  const params = useParams();
  const id = params.id ? parseInt(params.id) : undefined;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: conversations = [] } = useListConversations();
  const { data: conversation, isLoading } = useGetConversation(id!, {
    query: { enabled: !!id, queryKey: getGetConversationQueryKey(id!) }
  });

  const createMutation = useCreateConversation();
  const deleteMutation = useDeleteConversation();

  const handleCreate = () => {
    createMutation.mutate({ data: { title: "New Conversation" } }, {
      onSuccess: (newConv) => {
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        setLocation(`/chat/${newConv.id}`);
      }
    });
  };

  const handleDelete = (convId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteMutation.mutate({ id: convId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        if (id === convId) setLocation("/chat");
      }
    });
  };

  /* ── Mobile ── */
  if (isMobile) {
    if (id) {
      return <ChatWindow id={id} conversation={conversation} isLoading={isLoading} onBack={() => setLocation("/chat")} />;
    }
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="px-5 pt-7 pb-4">
          <h1 className="text-[28px] font-black tracking-tight leading-none mb-4">Chat</h1>
          <button onClick={handleCreate} disabled={createMutation.isPending}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-2xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-50 shadow-lg shadow-primary/25 active:scale-[0.98]"
          >
            <Sparkles className="w-4 h-4" /> New Conversation
          </button>
        </div>
        <ScrollArea className="flex-1 px-4 pb-6">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-center">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center mb-5 shadow-xl shadow-violet-500/25">
                <MessageSquare className="w-7 h-7 text-white" />
              </div>
              <p className="font-bold text-sm text-foreground/60">No conversations yet</p>
              <p className="text-xs mt-1 opacity-50">Tap "New Conversation" to start</p>
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((conv) => (
                <div key={conv.id}
                  className="group flex items-center justify-between p-3.5 rounded-2xl border border-border bg-card hover:border-primary/20 hover:bg-muted/20 transition-all cursor-pointer active:scale-[0.98]"
                  onClick={() => setLocation(`/chat/${conv.id}`)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shrink-0 shadow-sm">
                      <MessageSquare className="w-4.5 h-4.5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate tracking-tight">{conv.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true })}</p>
                    </div>
                  </div>
                  <button onClick={(e) => handleDelete(conv.id, e)}
                    className="w-7 h-7 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    );
  }

  /* ── Desktop ── */
  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="w-60 border-r border-border shrink-0">
        <ConversationList
          conversations={conversations} activeId={id}
          onCreate={handleCreate} onSelect={(convId) => setLocation(`/chat/${convId}`)}
          onDelete={handleDelete} isCreating={createMutation.isPending}
        />
      </div>
      <div className="flex-1 overflow-hidden">
        {id ? (
          <ChatWindow id={id} conversation={conversation} isLoading={isLoading} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-6 p-8">
            <div className="relative">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-violet-500/20 to-blue-500/10 blur-2xl scale-125" />
              <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shadow-2xl shadow-violet-500/30">
                <Bot className="w-9 h-9 text-white" />
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-black tracking-tight text-foreground">Welcome to Argus Chat</h2>
              <p className="mt-2 max-w-sm text-sm opacity-60 leading-relaxed">Start a new conversation or pick one from the sidebar. Type or use your microphone.</p>
            </div>
            <button onClick={handleCreate} disabled={createMutation.isPending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/25 active:scale-95 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Start a New Chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
