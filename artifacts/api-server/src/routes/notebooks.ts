import { Router, type IRouter } from "express";
import { eq, desc, asc } from "drizzle-orm";
import {
  db, notebooks, notebookSources, notebookNotes, notebookChats,
} from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { serialize } from "../lib/serialize";
import { z } from "zod";

const router: IRouter = Router();

/* ── List notebooks ── */
router.get("/notebooks", async (_req, res): Promise<void> => {
  const rows = await db.select().from(notebooks).orderBy(desc(notebooks.updatedAt));
  res.json(serialize(rows));
});

/* ── Create notebook ── */
const CreateNotebookBody = z.object({
  title: z.string().min(1).max(200),
  emoji: z.string().optional(),
  description: z.string().optional(),
});
router.post("/notebooks", async (req, res): Promise<void> => {
  const p = CreateNotebookBody.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const [nb] = await db.insert(notebooks).values({
    title: p.data.title,
    emoji: p.data.emoji ?? "📓",
    description: p.data.description ?? null,
  }).returning();
  res.status(201).json(serialize(nb));
});

/* ── Get notebook with sources, notes, chats ── */
router.get("/notebooks/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [nb] = await db.select().from(notebooks).where(eq(notebooks.id, id));
  if (!nb) { res.status(404).json({ error: "Not found" }); return; }
  const [sources, notes, chats] = await Promise.all([
    db.select().from(notebookSources).where(eq(notebookSources.notebookId, id)).orderBy(asc(notebookSources.createdAt)),
    db.select().from(notebookNotes).where(eq(notebookNotes.notebookId, id)).orderBy(desc(notebookNotes.updatedAt)),
    db.select().from(notebookChats).where(eq(notebookChats.notebookId, id)).orderBy(asc(notebookChats.createdAt)),
  ]);
  res.json({ ...serialize(nb), sources: serialize(sources), notes: serialize(notes), chats: serialize(chats) });
});

/* ── Update notebook ── */
router.put("/notebooks/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const p = CreateNotebookBody.partial().safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const [nb] = await db.update(notebooks)
    .set({ ...p.data, updatedAt: new Date() })
    .where(eq(notebooks.id, id)).returning();
  if (!nb) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serialize(nb));
});

/* ── Delete notebook ── */
router.delete("/notebooks/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.delete(notebooks).where(eq(notebooks.id, id));
  res.sendStatus(204);
});

/* ── Add source ── */
const AddSourceBody = z.object({
  title: z.string().min(1).max(300),
  content: z.string().min(1),
  type: z.enum(["text", "url", "paste"]).optional(),
  url: z.string().optional(),
});
router.post("/notebooks/:id/sources", async (req, res): Promise<void> => {
  const nbId = Number(req.params.id);
  const p = AddSourceBody.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const [src] = await db.insert(notebookSources).values({
    notebookId: nbId,
    title: p.data.title,
    content: p.data.content,
    type: p.data.type ?? "text",
    url: p.data.url ?? null,
  }).returning();
  await db.update(notebooks).set({ updatedAt: new Date() }).where(eq(notebooks.id, nbId));
  res.status(201).json(serialize(src));
});

/* ── Delete source ── */
router.delete("/notebooks/:id/sources/:sourceId", async (req, res): Promise<void> => {
  const sourceId = Number(req.params.sourceId);
  await db.delete(notebookSources).where(eq(notebookSources.id, sourceId));
  res.sendStatus(204);
});

/* ── List notes ── */
router.get("/notebooks/:id/notes", async (req, res): Promise<void> => {
  const nbId = Number(req.params.id);
  const notes = await db.select().from(notebookNotes).where(eq(notebookNotes.notebookId, nbId)).orderBy(desc(notebookNotes.updatedAt));
  res.json(serialize(notes));
});

/* ── Create note ── */
router.post("/notebooks/:id/notes", async (req, res): Promise<void> => {
  const nbId = Number(req.params.id);
  const p = z.object({ content: z.string().min(1) }).safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const [note] = await db.insert(notebookNotes).values({ notebookId: nbId, content: p.data.content }).returning();
  res.status(201).json(serialize(note));
});

/* ── Update note ── */
router.put("/notebooks/:id/notes/:noteId", async (req, res): Promise<void> => {
  const noteId = Number(req.params.noteId);
  const p = z.object({ content: z.string().min(1) }).safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const [note] = await db.update(notebookNotes)
    .set({ content: p.data.content, updatedAt: new Date() })
    .where(eq(notebookNotes.id, noteId)).returning();
  res.json(serialize(note));
});

