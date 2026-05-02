import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, tasksTable, conversations as conversationsTable, researchNotesTable, socialPostsTable, workflowsTable, emailDraftsTable } from "@workspace/db";
import {
  GetDashboardStatsResponse,
  GetActivityFeedResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/stats", async (_req, res): Promise<void> => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().split("T")[0];
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString().split("T")[0];

  const allTasks = await db.select().from(tasksTable);
  const total = allTasks.length;
  const completed = allTasks.filter((t) => t.completed).length;
  const pending = total - completed;
  const dueToday = allTasks.filter(
    (t) => !t.completed && t.dueDate && t.dueDate >= todayStart && t.dueDate < tomorrowStart
  ).length;
  const overdue = allTasks.filter(
    (t) => !t.completed && t.dueDate && t.dueDate < todayStart
  ).length;
  const highPriority = allTasks.filter((t) => !t.completed && t.priority === "high").length;

  const [conversations, research, posts, workflows] = await Promise.all([
    db.select().from(conversationsTable),
    db.select().from(researchNotesTable),
    db.select().from(socialPostsTable),
    db.select().from(workflowsTable),
  ]);

  const activeWorkflows = workflows.filter((w) => w.enabled).length;

  res.json(
    GetDashboardStatsResponse.parse({
      tasks: { total, completed, pending, dueToday, overdue, highPriority },
      totalConversations: conversations.length,
      totalResearchNotes: research.length,
      totalPosts: posts.length,
      totalWorkflows: workflows.length,
      activeWorkflows,
    })
  );
});

router.get("/activity", async (_req, res): Promise<void> => {
  const [tasks, research, posts, workflows, emails] = await Promise.all([
    db.select().from(tasksTable).orderBy(desc(tasksTable.createdAt)).limit(5),
    db.select().from(researchNotesTable).orderBy(desc(researchNotesTable.createdAt)).limit(3),
    db.select().from(socialPostsTable).orderBy(desc(socialPostsTable.createdAt)).limit(3),
    db.select().from(workflowsTable).orderBy(desc(workflowsTable.createdAt)).limit(2),
    db.select().from(emailDraftsTable).orderBy(desc(emailDraftsTable.createdAt)).limit(3),
  ]);

  const items = [
    ...tasks.map((t) => ({
      id: `task-${t.id}`,
      type: "task" as const,
      description: t.completed ? `Completed task: "${t.title}"` : `Created task: "${t.title}"`,
      createdAt: t.createdAt.toISOString(),
    })),
    ...research.map((r) => ({
      id: `research-${r.id}`,
      type: "research" as const,
      description: `Researched: "${r.query}"`,
      createdAt: r.createdAt.toISOString(),
    })),
    ...posts.map((p) => ({
      id: `post-${p.id}`,
      type: "post" as const,
      description: `Generated post about: "${p.topic}"`,
      createdAt: p.createdAt.toISOString(),
    })),
    ...workflows.map((w) => ({
      id: `workflow-${w.id}`,
      type: "workflow" as const,
      description: `Created workflow: "${w.name}"`,
      createdAt: w.createdAt.toISOString(),
    })),
    ...emails.map((e) => ({
      id: `email-${e.id}`,
      type: "email" as const,
      description: `Drafted email: "${e.subject}"`,
      createdAt: e.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  res.json(GetActivityFeedResponse.parse(items));
});

export default router;
