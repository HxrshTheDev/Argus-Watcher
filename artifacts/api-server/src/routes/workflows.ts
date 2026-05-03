import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, workflowsTable } from "@workspace/db";
import { serialize } from "../lib/serialize";
import { runWorkflowById } from "../lib/workflow-runner";
import { syncScheduler, getSchedulerStatus } from "../lib/scheduler";
import {
  CreateWorkflowBody, UpdateWorkflowBody,
  GetWorkflowParams, GetWorkflowResponse,
  UpdateWorkflowParams, UpdateWorkflowResponse,
  DeleteWorkflowParams, RunWorkflowParams, RunWorkflowResponse,
  ListWorkflowsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/workflows", async (_req, res): Promise<void> => {
  const workflows = await db.select().from(workflowsTable).orderBy(desc(workflowsTable.createdAt));
  res.json(ListWorkflowsResponse.parse(serialize(workflows)));
});

router.get("/workflows/scheduler/status", (_req, res): void => {
  res.json(getSchedulerStatus());
});

router.post("/workflows", async (req, res): Promise<void> => {
  const parsed = CreateWorkflowBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [workflow] = await db.insert(workflowsTable).values({
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    trigger: parsed.data.trigger,
    steps: parsed.data.steps,
  }).returning();
  // Re-sync scheduler so new scheduled workflow is picked up immediately
  syncScheduler().catch(() => {});
  res.status(201).json(serialize(workflow));
});

router.get("/workflows/:id", async (req, res): Promise<void> => {
  const params = GetWorkflowParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [workflow] = await db.select().from(workflowsTable).where(eq(workflowsTable.id, params.data.id));
  if (!workflow) { res.status(404).json({ error: "Not found" }); return; }
  res.json(GetWorkflowResponse.parse(serialize(workflow)));
});

router.patch("/workflows/:id", async (req, res): Promise<void> => {
  const params = UpdateWorkflowParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateWorkflowBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [workflow] = await db.update(workflowsTable).set({
    ...(parsed.data.name        !== undefined && { name:        parsed.data.name }),
    ...(parsed.data.description !== undefined && { description: parsed.data.description }),
    ...(parsed.data.trigger     !== undefined && { trigger:     parsed.data.trigger }),
    ...(parsed.data.steps       !== undefined && { steps:       parsed.data.steps }),
    ...(parsed.data.enabled     !== undefined && { enabled:     parsed.data.enabled }),
  }).where(eq(workflowsTable.id, params.data.id)).returning();
  if (!workflow) { res.status(404).json({ error: "Not found" }); return; }
  syncScheduler().catch(() => {});
  res.json(UpdateWorkflowResponse.parse(serialize(workflow)));
});

router.delete("/workflows/:id", async (req, res): Promise<void> => {
  const params = DeleteWorkflowParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(workflowsTable).where(eq(workflowsTable.id, params.data.id));
  syncScheduler().catch(() => {});
  res.sendStatus(204);
});

router.post("/workflows/:id/run", async (req, res): Promise<void> => {
  const params = RunWorkflowParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  try {
    const result = await runWorkflowById(params.data.id);
    res.json(RunWorkflowResponse.parse(result));
  } catch (err: any) {
    res.status(404).json({ error: err?.message ?? "Workflow not found" });
  }
});

export default router;
