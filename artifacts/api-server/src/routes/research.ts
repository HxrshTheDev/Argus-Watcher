import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, researchNotesTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { serialize } from "../lib/serialize";
import {
  RunResearchQueryBody,
  GetResearchNoteParams,
  GetResearchNoteResponse,
  DeleteResearchNoteParams,
  ListResearchNotesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/research", async (_req, res): Promise<void> => {
  const notes = await db
    .select()
    .from(researchNotesTable)
    .orderBy(desc(researchNotesTable.createdAt));
  res.json(ListResearchNotesResponse.parse(serialize(notes)));
});

router.post("/research/query", async (req, res): Promise<void> => {
  const parsed = RunResearchQueryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { query } = parsed.data;
  let summary = "";
  let insights: string[] = [];
  let conclusion = "";
  let sources: Array<{ title: string; url: string }> = [];

  try {
    const searchResponse = await (openai as any).responses.create({
      model: "gpt-4.1",
      tools: [{ type: "web_search_preview" }],
      input: `Research this topic thoroughly using web search: ${query}`,
    });

    let rawText = "";
    for (const item of searchResponse.output ?? []) {
      if (item.type === "message") {
        for (const content of item.content ?? []) {
          if (content.type === "output_text") {
            rawText += content.text;
            for (const ann of content.annotations ?? []) {
              if (ann.type === "url_citation") {
                const url = ann.url as string;
                const title = (ann.title as string) ?? url;
                if (!sources.find((s) => s.url === url)) {
                  sources.push({ title, url });
                }
              }
            }
          }
        }
      }
    }

    const structureRes = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: 2048,
      messages: [
        {
          role: "system",
          content: `Structure research findings into JSON. Return ONLY valid JSON, no markdown fences.
Schema: { "summary": string, "insights": string[], "conclusion": string }
- summary: 2-3 clear sentences
- insights: 5 specific key findings as clean strings (no leading numbers or bullets)
- conclusion: 1-2 sentences takeaway`,
        },
        {
          role: "user",
          content: rawText || `Summarize everything known about: ${query}`,
        },
      ],
    });

    const text = structureRes.choices[0]?.message?.content ?? "{}";
    const result = JSON.parse(text);
    summary = result.summary ?? rawText.slice(0, 400);
    insights = Array.isArray(result.insights) ? result.insights : [];
    conclusion = result.conclusion ?? "";
  } catch {
    const fallback = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: 4096,
      messages: [
        {
          role: "system",
          content: `You are a research assistant. Return ONLY valid JSON: { "summary": string, "insights": string[], "conclusion": string }
- summary: 2-3 sentences
- insights: 5 key findings as clean strings
- conclusion: 1-2 sentences`,
        },
        { role: "user", content: `Research: ${query}` },
      ],
    });
    try {
      const text = fallback.choices[0]?.message?.content ?? "{}";
      const result = JSON.parse(text);
      summary = result.summary ?? "";
      insights = Array.isArray(result.insights) ? result.insights : [];
      conclusion = result.conclusion ?? "";
    } catch {
      summary = fallback.choices[0]?.message?.content ?? "";
    }
  }

  const [saved] = await db
    .insert(researchNotesTable)
    .values({
      query,
      summary,
      insights: JSON.stringify(insights),
      conclusion: conclusion || null,
      sources: sources.length ? JSON.stringify(sources) : null,
    })
    .returning();

  res.json({
    ...serialize(saved),
    insights,
    sources,
  });
});

router.get("/research/:id", async (req, res): Promise<void> => {
  const params = GetResearchNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [note] = await db
    .select()
    .from(researchNotesTable)
    .where(eq(researchNotesTable.id, params.data.id));
  if (!note) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  let insights: string[] = [];
  let sources: Array<{ title: string; url: string }> = [];
  try { insights = JSON.parse(note.insights); } catch { insights = [note.insights]; }
  try { sources = note.sources ? JSON.parse(note.sources) : []; } catch { sources = []; }
  res.json({ ...serialize(note), insights, sources });
});

router.delete("/research/:id", async (req, res): Promise<void> => {
  const params = DeleteResearchNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(researchNotesTable).where(eq(researchNotesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
