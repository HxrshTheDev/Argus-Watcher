import { useState, useRef, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Send, Trash2, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Chat() {
  const params = useParams();
  const id = params.id ? parseInt(params.id) : undefined;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const { data: conversations } = useListConversations();
  const { data: conversation, isLoading } = useGetConversation(id!, { 
    query: { enabled: !!id, queryKey: getGetConversationQueryKey(id!) } 
  });

  const createMutation = useCreateConversation();
  const deleteMutation = useDeleteConversation();

  const [input, setInput] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation?.messages, streamingContent]);

  const handleCreate = () => {
    createMutation.mutate({ data: { title: "New Conversation" } }, {
      onSuccess: (newConv) => {
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        setLocation(`/chat/${newConv.id}`);
      }
    });
  };

  const handleDelete = (convId: number) => {
    deleteMutation.mutate({ id: convId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        if (id === convId) setLocation("/chat");
      }
    });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !id || isStreaming) return;

    const messageContent = input;
    setInput("");
    setIsStreaming(true);
    setStreamingContent("");

    // Optimistically update the UI with user message
    const tempMessage = {
      id: Date.now(),
      conversationId: id,
      role: "user" as const,
      content: messageContent,
      createdAt: new Date().toISOString()
    };
    
    queryClient.setQueryData(getGetConversationQueryKey(id), (old: any) => {
      if (!old) return old;
      return {
        ...old,
        messages: [...(old.messages || []), tempMessage]
      };
    });

    try {
      const response = await fetch(`/api/openai/conversations/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: messageContent }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                setStreamingContent(prev => prev + data.content);
              }
              if (data.done) {
                queryClient.invalidateQueries({ queryKey: getGetConversationQueryKey(id) });
              }
            } catch (e) {
              // Ignore parse errors from partial chunks
            }
          }
        }
      }
    } catch (error) {
      console.error("Streaming error:", error);
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-card/50 flex flex-col">
        <div className="p-4 border-b border-border">
          <Button onClick={handleCreate} className="w-full gap-2" disabled={createMutation.isPending}>
            <Plus className="w-4 h-4" /> New Chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations?.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors ${
                  id === conv.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                }`}
                onClick={() => setLocation(`/chat/${conv.id}`)}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <MessageSquare className="w-4 h-4 shrink-0 opacity-70" />
                  <div className="truncate text-sm">
                    <div className="font-medium truncate">{conv.title}</div>
                    <div className="text-[10px] opacity-70">
                      {formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true })}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6 opacity-0 group-hover:opacity-100 text-destructive shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(conv.id);
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-background relative">
        {id ? (
          <>
            <div className="p-4 border-b border-border bg-background/80 backdrop-blur-sm z-10 flex items-center justify-between">
              <h2 className="font-semibold">{conversation?.title || "Conversation"}</h2>
            </div>
            
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-6 max-w-3xl mx-auto pb-4">
                {isLoading ? (
                  <div className="flex justify-center p-8 opacity-50">Loading...</div>
                ) : conversation?.messages?.length ? (
                  conversation.messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div 
                        className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                          msg.role === "user" 
                            ? "bg-primary text-primary-foreground" 
                            : "bg-muted text-foreground"
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-20 text-muted-foreground">
                    Send a message to start the conversation.
                  </div>
                )}
                
                {isStreaming && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-2xl px-4 py-2 bg-muted text-foreground">
                      <div className="whitespace-pre-wrap">{streamingContent}</div>
                      <span className="inline-block w-1.5 h-4 ml-1 bg-primary animate-pulse" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="p-4 bg-background">
              <form onSubmit={handleSend} className="max-w-3xl mx-auto relative flex items-end">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Message Argus..."
                  className="w-full pr-12 rounded-xl border-input bg-card shadow-sm h-12"
                  disabled={isStreaming}
                />
                <Button 
                  type="submit" 
                  size="icon" 
                  className="absolute right-1 bottom-1 h-10 w-10 rounded-lg"
                  disabled={!input.trim() || isStreaming}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-4">
            <MessageSquare className="w-12 h-12 opacity-20" />
            <p>Select a conversation or start a new one</p>
          </div>
        )}
      </div>
    </div>
  );
}
