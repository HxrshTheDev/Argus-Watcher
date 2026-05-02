import { useState } from "react";
import { 
  useListPosts, 
  useCreatePost, 
  useGeneratePost, 
  useDeletePost,
  getListPostsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Share2, Sparkles, Loader2, Copy, Check, Trash2, Hash } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Posts() {
  const queryClient = useQueryClient();
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<"professional" | "casual" | "promotional">("professional");
  const [platform, setPlatform] = useState("Twitter");
  const [length, setLength] = useState<"short" | "long">("short");
  
  const [generatedPost, setGeneratedPost] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const { data: posts, isLoading: postsLoading } = useListPosts();
  const generateMutation = useGeneratePost();
  const createMutation = useCreatePost();
  const deleteMutation = useDeletePost();

  const handleGenerate = () => {
    if (!topic.trim()) return;

    generateMutation.mutate(
      { data: { topic, tone, platform, length } },
      {
        onSuccess: (data) => {
          setGeneratedPost(data);
        }
      }
    );
  };

  const handleSave = () => {
    if (!generatedPost) return;

    createMutation.mutate(
      {
        data: {
          topic,
          content: generatedPost.content,
          caption: generatedPost.caption,
          hashtags: generatedPost.hashtags?.join(" ") || "",
          tone,
          platform
        }
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
          setGeneratedPost(null);
          setTopic("");
        }
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
        }
      }
    );
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <div className="flex-1 flex flex-col p-8 max-w-7xl mx-auto w-full overflow-hidden">
        <div className="mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Social Posts</h1>
            <p className="text-muted-foreground mt-1">Generate engaging content for your social channels.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0">
          {/* Generator Section */}
          <div className="col-span-1 lg:col-span-5 flex flex-col gap-6">
            <Card className="border-primary/20 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" /> Create New Post
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Topic or Article Link</label>
                  <Textarea 
                    placeholder="What do you want to post about?" 
                    className="resize-none min-h-[100px]"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Platform</label>
                    <Select value={platform} onValueChange={setPlatform}>
                      <SelectTrigger>
                        <SelectValue placeholder="Platform" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Twitter">Twitter / X</SelectItem>
                        <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                        <SelectItem value="Facebook">Facebook</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tone</label>
                    <Select value={tone} onValueChange={(v: any) => setTone(v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Tone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="casual">Casual</SelectItem>
                        <SelectItem value="promotional">Promotional</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Length</label>
                  <div className="flex gap-2">
                    <Button 
                      type="button" 
                      variant={length === "short" ? "default" : "outline"} 
                      onClick={() => setLength("short")}
                      className="flex-1"
                    >
                      Short
                    </Button>
                    <Button 
                      type="button" 
                      variant={length === "long" ? "default" : "outline"} 
                      onClick={() => setLength("long")}
                      className="flex-1"
                    >
                      Long
                    </Button>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full gap-2" 
                  onClick={handleGenerate}
                  disabled={!topic.trim() || generateMutation.isPending}
                >
                  {generateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Generate Content
                </Button>
              </CardFooter>
            </Card>

            {generatedPost && (
              <Card className="border-primary bg-primary/5 shadow-md animate-in slide-in-from-top-4 fade-in duration-300">
                <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-md">Generated Output</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => handleCopy(generatedPost.content)} className="h-8 gap-1.5 px-2">
                    {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                    <span className="text-xs">{copied ? "Copied" : "Copy"}</span>
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-background border border-border rounded-lg whitespace-pre-wrap text-sm leading-relaxed">
                    {generatedPost.content}
                  </div>
                  
                  {generatedPost.hashtags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {generatedPost.hashtags.map((tag: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs font-normal">
                          #{tag.replace(/^#/, '')}
                        </Badge>
                      ))}
                    </div>
                  )}
                  
                  <Button className="w-full mt-4" variant="default" onClick={handleSave}>
                    Save to Library
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* History Section */}
          <div className="col-span-1 lg:col-span-7 h-full">
            <Card className="h-full flex flex-col overflow-hidden">
              <CardHeader className="border-b border-border bg-card/50 pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-primary" /> Post Library
                </CardTitle>
              </CardHeader>
              <ScrollArea className="flex-1">
                {postsLoading ? (
                  <div className="p-8 text-center text-muted-foreground flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading posts...
                  </div>
                ) : posts?.length ? (
                  <div className="p-6 space-y-4">
                    {posts.map((post) => (
                      <Card key={post.id} className="overflow-hidden border border-border/50 group">
                        <div className="bg-muted/30 px-4 py-2 border-b border-border/50 flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="text-xs font-semibold bg-background">{post.platform || 'General'}</Badge>
                            <span className="text-xs text-muted-foreground capitalize">{post.tone}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground mr-2">
                              {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                            </span>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 hover:text-destructive"
                              onClick={() => handleDelete(post.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="p-4">
                          <p className="text-sm font-medium mb-3 text-muted-foreground line-clamp-1 border-b border-border/30 pb-2">
                            Topic: {post.topic}
                          </p>
                          <div className="text-sm leading-relaxed whitespace-pre-wrap mb-4">
                            {post.content}
                          </div>
                          
                          {post.hashtags && (
                            <div className="flex flex-wrap gap-1.5 pt-2">
                              {post.hashtags.split(' ').map((tag: string, i: number) => {
                                if (!tag.trim()) return null;
                                return (
                                  <span key={i} className="text-xs text-primary font-medium flex items-center">
                                    <Hash className="w-3 h-3 mr-0.5" />{tag.replace(/^#/, '')}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground">
                    <Share2 className="w-12 h-12 mb-4 opacity-20" />
                    <p>No saved posts in your library.</p>
                  </div>
                )}
              </ScrollArea>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
