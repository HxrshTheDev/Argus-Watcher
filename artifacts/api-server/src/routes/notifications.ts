import { Router, type IRouter } from "express";
import { and, eq, lt, isNotNull, gte } from "drizzle-orm";
import { db, tasksTable, workflowsTable } from "@workspace/db";
import { serialize } from "../lib/serialize";

const router: IRouter = Router();

router.get("/notifications", async (_req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  const [overdueTasks, recentWorkflows] = await Promise.all([
    db.select({
      id: tasksTable.id,
      title: tasksTable.title,
      priority: tasksTable.priority,
      dueDate: tasksTable.dueDate,
    })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.completed, false),
          isNotNull(tasksTable.dueDate),
          lt(tasksTable.dueDate, today)
        )
      ),

    db.select({
      id: workflowsTable.id,
      name: workflowsTable.name,
      lastRunAt: workflowsTable.lastRunAt,
      lastRunStatus: workflowsTable.lastRunStatus,
    })
      .from(workflowsTable)
      .where(
        and(
          isNotNull(workflowsTable.lastRunAt),
          isNotNull(workflowsTable.lastRunStatus),
          gte(workflowsTable.lastRunAt, fiveMinutesAgo)
        )
      ),
  ]);

  const serialized = serialize({ overdueTasks, recentWorkflows });
  res.json(serialized);
});

export default router;