/* ── Delete note ── */
router.delete("/notebooks/:id/notes/:noteId", async (req, res): Promise<void> => {
  const noteId = Number(req.params.noteId);
  await db.delete(notebookNotes).where(eq(notebookNotes.id, noteId));
  res.sendStatus(204);
});

/* ── Chat (grounded in sources) ── */
const ChatBody = z.object({ message: z.string().min(1) });
router.post("/notebooks/:id/chat", async (req, res): Promise<void> => {
  const nbId = Number(req.params.id);
  const p = ChatBody.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }

  const sources = await db.select().from(notebookSources).where(eq(notebookSources.notebookId, nbId)).orderBy(asc(notebookSources.createdAt));
  const history = await db.select().from(notebookChats).where(eq(notebookChats.notebookId, nbId)).orderBy(asc(notebookChats.createdAt));

  const sourceContext = sources.length > 0
    ? sources.map((s, i) => `[Source ${i + 1}: ${s.title}]\n${s.content}`).join("\n\n---\n\n")
    : "";

  const systemPrompt = sources.length > 0
    ? `You are an AI assistant grounded in the user's uploaded sources. Answer ONLY based on the provided sources. 
When referencing information, cite it as [Source N] inline. If the answer isn't in the sources, say so clearly.
Be concise, helpful, and accurate. Format your response with markdown.

SOURCES:
${sourceContext}`
    : `You are a helpful AI assistant. No sources have been added to this notebook yet. 
Tell the user to add sources first for grounded answers, but you can still answer general questions.`;

  const chatHistory = history.slice(-20).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1",
    max_completion_tokens: 2048,
    messages: [
      { role: "system", content: systemPrompt },
      ...chatHistory,
      { role: "user", content: p.data.message },
    ],
  });

  const reply = completion.choices[0]?.message?.content ?? "I couldn't generate a response.";

  const citations: string[] = [];
  const citationMatches = reply.matchAll(/\[Source (\d+)\]/g);
  for (const m of citationMatches) {
    const idx = parseInt(m[1]) - 1;
    if (sources[idx] && !citations.includes(sources[idx].title)) {
      citations.push(sources[idx].title);
    }
  }

  await db.insert(notebookChats).values({ notebookId: nbId, role: "user", content: p.data.message });
  const [saved] = await db.insert(notebookChats).values({
    notebookId: nbId, role: "assistant", content: reply,
    citations: citations.length ? JSON.stringify(citations) : null,
  }).returning();

  res.json({ ...serialize(saved), citations });
});

/* ── Clear chat ── */
router.delete("/notebooks/:id/chat", async (req, res): Promise<void> => {
  const nbId = Number(req.params.id);
  await db.delete(notebookChats).where(eq(notebookChats.notebookId, nbId));
  res.sendStatus(204);
});

/* ── Studio: generate output from sources ── */
const StudioBody = z.object({
  type: z.enum(["study-guide", "faq", "timeline", "briefing", "outline", "summary"]),
});
router.post("/notebooks/:id/studio", async (req, res): Promise<void> => {
  const nbId = Number(req.params.id);
  const p = StudioBody.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }

  const sources = await db.select().from(notebookSources).where(eq(notebookSources.notebookId, nbId));
  if (sources.length === 0) {
    res.status(400).json({ error: "Add at least one source to generate studio content." }); return;
  }

  const sourceContext = sources.map((s, i) => `[Source ${i + 1}: ${s.title}]\n${s.content}`).join("\n\n---\n\n");

  const prompts: Record<string, string> = {
    "study-guide": `Create a comprehensive study guide from the sources. Include: key concepts, definitions, important facts, and review questions. Use markdown with clear headings.`,
    "faq": `Generate a detailed FAQ (Frequently Asked Questions) from the sources. Create 8-12 insightful questions and thorough answers. Use markdown.`,
    "timeline": `Extract and organize all dates, events, and chronological information from the sources into a clear timeline. Use markdown with ## for major periods and bullet points for events.`,
    "briefing": `Write an executive briefing document from the sources. Include: executive summary, key findings, implications, and recommended actions. Professional tone, markdown format.`,
    "outline": `Create a detailed hierarchical outline of all the major topics and subtopics covered across the sources. Use markdown with nested bullets.`,
    "summary": `Write a comprehensive summary of all sources combined. Identify the main themes, key arguments, and important details. Well-structured markdown with headings.`,
  };

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1",
    max_completion_tokens: 4096,
    messages: [
      {
        role: "system",
        content: `You are an expert content analyst. ${prompts[p.data.type]}\n\nSOURCES:\n${sourceContext}`,
      },
      { role: "user", content: `Generate the ${p.data.type.replace("-", " ")} now.` },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "";
  res.json({ type: p.data.type, content });
});

export default router;
