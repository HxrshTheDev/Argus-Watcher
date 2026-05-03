import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, workflowsTable, tasksTable, briefings, researchNotesTable, socialPostsTable } from "@workspace/db";
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

/* ─── Step executors ─────────────────────────────────────── */

async function runStep(action: string, params: Record<string, string> = {}): Promise<string> {
  switch (action) {
    case "generate_briefing": {
      const today = new Date().toISOString().split("T")[0];
      const tomorrowStr = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1).toISOString().split("T")[0];
      const allTasks = await db.select().from(tasksTable);
      const overdue = allTasks.filter(t => !t.completed && t.dueDate && t.dueDate < today);
      const dueToday = allTasks.filter(t => !t.completed && t.dueDate && t.dueDate >= today && t.dueDate < tomorrowStr);

      const aiRes = await openai.chat.completions.create({
        model: "gpt-4.1",
        max_completion_tokens: 1024,
        messages: [
          { role: "system", content: `Generate a concise morning briefing. Return JSON: {"headline":string,"content":string,"priorities":string}` },
          { role: "user", content: `Overdue: ${overdue.map(t => t.title).join(", ") || "none"}. Due today: ${dueToday.map(t => t.title).join(", ") || "none"}.` },
        ],
      });
      let parsed: any = {};
      try { parsed = JSON.parse(aiRes.choices[0]?.message?.content ?? "{}"); } catch {}

      await db.delete(briefings).where(eq(briefings.date, today));
      await db.insert(briefings).values({
        date: today,
        headline: parsed.headline ?? "Good morning!",
        content: parsed.content ?? "",
        priorities: parsed.priorities ?? "",
      });
      return `✅ Briefing generated: "${parsed.headline ?? "Good morning!"}"`;
    }

    case "task_digest": {
      const allTasks = await db.select().from(tasksTable);
      const today = new Date().toISOString().split("T")[0];
      const pending = allTasks.filter(t => !t.completed);
      const overdue = pending.filter(t => t.dueDate && t.dueDate < today);
      const high = pending.filter(t => t.priority === "high");
      const aiRes = await openai.chat.completions.create({
        model: "gpt-4.1",
        max_completion_tokens: 512,
        messages: [
          { role: "system", content: "Summarize these tasks in 2-3 sentences. Be direct and actionable." },
          { role: "user", content: `Total pending: ${pending.length}. Overdue: ${overdue.map(t => t.title).join(", ") || "none"}. High priority: ${high.map(t => t.title).join(", ") || "none"}.` },
        ],
      });
      return `📋 Task Digest: ${aiRes.choices[0]?.message?.content ?? "No tasks found."}`;
    }

    case "research": {
      const query = params.query ?? "latest AI news";
      let summary = "";
      try {
        const searchRes = await (openai as any).responses.create({
          model: "gpt-4.1",
          tools: [{ type: "web_search_preview" }],
          input: `Research: ${query}`,
        });
        for (const item of searchRes.output ?? []) {
          if (item.type === "message") {
            for (const c of item.content ?? []) {
              if (c.type === "output_text") summary += c.text;
            }
          }
        }
      } catch {
        const fallback = await openai.chat.completions.create({
          model: "gpt-4.1",
          max_completion_tokens: 512,
          messages: [{ role: "user", content: `Briefly summarize what's known about: ${query}` }],
        });
        summary = fallback.choices[0]?.message?.content ?? "";
      }

      const structRes = await openai.chat.completions.create({
        model: "gpt-4.1",
        max_completion_tokens: 1024,
        messages: [
          { role: "system", content: `Return ONLY valid JSON: {"summary":string,"insights":string[],"conclusion":string}` },
          { role: "user", content: summary || `Summarize: ${query}` },
        ],
      });
      let structured: any = {};
      try { structured = JSON.parse(structRes.choices[0]?.message?.content ?? "{}"); } catch {}

      await db.insert(researchNotesTable).values({
        query,
        summary: structured.summary ?? summary.slice(0, 500),
        insights: JSON.stringify(Array.isArray(structured.insights) ? structured.insights : []),
        conclusion: structured.conclusion ?? null,
        sources: null,
      });
      return `🔍 Research saved: "${query}" — ${structured.summary?.slice(0, 120) ?? "Done."}`;
    }

    case "generate_post": {
      const topic = params.topic ?? "productivity tips";
      const platform = params.platform ?? "LinkedIn";
      const tone = params.tone ?? "professional";

      const aiRes = await openai.chat.completions.create({
        model: "gpt-4.1",
        max_completion_tokens: 1024,
        messages: [
          { role: "system", content: `Social media copywriter. Return ONLY valid JSON: {"content":string,"caption":string,"hashtags":string[],"hook":string}. Platform: ${platform}. Tone: ${tone}.` },
          { role: "user", content: `Create a post about: ${topic}` },
        ],
      });
      let post: any = {};
      try { post = JSON.parse(aiRes.choices[0]?.message?.content ?? "{}"); } catch {}

      await db.insert(socialPostsTable).values({
        topic,
        content: post.content ?? topic,
        caption: post.caption ?? null,
        hashtags: (post.hashtags ?? []).join(" "),
        tone,
        platform,
      });
      return `📣 Post created for ${platform}: "${post.hook ?? post.content?.slice(0, 80) ?? topic}"`;
    }

    case "custom_ai": {
      const prompt = params.prompt ?? "Perform a helpful task.";
      const aiRes = await openai.chat.completions.create({
        model: "gpt-4.1",
        max_completion_tokens: 1024,
        messages: [
          { role: "system", content: "You are a helpful AI assistant. Complete the given task concisely." },
          { role: "user", content: prompt },
        ],
      });
      return `🤖 AI Output: ${aiRes.choices[0]?.message?.content ?? "Done."}`;
    }

    default:
      return `⚠️ Unknown action: ${action}`;
  }
}

