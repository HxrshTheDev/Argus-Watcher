import { useState, useRef, useEffect, useCallback, memo } from "react";
import { useParams, useLocation } from "wouter";
import {
  useListConversations, useGetConversation, useCreateConversation,
  useDeleteConversation, getListConversationsQueryKey, getGetConversationQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Plus, Trash2, MessageSquare, Mic, MicOff, Bot,
  ChevronLeft, Send, Sparkles, Search, Copy, Check,
  SquarePen, Keyboard,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ── Voice input ─────────────────────────────────────────── */
function useVoiceInput(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SR);
  }, []);

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.continuous = false; recognition.interimResults = true; recognition.lang = "en-US";
    recognition.onstart  = () => setIsListening(true);
    recognition.onend    = () => setIsListening(false);
    recognition.onerror  = () => setIsListening(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let t = "";
      for (let i = event.resultIndex; i < event.results.length; i++) t += event.results[i][0].transcript;
      if (event.results[event.results.length - 1].isFinal) onTranscript(t.trim());
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, [onTranscript]);

  const stopListening = useCallback(() => { recognitionRef.current?.stop(); setIsListening(false); }, []);
  const toggle = useCallback(() => { isListening ? stopListening() : startListening(); }, [isListening, startListening, stopListening]);
  return { isListening, isSupported, toggle };
}

/* ── Copy button ─────────────────────────────────────────── */
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <button onClick={copy} title="Copy" className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-all active:scale-90">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

/* ── Typing dots ─────────────────────────────────────────── */
function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 150, 300].map(d => (
        <span key={d} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: `${d}ms` }} />
      ))}
    </div>
  );
}

/* ── AI prose message ────────────────────────────────────── */
const AIMessage = memo(function AIMessage({ content, streaming }: { content: string; streaming?: boolean }) {
  return (
    <div className="flex gap-4 group">
      <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm shadow-violet-500/20">
        <Bot className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="flex-1 min-w-0 pb-1">
        {content ? (
          <>
            <div className="chat-prose text-[14px] leading-7 text-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
              {streaming && <span className="inline-block w-0.5 h-4 bg-primary/60 animate-pulse rounded-sm align-middle ml-0.5" />}
            </div>
            {!streaming && (
              <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <CopyBtn text={content} />
              </div>
            )}
          </>
        ) : (
          <TypingDots />
        )}
      </div>
    </div>
  );
});

/* ── User message ────────────────────────────────────────── */
const UserMessage = memo(function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end group">
      <div className="max-w-[78%]">
        <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-3 text-[14px] leading-relaxed shadow-sm shadow-primary/15 whitespace-pre-wrap">
          {content}
        </div>
        <div className="flex justify-end mt-1 opacity-0 group-hover:opacity-100 transition-opacity pr-1">
          <CopyBtn text={content} />
        </div>
      </div>
    </div>
  );
});

/* ── Suggested prompts ───────────────────────────────────── */
const SUGGESTIONS = [
  { icon: "📋", text: "Summarise my pending tasks and help me prioritise" },
  { icon: "💡", text: "Give me 5 ideas for a side project I could build in a weekend" },
  { icon: "📝", text: "Help me write a professional email declining a meeting" },
  { icon: "🔬", text: "Explain quantum computing in simple terms" },
];

