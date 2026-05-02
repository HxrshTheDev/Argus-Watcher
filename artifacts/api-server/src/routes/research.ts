import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, researchNotesTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { serialize } from "../lib/serialize";
import {
  CreateResearchNoteBody,
  RunResearchQueryBody,
  RunResearchQueryResponse,
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

  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    max_completion_tokens: 8192,
    messages: [
      {
        role: "system",
        content: `You are a research assistant. Respond ONLY with a valid JSON object — no markdown, no code fences.
Schema: { "query": string, "summary": string, "insights": string[], "conclusion": string }
- summary: 2-3 sentences overview
- insights: 4-6 bullet points as an array of strings
- conclusion: 1-2 sentence closing thought`,
      },
      { role: "user", content: parsed.data.query },
    ],
  });

  const text = response.choices[0]?.message?.content ?? "{}";
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    result = {
      query: parsed.data.query,
      summary: text,
      insights: [],
      conclusion: "",
    };
  }

  res.json(RunResearchQueryResponse.parse({ ...result, query: parsed.data.query }));
});

router.post("/research", async (req, res): Promise<void> => {
  const parsed = CreateResearchNoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [note] = await db
    .insert(researchNotesTable)
    .values({
      query: parsed.data.query,
      summary: parsed.data.summary,
      insights: parsed.data.insights,
      conclusion: parsed.data.conclusion ?? null,
    })
    .returning();
  res.status(201).json(GetResearchNoteResponse.parse(serialize(note)));
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
    res.status(404).json({ error: "Research note not found" });
    return;
  }
  res.json(GetResearchNoteResponse.parse(serialize(note)));
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