/* ─── Routes ─────────────────────────────────────────────── */

router.get("/workflows", async (_req, res): Promise<void> => {
  const workflows = await db.select().from(workflowsTable).orderBy(desc(workflowsTable.createdAt));
  res.json(ListWorkflowsResponse.parse(serialize(workflows)));
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
    ...(parsed.data.name !== undefined && { name: parsed.data.name }),
    ...(parsed.data.description !== undefined && { description: parsed.data.description }),
    ...(parsed.data.trigger !== undefined && { trigger: parsed.data.trigger }),
    ...(parsed.data.steps !== undefined && { steps: parsed.data.steps }),
    ...(parsed.data.enabled !== undefined && { enabled: parsed.data.enabled }),
  }).where(eq(workflowsTable.id, params.data.id)).returning();
  if (!workflow) { res.status(404).json({ error: "Not found" }); return; }
  res.json(UpdateWorkflowResponse.parse(serialize(workflow)));
});

router.delete("/workflows/:id", async (req, res): Promise<void> => {
  const params = DeleteWorkflowParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(workflowsTable).where(eq(workflowsTable.id, params.data.id));
  res.sendStatus(204);
});

router.post("/workflows/:id/run", async (req, res): Promise<void> => {
  const params = RunWorkflowParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [workflow] = await db.select().from(workflowsTable).where(eq(workflowsTable.id, params.data.id));
  if (!workflow) { res.status(404).json({ error: "Not found" }); return; }

  let steps: Array<{ action: string; params?: Record<string, string> }> = [];
  try { steps = JSON.parse(workflow.steps); } catch { steps = [{ action: "custom_ai", params: { prompt: workflow.trigger } }]; }

  const outputs: string[] = [];
  let hasError = false;

  for (const step of steps) {
    try {
      const result = await runStep(step.action, step.params ?? {});
      outputs.push(result);
    } catch (err: any) {
      outputs.push(`❌ Step "${step.action}" failed: ${err?.message ?? "Unknown error"}`);
      hasError = true;
    }
  }

  await db.update(workflowsTable).set({
    lastRunAt: new Date(),
    lastRunStatus: hasError ? "error" : "success",
  }).where(eq(workflowsTable.id, params.data.id));

  res.json(RunWorkflowResponse.parse({
    success: !hasError,
    output: outputs.join("\n\n"),
    stepsExecuted: steps.length,
    error: hasError ? outputs.filter(o => o.startsWith("❌")).join("; ") : null,
  }));
});

export default router;
