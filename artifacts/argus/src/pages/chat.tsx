import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import {
  useListConversations,
  useGetConversation,
  useCreateConversation,
  useDeleteConversation,
  getListConversationsQueryKey,
  getGetConversationQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { Plus, Send, Trash2, MessageSquare, Mic, MicOff, Bot, User, ChevronLeft } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
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
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (event.results[event.results.length - 1].isFinal) onTranscript(transcript.trim());
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, [onTranscript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (isListening) stopListening(); else startListening();
  }, [isListening, startListening, stopListening]);

  return { isListening, isSupported, toggle };
}

/* ─── Conversation list ─────────────────────────────────── */
function ConversationList({
  conversations, activeId, onCreate, onSelect, onDelete, isCreating,
}: {
  conversations: any[];
  activeId?: number;
  onCreate: () => void;
  onSelect: (id: number) => void;
  onDelete: (id: number, e: React.MouseEvent) => void;
  isCreating: boolean;
}) {
  return (
    <div className="flex flex-col h-full bg-card/30">
      <div className="p-3 border-b border-border">
        <Button onClick={onCreate} className="w-full gap-2 h-9" size="sm" disabled={isCreating}>
          <Plus className="w-4 h-4" /> New Chat
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {conversations?.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6 px-2">No conversations yet. Start one above.</p>
          )}
          {conversations?.map((conv) => (
            <div key={conv.id}
              className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors ${activeId === conv.id ? "bg-primary/10 text-primary" : "hover:bg-muted/60"}`}
              onClick={() => onSelect(conv.id)}
            >
              <div className="flex items-center gap-2 overflow-hidden min-w-0">
                <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />
                <div className="min-w-0">
                  <div className="font-medium truncate text-sm">{conv.title}</div>
                  <div className="text-[10px] opacity-50 mt-0.5">{formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true })}</div>
                </div>
              </div>
              <Button variant="ghost" size="icon"
                className="w-6 h-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0 ml-1"
                onClick={(e) => onDelete(conv.id, e)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ─── Chat window ─────────────────────────────────────────── */
function ChatWindow({
  id, conversation, isLoading, onBack,
}: {
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
    setInput("");
    setIsStreaming(true);
    setStreamingContent("");

    queryClient.setQueryData(getGetConversationQueryKey(id), (old: unknown) => {
      if (!old || typeof old !== "object") return old;
      const o = old as { messages?: unknown[] };
      return { ...o, messages: [...(o.messages || []), { id: Date.now(), conversationId: id, role: "user", content: messageContent, createdAt: new Date().toISOString() }] };
    });

    try {
      const response = await fetch(`${BASE}/api/openai/conversations/${id}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: messageContent }),
      });
      if (!response.body) throw new Error("No response body");
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

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-4 sm:px-6 py-3 border-b border-border bg-background/80 backdrop-blur-sm z-10 flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-muted text-primary shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <div className="bg-primary/10 text-primary p-1.5 rounded-full shrink-0">
          <Bot className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold text-sm leading-none truncate">{conversation?.title || "Conversation"}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Argus AI</p>
        </div>
      </div>

      <ScrollArea className="flex-1 px-4">
        <div className="space-y-4 max-w-3xl mx-auto py-6">
          {isLoading ? (
            <div className="flex justify-center p-8 opacity-40 text-sm">Loading…</div>
          ) : conversation?.messages?.length ? (
            conversation.messages.map((msg: any) => (
              <div key={msg.id} className={`flex items-start gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {msg.role === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>
                <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted text-foreground rounded-tl-sm"}`}>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-16 text-muted-foreground flex flex-col items-center gap-3">
              <Bot className="w-10 h-10 opacity-20" />
              <div>
                <p className="font-medium">Hi, I'm Argus</p>
                <p className="text-sm opacity-70 mt-1">Ask me anything — I can help with tasks, research, writing and more.</p>
              </div>
            </div>
          )}

          {isStreaming && (
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="max-w-[78%] rounded-2xl rounded-tl-sm px-4 py-2.5 bg-muted text-foreground text-sm leading-relaxed">
                <div className="whitespace-pre-wrap">{streamingContent}</div>
                <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-primary/70 animate-pulse rounded-sm" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="p-3 sm:p-4 bg-background border-t border-border">
        <form onSubmit={handleSend} className="max-w-3xl mx-auto">
          <div className="relative flex items-end gap-2 bg-card border border-input rounded-2xl shadow-sm px-4 py-2 focus-within:ring-1 focus-within:ring-primary/40 transition-shadow">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? "🎤 Listening…" : "Message Argus…"}
              className="flex-1 border-0 shadow-none focus-visible:ring-0 bg-transparent resize-none min-h-[24px] max-h-[120px] py-1 text-sm"
              rows={1}
              disabled={isStreaming}
            />
            <div className="flex items-center gap-1 mb-0.5 shrink-0">
              {isSupported && (
                <Button type="button" size="icon" variant="ghost"
                  className={`h-8 w-8 rounded-lg transition-colors ${isListening ? "text-destructive bg-destructive/10 hover:bg-destructive/20" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={toggleVoice} disabled={isStreaming}
                >
                  {isListening ? <MicOff className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
                </Button>
              )}
              <Button type="submit" size="icon" className="h-8 w-8 rounded-lg" disabled={!input.trim() || isStreaming}>
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          {isListening && (
            <p className="text-xs text-destructive text-center mt-2 flex items-center justify-center gap-1">
              <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              Listening — speak now, click mic to stop
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

/* ─── Main ───────────────────────────────────────────────── */
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

  const handleSelect = (convId: number) => { setLocation(`/chat/${convId}`); };

  /* ── Mobile: show list OR chat (not both) ── */
  if (isMobile) {
    if (id) {
      return (
        <ChatWindow
          id={id}
          conversation={conversation}
          isLoading={isLoading}
          onBack={() => setLocation("/chat")}
        />
      );
    }
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 pt-5 pb-3 border-b border-border">
          <h1 className="text-xl font-bold mb-3">Chat</h1>
          <Button onClick={handleCreate} className="w-full gap-2 h-10" disabled={createMutation.isPending}>
            <Plus className="w-4 h-4" /> New Conversation
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-1">
            {conversations.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No conversations yet</p>
                <p className="text-xs mt-1 opacity-70">Tap "New Conversation" to start chatting</p>
              </div>
            ) : conversations.map((conv) => (
              <div key={conv.id}
                className="group flex items-center justify-between p-3.5 rounded-xl cursor-pointer hover:bg-muted/60 border border-transparent hover:border-border transition-all"
                onClick={() => handleSelect(conv.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4 h-4 text-violet-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{conv.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true })}</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon"
                  className="w-7 h-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={(e) => handleDelete(conv.id, e)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    );
  }

  /* ── Desktop: sidebar + chat ── */
  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="w-64 border-r border-border shrink-0">
        <ConversationList
          conversations={conversations}
          activeId={id}
          onCreate={handleCreate}
          onSelect={handleSelect}
          onDelete={handleDelete}
          isCreating={createMutation.isPending}
        />
      </div>

      <div className="flex-1 relative overflow-hidden">
        {id ? (
          <ChatWindow id={id} conversation={conversation} isLoading={isLoading} />
        ) : (
          <div className="flex-1 h-full flex items-center justify-center text-muted-foreground flex-col gap-6 p-8">
            <div className="bg-primary/10 text-primary p-5 rounded-full"><Bot className="w-10 h-10" /></div>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground">Welcome to Argus Chat</h2>
              <p className="mt-2 max-w-sm text-sm opacity-70">Start a new conversation or pick one from the sidebar. You can type or use your microphone.</p>
            </div>
            <Button onClick={handleCreate} className="gap-2" disabled={createMutation.isPending}>
              <Plus className="w-4 h-4" /> Start a New Chat
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
