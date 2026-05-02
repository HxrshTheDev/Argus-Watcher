import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tasksTable } from "@workspace/db";
import { serialize } from "../lib/serialize";
import {
  CreateTaskBody,
  UpdateTaskBody,
  GetTaskParams,
  GetTaskResponse,
  UpdateTaskParams,
  UpdateTaskResponse,
  DeleteTaskParams,
  ListTasksResponse,
  GetTaskStatsResponse,
  ListTasksQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/tasks/stats", async (_req, res): Promise<void> => {
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

  res.json(GetTaskStatsResponse.parse({ total, completed, pending, dueToday, overdue, highPriority }));
});

router.get("/tasks", async (req, res): Promise<void> => {
  const queryParsed = ListTasksQueryParams.safeParse(req.query);
  const params = queryParsed.success ? queryParsed.data : {};

  let tasks = await db.select().from(tasksTable).orderBy(tasksTable.createdAt);

  if (params.status === "completed") {
    tasks = tasks.filter((t) => t.completed);
  } else if (params.status === "pending") {
    tasks = tasks.filter((t) => !t.completed);
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().split("T")[0];
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString().split("T")[0];
  const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString().split("T")[0];

  if (params.filter === "today") {
    tasks = tasks.filter(
      (t) => t.dueDate && t.dueDate >= todayStart && t.dueDate < tomorrowStart
    );
  } else if (params.filter === "upcoming") {
    tasks = tasks.filter(
      (t) => !t.completed && t.dueDate && t.dueDate >= tomorrowStart && t.dueDate <= weekEnd
    );
  }

  res.json(ListTasksResponse.parse(serialize(tasks)));
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [task] = await db
    .insert(tasksTable)
    .values({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      priority: parsed.data.priority ?? "medium",
      dueDate: parsed.data.dueDate ?? null,
    })
    .returning();
  res.status(201).json(GetTaskResponse.parse(serialize(task)));
});

router.get("/tasks/:id", async (req, res): Promise<void> => {
  const params = GetTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(GetTaskResponse.parse(serialize(task)));
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [task] = await db
    .update(tasksTable)
    .set({
      ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      ...(parsed.data.completed !== undefined && { completed: parsed.data.completed }),
      ...(parsed.data.priority !== undefined && { priority: parsed.data.priority }),
      ...(parsed.data.dueDate !== undefined && { dueDate: parsed.data.dueDate }),
    })
    .where(eq(tasksTable.id, params.data.id))
    .returning();
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(UpdateTaskResponse.parse(serialize(task)));
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(tasksTable).where(eq(tasksTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
