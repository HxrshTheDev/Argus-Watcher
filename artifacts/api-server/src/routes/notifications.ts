import { Router, type IRouter } from "express";
import { and, eq, lt, lte, isNotNull, gte } from "drizzle-orm";
import { db, tasksTable, workflowsTable } from "@workspace/db";
import { serialize } from "../lib/serialize";

const router: IRouter = Router();

router.get("/notifications", async (_req, res): Promise<void> => {
  const now = new Date();
  const today = now.toISOString().split("T")[0]!;
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000);

  const [overdueTasks, dueSoonTasks, recentWorkflows] = await Promise.all([
    // Overdue: not completed, dueDate < today
    db.select({
      id: tasksTable.id, title: tasksTable.title,
      priority: tasksTable.priority, dueDate: tasksTable.dueDate,
    })
      .from(tasksTable)
      .where(and(
        eq(tasksTable.completed, false),
        isNotNull(tasksTable.dueDate),
        lt(tasksTable.dueDate, today),
      )),

    // Due today (not overdue) — reminder
    db.select({
      id: tasksTable.id, title: tasksTable.title,
      priority: tasksTable.priority, dueDate: tasksTable.dueDate,
    })
      .from(tasksTable)
      .where(and(
        eq(tasksTable.completed, false),
        isNotNull(tasksTable.dueDate),
        lte(tasksTable.dueDate, today),
        gte(tasksTable.dueDate, today),
      )),

    // Recent workflow runs in last 5 minutes
    db.select({
      id: workflowsTable.id, name: workflowsTable.name,
      lastRunAt: workflowsTable.lastRunAt, lastRunStatus: workflowsTable.lastRunStatus,
    })
      .from(workflowsTable)
      .where(and(
        isNotNull(workflowsTable.lastRunAt),
        isNotNull(workflowsTable.lastRunStatus),
        gte(workflowsTable.lastRunAt, fiveMinutesAgo),
      )),
  ]);

  res.json(serialize({ overdueTasks, dueSoonTasks, recentWorkflows }));
});

export default router;
