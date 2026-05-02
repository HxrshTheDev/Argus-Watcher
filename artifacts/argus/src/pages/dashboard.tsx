import { useGetDashboardStats, useGetActivityFeed } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { CheckSquare, MessageSquare, Search, Mail, Share2, Zap, Activity } from "lucide-react";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: feed, isLoading: feedLoading } = useGetActivityFeed();

  return (
    <div className="p-8 h-full flex flex-col gap-6 overflow-hidden">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your activity and system status.</p>
      </div>

      {statsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-32 bg-muted animate-pulse rounded-xl" />
          <div className="h-32 bg-muted animate-pulse rounded-xl" />
          <div className="h-32 bg-muted animate-pulse rounded-xl" />
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Tasks</CardTitle>
              <CheckSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.tasks?.pending || 0}</div>
              <p className="text-xs text-muted-foreground">
                {stats.tasks?.completed || 0} completed
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conversations</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalConversations || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Research Notes</CardTitle>
              <Search className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalResearchNotes || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Workflows</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeWorkflows || 0}</div>
              <p className="text-xs text-muted-foreground">
                out of {stats.totalWorkflows || 0} total
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="flex-1 flex flex-col min-h-0">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" /> Recent Activity
        </h2>
        <Card className="flex-1 overflow-hidden flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {feedLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
                    <div className="space-y-2 flex-1">
                      <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
                      <div className="h-3 w-1/4 bg-muted animate-pulse rounded" />
                    </div>
                  </div>
                ))
              ) : feed?.length ? (
                feed.map((item) => (
                  <div key={item.id} className="flex items-start gap-4 pb-4 border-b border-border last:border-0 last:pb-0">
                    <div className="mt-0.5 bg-primary/10 p-2 rounded-full text-primary">
                      {item.type === "task" && <CheckSquare className="w-4 h-4" />}
                      {item.type === "chat" && <MessageSquare className="w-4 h-4" />}
                      {item.type === "research" && <Search className="w-4 h-4" />}
                      {item.type === "email" && <Mail className="w-4 h-4" />}
                      {item.type === "post" && <Share2 className="w-4 h-4" />}
                      {item.type === "workflow" && <Zap className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">{item.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">No recent activity.</div>
              )}
            </div>
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}
