import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, tasksTable, briefings, researchNotesTable, workflowsTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { serialize } from "../lib/serialize";

const router: IRouter = Router();

router.get("/briefing/today", async (_req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const [existing] = await db
    .select()
    .from(briefings)
    .where(eq(briefings.date, today));

  if (existing) {
    res.json(serialize(existing));
  } else {
    res.json(null);
  }
});

router.post("/briefing/generate", async (_req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const todayDate = new Date();
  const tomorrowStr = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() + 1)
    .toISOString().split("T")[0];

  const [allTasks, recentResearch, activeWorkflows] = await Promise.all([
    db.select().from(tasksTable).orderBy(tasksTable.dueDate),
    db.select().from(researchNotesTable).orderBy(desc(researchNotesTable.createdAt)).limit(3),
    db.select().from(workflowsTable).where(eq(workflowsTable.enabled, true)),
  ]);

  const overdue = allTasks.filter(t => !t.completed && t.dueDate && t.dueDate < today);
  const dueToday = allTasks.filter(t => !t.completed && t.dueDate && t.dueDate >= today && t.dueDate < tomorrowStr);
  const pending = allTasks.filter(t => !t.completed && (!t.dueDate || t.dueDate >= tomorrowStr));
  const highPriority = allTasks.filter(t => !t.completed && t.priority === "high");

  const context = `
Today's date: ${today}

OVERDUE TASKS (${overdue.length}):
${overdue.map(t => `- [${t.priority.toUpperCase()}] ${t.title} (was due: ${t.dueDate})`).join("\n") || "None"}

DUE TODAY (${dueToday.length}):
${dueToday.map(t => `- [${t.priority.toUpperCase()}] ${t.title}`).join("\n") || "None"}

HIGH PRIORITY PENDING (${highPriority.filter(t => !t.dueDate || t.dueDate >= tomorrowStr).length}):
${highPriority.filter(t => !t.dueDate || t.dueDate >= tomorrowStr).slice(0, 5).map(t => `- ${t.title}`).join("\n") || "None"}

ACTIVE WORKFLOWS (${activeWorkflows.length}):
${activeWorkflows.map(w => `- ${w.name}: ${w.trigger}`).join("\n") || "None"}

RECENT RESEARCH (${recentResearch.length}):
${recentResearch.map(r => `- ${r.query}`).join("\n") || "None"}

TOTAL PENDING TASKS: ${pending.length}
`.trim();

  const aiResponse = await openai.chat.completions.create({
    model: "gpt-4.1",
    max_completion_tokens: 2048,
    messages: [
      {
        role: "system",
        content: `You are Argus, a sharp personal AI assistant generating a morning briefing. 
Respond ONLY with valid JSON — no markdown, no code fences.
Schema: { "headline": string, "content": string, "priorities": string }
- headline: a single punchy sentence capturing the day's key focus (max 12 words)
- content: 2-3 sentences of narrative context — what matters most today and why
- priorities: a numbered list of 3-5 specific action items, one per line, ordered by urgency`,
      },
      { role: "user", content: context },
    ],
  });

  const text = aiResponse.choices[0]?.message?.content ?? "{}";
  let result: { headline: string; content: string; priorities: string };
  try {
    result = JSON.parse(text);
  } catch {
    result = {
      headline: "Good morning — here's your day at a glance.",
      content: `You have ${overdue.length} overdue task(s) and ${dueToday.length} due today. Stay focused and tackle high-priority items first.`,
      priorities: highPriority.slice(0, 3).map((t, i) => `${i + 1}. ${t.title}`).join("\n") || "1. Review your task list",
    };
  }

  await db
    .delete(briefings)
    .where(eq(briefings.date, today));

  const [saved] = await db
    .insert(briefings)
    .values({
      date: today,
      headline: result.headline,
      content: result.content,
      priorities: result.priorities,
    })
    .returning();

  res.json(serialize(saved));
});

router.delete("/briefing/today", async (_req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  await db.delete(briefings).where(eq(briefings.date, today));
  res.sendStatus(204);
});

export default router;
