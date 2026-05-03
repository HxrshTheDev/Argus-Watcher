import { eq } from "drizzle-orm";
import { db, workflowsTable, tasksTable, briefings, researchNotesTable, socialPostsTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";
import { sendMail } from "./mailer";

/* ─── Individual step executor ─────────────────────────────── */
export async function runStep(action: string, params: Record<string, string> = {}): Promise<string> {
  switch (action) {
    case "generate_briefing": {
      const today = new Date().toISOString().split("T")[0];
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split("T")[0];
      const allTasks = await db.select().from(tasksTable);
      const overdue  = allTasks.filter(t => !t.completed && t.dueDate && t.dueDate < today);
      const dueToday = allTasks.filter(t => !t.completed && t.dueDate && t.dueDate >= today && t.dueDate < tomorrow);
      const aiRes = await openai.chat.completions.create({
        model: "gpt-4.1", max_completion_tokens: 1024,
        messages: [
          { role: "system", content: `Generate a concise morning briefing. Return JSON: {"headline":string,"content":string,"priorities":string}` },
          { role: "user", content: `Overdue: ${overdue.map(t => t.title).join(", ") || "none"}. Due today: ${dueToday.map(t => t.title).join(", ") || "none"}.` },
        ],
      });
      let parsed: Record<string, string> = {};
      try { parsed = JSON.parse(aiRes.choices[0]?.message?.content ?? "{}"); } catch {}
      await db.delete(briefings).where(eq(briefings.date, today));
      await db.insert(briefings).values({
        date: today,
        headline: parsed["headline"] ?? "Good morning!",
        content:  parsed["content"] ?? "",
        priorities: parsed["priorities"] ?? "",
      });
      return `✅ Briefing generated: "${parsed["headline"] ?? "Good morning!"}"`;
    }

    case "task_digest": {
      const today = new Date().toISOString().split("T")[0];
      const allTasks = await db.select().from(tasksTable);
      const pending = allTasks.filter(t => !t.completed);
      const overdue = pending.filter(t => t.dueDate && t.dueDate < today);
      const high    = pending.filter(t => t.priority === "high");
      const aiRes = await openai.chat.completions.create({
        model: "gpt-4.1", max_completion_tokens: 512,
        messages: [
          { role: "system", content: "Summarize these tasks in 2-3 sentences. Be direct and actionable." },
          { role: "user", content: `Total pending: ${pending.length}. Overdue: ${overdue.map(t => t.title).join(", ") || "none"}. High priority: ${high.map(t => t.title).join(", ") || "none"}.` },
        ],
      });
      return `📋 Task Digest: ${aiRes.choices[0]?.message?.content ?? "No tasks found."}`;
    }

    case "research": {
      const query = params["query"] ?? "latest AI news";
      let summary = "";
      try {
        const searchRes = await (openai as any).responses.create({
          model: "gpt-4.1",
          tools: [{ type: "web_search_preview" }],
          input: `Research: ${query}`,
        });
        for (const item of searchRes.output ?? []) {
          if (item.type === "message") {
            for (const c of item.content ?? []) { if (c.type === "output_text") summary += c.text; }
          }
        }
      } catch {
        const fb = await openai.chat.completions.create({
          model: "gpt-4.1", max_completion_tokens: 512,
          messages: [{ role: "user", content: `Briefly summarize what's known about: ${query}` }],
        });
        summary = fb.choices[0]?.message?.content ?? "";
      }
      const structRes = await openai.chat.completions.create({
        model: "gpt-4.1", max_completion_tokens: 1024,
        messages: [
          { role: "system", content: `Return ONLY valid JSON: {"summary":string,"insights":string[],"conclusion":string}` },
          { role: "user", content: summary || `Summarize: ${query}` },
        ],
      });
      let structured: Record<string, any> = {};
      try { structured = JSON.parse(structRes.choices[0]?.message?.content ?? "{}"); } catch {}
      await db.insert(researchNotesTable).values({
        query, summary: structured["summary"] ?? summary.slice(0, 500),
        insights: JSON.stringify(Array.isArray(structured["insights"]) ? structured["insights"] : []),
        conclusion: structured["conclusion"] ?? null, sources: null,
      });
      return `🔍 Research saved: "${query}" — ${String(structured["summary"] ?? "").slice(0, 120)}`;
    }

    case "generate_post": {
      const topic    = params["topic"]    ?? "productivity tips";
      const platform = params["platform"] ?? "LinkedIn";
      const tone     = params["tone"]     ?? "professional";
      const aiRes = await openai.chat.completions.create({
        model: "gpt-4.1", max_completion_tokens: 1024,
        messages: [
          { role: "system", content: `Social media copywriter. Return ONLY valid JSON: {"content":string,"caption":string,"hashtags":string[],"hook":string}. Platform: ${platform}. Tone: ${tone}.` },
          { role: "user", content: `Create a post about: ${topic}` },
        ],
      });
      let post: Record<string, any> = {};
      try { post = JSON.parse(aiRes.choices[0]?.message?.content ?? "{}"); } catch {}
      await db.insert(socialPostsTable).values({
        topic, content: post["content"] ?? topic, caption: post["caption"] ?? null,
        hashtags: (post["hashtags"] ?? []).join(" "), tone, platform,
      });
      return `📣 Post created for ${platform}: "${post["hook"] ?? String(post["content"] ?? topic).slice(0, 80)}"`;
    }

    case "custom_ai": {
      const prompt = params["prompt"] ?? "Perform a helpful task.";
      const aiRes = await openai.chat.completions.create({
        model: "gpt-4.1", max_completion_tokens: 1024,
        messages: [
          { role: "system", content: "You are a helpful AI assistant. Complete the given task concisely." },
          { role: "user", content: prompt },
        ],
      });
      return `🤖 AI Output: ${aiRes.choices[0]?.message?.content ?? "Done."}`;
    }

    case "send_email": {
      const { to, subject, body } = params;
      if (!to || !subject || !body) throw new Error("send_email requires to, subject, and body params");
      await sendMail({ to, subject, body });
      return `📧 Email sent to ${to}: "${subject}"`;
    }

    case "create_task": {
      const { title, description, priority = "medium", dueDate } = params;
      if (!title) throw new Error("create_task requires a title param");
      const [task] = await db.insert(tasksTable).values({
        title, description: description ?? null, priority, dueDate: dueDate ?? null,
      }).returning();
      return `✅ Task created: "${task.title}"${dueDate ? ` (due ${dueDate})` : ""}`;
    }

    case "http_request": {
      const { url, method = "GET", body, headers } = params;
      if (!url) throw new Error("http_request requires a url param");
      const fetchOpts: RequestInit = { method };
      if (headers) { try { fetchOpts.headers = JSON.parse(headers); } catch {} }
      if (body && method !== "GET") { fetchOpts.body = body; }
      const response = await fetch(url, fetchOpts);
      const text = await response.text().catch(() => "");
      return `🌐 HTTP ${method} ${url} → ${response.status}: ${text.slice(0, 300)}`;
    }

    default:
      return `⚠️ Unknown action: ${action}`;
  }
}

/* ─── Run a full workflow by ID ─────────────────────────────── */
export async function runWorkflowById(id: number): Promise<{ success: boolean; output: string; stepsExecuted: number; error?: string | null }> {
  const [workflow] = await db.select().from(workflowsTable).where(eq(workflowsTable.id, id));
  if (!workflow) throw new Error(`Workflow ${id} not found`);

  let steps: Array<{ action: string; params?: Record<string, string> }> = [];
  try { steps = JSON.parse(workflow.steps); } catch {
    steps = [{ action: "custom_ai", params: { prompt: workflow.name } }];
  }

  const outputs: string[] = [];
  let hasError = false;

  for (const step of steps) {
    try {
      const result = await runStep(step.action, step.params ?? {});
      outputs.push(result);
    } catch (err: any) {
      const msg = `❌ Step "${step.action}" failed: ${err?.message ?? "Unknown error"}`;
      outputs.push(msg);
      logger.error({ err, action: step.action, workflowId: id }, "Step failed");
      hasError = true;
    }
  }

  await db.update(workflowsTable).set({
    lastRunAt: new Date(),
    lastRunStatus: hasError ? "error" : "success",
  }).where(eq(workflowsTable.id, id));

  logger.info({ workflowId: id, steps: steps.length, hasError }, "Workflow executed");
  return {
    success: !hasError,
    output: outputs.join("\n\n"),
    stepsExecuted: steps.length,
    error: hasError ? outputs.filter(o => o.startsWith("❌")).join("; ") : null,
  };
}
