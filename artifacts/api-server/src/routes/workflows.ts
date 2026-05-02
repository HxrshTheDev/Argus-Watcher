import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, workflowsTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { serialize } from "../lib/serialize";
import {
  CreateWorkflowBody,
  UpdateWorkflowBody,
  GetWorkflowParams,
  GetWorkflowResponse,
  UpdateWorkflowParams,
  UpdateWorkflowResponse,
  DeleteWorkflowParams,
  RunWorkflowParams,
  RunWorkflowResponse,
  ListWorkflowsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/workflows", async (_req, res): Promise<void> => {
  const workflows = await db
    .select()
    .from(workflowsTable)
    .orderBy(desc(workflowsTable.createdAt));
  res.json(ListWorkflowsResponse.parse(serialize(workflows)));
});

router.post("/workflows", async (req, res): Promise<void> => {
  const parsed = CreateWorkflowBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [workflow] = await db
    .insert(workflowsTable)
    .values({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      trigger: parsed.data.trigger,
      steps: parsed.data.steps,
    })
    .returning();
  res.status(201).json(serialize(workflow));
});

router.get("/workflows/:id", async (req, res): Promise<void> => {
  const params = GetWorkflowParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [workflow] = await db
    .select()
    .from(workflowsTable)
    .where(eq(workflowsTable.id, params.data.id));
  if (!workflow) {
    res.status(404).json({ error: "Workflow not found" });
    return;
  }
  res.json(GetWorkflowResponse.parse(serialize(workflow)));
});

router.patch("/workflows/:id", async (req, res): Promise<void> => {
  const params = UpdateWorkflowParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateWorkflowBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [workflow] = await db
    .update(workflowsTable)
    .set({
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      ...(parsed.data.trigger !== undefined && { trigger: parsed.data.trigger }),
      ...(parsed.data.steps !== undefined && { steps: parsed.data.steps }),
      ...(parsed.data.enabled !== undefined && { enabled: parsed.data.enabled }),
    })
    .where(eq(workflowsTable.id, params.data.id))
    .returning();
  if (!workflow) {
    res.status(404).json({ error: "Workflow not found" });
    return;
  }
  res.json(UpdateWorkflowResponse.parse(serialize(workflow)));
});

router.delete("/workflows/:id", async (req, res): Promise<void> => {
  const params = DeleteWorkflowParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(workflowsTable).where(eq(workflowsTable.id, params.data.id));
  res.sendStatus(204);
});

router.post("/workflows/:id/run", async (req, res): Promise<void> => {
  const params = RunWorkflowParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [workflow] = await db
    .select()
    .from(workflowsTable)
    .where(eq(workflowsTable.id, params.data.id));
  if (!workflow) {
    res.status(404).json({ error: "Workflow not found" });
    return;
  }

  let steps: Array<{ action: string; description?: string }> = [];
  try {
    steps = JSON.parse(workflow.steps);
  } catch {
    steps = [{ action: workflow.trigger }];
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    max_completion_tokens: 2048,
    messages: [
      {
        role: "system",
        content: "You are a workflow automation engine. Simulate the execution of the given workflow steps and describe what would happen. Be concise and practical.",
      },
      {
        role: "user",
        content: `Workflow: "${workflow.name}"\nTrigger: ${workflow.trigger}\nSteps: ${JSON.stringify(steps)}`,
      },
    ],
  });

  const output = response.choices[0]?.message?.content ?? "Workflow executed.";

  await db
    .update(workflowsTable)
    .set({ lastRunAt: new Date(), lastRunStatus: "success" })
    .where(eq(workflowsTable.id, params.data.id));

  res.json(
    RunWorkflowResponse.parse({
      success: true,
      output,
      stepsExecuted: steps.length,
      error: null,
    })
  );
});

export default router;