function EmptyState({ onSuggest }: { onSuggest: (s: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 px-6 text-center">
      <div className="relative mb-8">
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-violet-500/25 to-blue-500/12 blur-2xl scale-110" />
        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shadow-2xl shadow-violet-500/30">
          <Bot className="w-8 h-8 text-white" />
        </div>
      </div>
      <h3 className="text-xl font-bold tracking-tight text-foreground">How can I help?</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-xs leading-relaxed">
        Ask me anything — I can help with tasks, writing, research, and more.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-8 w-full max-w-lg">
        {SUGGESTIONS.map(s => (
          <button key={s.text} onClick={() => onSuggest(s.text)}
            className="flex items-start gap-3 p-3.5 rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-primary/3 text-left text-[13px] text-muted-foreground hover:text-foreground transition-all group">
            <span className="text-base shrink-0">{s.icon}</span>
            <span className="leading-snug">{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Conversation list ───────────────────────────────────── */
function ConversationList({ conversations, activeId, onCreate, onSelect, onDelete, isCreating }: {
  conversations: any[]; activeId?: number;
  onCreate: () => void; onSelect: (id: number) => void;
  onDelete: (id: number, e: React.MouseEvent) => void; isCreating: boolean;
}) {
  const [search, setSearch] = useState("");
  const filtered = conversations.filter(c => c.title?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col h-full bg-sidebar border-r border-border">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">Conversations</span>
          <button onClick={onCreate} disabled={isCreating} title="New chat"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all disabled:opacity-40 active:scale-90">
            {isCreating
              ? <span className="w-3 h-3 rounded-full border-2 border-primary/40 border-t-primary animate-spin" />
              : <SquarePen className="w-3.5 h-3.5" />}
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 inset-y-0 my-auto w-3 h-3 text-muted-foreground/40 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            className="w-full pl-7 pr-3 h-7 text-[12px] rounded-lg bg-muted/50 border border-border/50 focus:border-primary/30 focus:bg-muted/80 focus:outline-none transition-all placeholder:text-muted-foreground/40" />
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1 px-2 pb-4">
        {filtered.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[12px] text-muted-foreground/50">
              {search ? "No matches" : "No conversations yet"}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map(conv => (
              <div key={conv.id}
                className={`group flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150
                  ${activeId === conv.id ? "bg-primary/10 text-primary" : "hover:bg-muted/60 text-foreground/80"}`}
                onClick={() => onSelect(conv.id)}>
                <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${activeId === conv.id ? "text-primary" : "text-muted-foreground/50"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium truncate leading-tight">{conv.title}</p>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                    {formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true })}
                  </p>
                </div>
                <button
                  className="w-5 h-5 rounded-md opacity-0 group-hover:opacity-100 flex items-center justify-center text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
                  onClick={e => onDelete(conv.id, e)}>
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

/* ── Chat window ─────────────────────────────────────────── */
function ChatWindow({ id, conversation, isLoading, onBack }: {
  id: number; conversation: any; isLoading: boolean; onBack?: () => void;
}) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const scrollAreaRef  = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [conversation?.messages?.length, streamingContent, scrollToBottom]);

  const handleVoiceTranscript = useCallback((text: string) => {
    setInput(prev => prev ? `${prev} ${text}` : text);
    textareaRef.current?.focus();
  }, []);

  const { isListening, isSupported, toggle: toggleVoice } = useVoiceInput(handleVoiceTranscript);

  const handleSend = async (overrideInput?: string) => {
    const content = (overrideInput ?? input).trim();
    if (!content || isStreaming) return;
    setInput(""); setIsStreaming(true); setStreamingContent("");

    // Optimistic user message
    queryClient.setQueryData(getGetConversationQueryKey(id), (old: unknown) => {
      if (!old || typeof old !== "object") return old;
      const o = old as { messages?: unknown[] };
      return { ...o, messages: [...(o.messages || []), { id: Date.now(), conversationId: id, role: "user", content, createdAt: new Date().toISOString() }] };
    });

    // Reset textarea height
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }

    try {
      const r = await fetch(`${BASE}/api/openai/conversations/${id}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }),
      });
      if (!r.body) throw new Error();
      const reader = r.body.getReader(); const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value, { stream: true }).split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const d = JSON.parse(line.slice(6));
              if (d.content) setStreamingContent(p => (p ?? "") + d.content);
              if (d.done) queryClient.invalidateQueries({ queryKey: getGetConversationQueryKey(id) });
            } catch { /* noop */ }
          }
        }
      }
    } catch { /* noop */ }
    finally { setIsStreaming(false); setStreamingContent(null); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target; el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  };

  const messages = conversation?.messages ?? [];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 sm:px-5 h-14 border-b border-border bg-background/90 glass shrink-0 z-10">
        {onBack && (
          <button onClick={onBack} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all active:scale-90">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shadow-sm shrink-0">
            <Bot className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold leading-tight truncate tracking-tight">{conversation?.title ?? "New Chat"}</h2>
            <p className="text-[10px] text-muted-foreground/60">Argus · GPT-4.1</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollAreaRef} className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-5 h-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            </div>
          ) : messages.length === 0 && !isStreaming ? (
            <EmptyState onSuggest={(s) => handleSend(s)} />
          ) : (
            <div className="space-y-6">
              {messages.map((msg: any) =>
                msg.role === "user"
                  ? <UserMessage key={msg.id} content={msg.content} />
                  : <AIMessage key={msg.id} content={msg.content} />
              )}
              {isStreaming && (
                <AIMessage content={streamingContent ?? ""} streaming />
              )}
            </div>
          )}
          <div ref={messagesEndRef} className="h-6" />
        </div>
      </div>

      {/* Input bar */}
      <div className="shrink-0 px-4 sm:px-6 pb-5 pt-3 border-t border-border/50 bg-background/90 glass">
        <div className="max-w-2xl mx-auto">
          <div className={`flex items-end gap-2 rounded-2xl border px-4 py-3 bg-card transition-all duration-200
            ${isListening
              ? "border-destructive/40 shadow-lg shadow-destructive/8"
              : "border-border focus-within:border-primary/35 focus-within:shadow-lg focus-within:shadow-primary/6"}`}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={autoResize}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? "🎤 Listening…" : "Message Argus…"}
              rows={1}
              disabled={isStreaming}
              className="flex-1 bg-transparent text-[14px] resize-none focus:outline-none placeholder:text-muted-foreground/40 leading-relaxed min-h-[22px] max-h-[140px] py-0.5 disabled:opacity-60"
            />
            <div className="flex items-center gap-1 shrink-0 pb-0.5">
              {isSupported && (
                <button type="button" onClick={toggleVoice} disabled={isStreaming}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90
                    ${isListening ? "bg-destructive/12 text-destructive" : "text-muted-foreground/50 hover:text-foreground hover:bg-muted"}`}>
                  {isListening ? <MicOff className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
                </button>
              )}
              <button onClick={() => handleSend()} disabled={!input.trim() || isStreaming}
                className="w-8 h-8 rounded-xl flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-35 transition-all active:scale-90 shadow-sm shadow-primary/20">
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between mt-2 px-1">
            {isListening ? (
              <p className="text-[11px] text-destructive flex items-center gap-1.5 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                Listening — speak now
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground/35">
                <kbd className="font-mono">Shift+Enter</kbd> for new line
              </p>
            )}
            {input.length > 100 && (
              <p className={`text-[11px] font-mono ${input.length > 3800 ? "text-destructive" : "text-muted-foreground/40"}`}>
                {input.length}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────────── */
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
        <div className="px-5 pt-7 pb-4 border-b border-border shrink-0">
          <h1 className="text-[22px] font-bold tracking-tight mb-4">Chat</h1>
          <button onClick={handleCreate} disabled={createMutation.isPending}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-50 shadow-lg shadow-primary/20 active:scale-[0.98]">
            <Sparkles className="w-4 h-4" /> New Conversation
          </button>
        </div>
        <ScrollArea className="flex-1 px-4 py-3">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center mb-5 shadow-xl shadow-violet-500/20">
                <MessageSquare className="w-6 h-6 text-white" />
              </div>
              <p className="text-sm font-semibold text-muted-foreground">No conversations yet</p>
              <p className="text-xs text-muted-foreground/50 mt-1">Tap "New Conversation" to start</p>
            </div>
          ) : (
            <div className="space-y-1">
              {conversations.map(conv => (
                <div key={conv.id}
                  className="group flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:border-primary/20 hover:bg-primary/2 transition-all cursor-pointer active:scale-[0.98]"
                  onClick={() => setLocation(`/chat/${conv.id}`)}>
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shrink-0 shadow-sm">
                    <MessageSquare className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[13px] truncate">{conv.title}</p>
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                      {formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true })}
                    </p>
                  </div>
                  <button onClick={e => handleDelete(conv.id, e)}
                    className="w-7 h-7 rounded-lg opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-destructive/10 hover:text-destructive text-muted-foreground/50 transition-all">
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
      {/* Sidebar */}
      <div className="w-56 shrink-0">
        <ConversationList
          conversations={conversations} activeId={id}
          onCreate={handleCreate} onSelect={(convId) => setLocation(`/chat/${convId}`)}
          onDelete={handleDelete} isCreating={createMutation.isPending}
        />
      </div>

      {/* Main */}
      <div className="flex-1 overflow-hidden">
        {id ? (
          <ChatWindow id={id} conversation={conversation} isLoading={isLoading} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-7 p-8">
            <div className="relative">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-violet-500/20 to-blue-500/10 blur-2xl scale-125" />
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shadow-2xl shadow-violet-500/25">
                <Bot className="w-8 h-8 text-white" />
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold tracking-tight">Welcome to Argus Chat</h2>
              <p className="mt-2 text-sm text-muted-foreground/70 max-w-xs leading-relaxed">
                Start a new conversation or select one from the sidebar.
              </p>
            </div>
            <button onClick={handleCreate} disabled={createMutation.isPending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-95 disabled:opacity-50">
              <Plus className="w-4 h-4" /> New Conversation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
