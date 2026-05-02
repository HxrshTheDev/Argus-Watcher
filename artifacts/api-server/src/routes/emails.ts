import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, emailDraftsTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { serialize } from "../lib/serialize";
import {
  CreateEmailDraftBody,
  GenerateEmailDraftBody,
  GenerateEmailDraftResponse,
  SummarizeEmailBody,
  SummarizeEmailResponse,
  DeleteEmailDraftParams,
  ListEmailDraftsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/emails", async (_req, res): Promise<void> => {
  const drafts = await db
    .select()
    .from(emailDraftsTable)
    .orderBy(desc(emailDraftsTable.createdAt));
  res.json(ListEmailDraftsResponse.parse(serialize(drafts)));
});

router.post("/emails/draft", async (req, res): Promise<void> => {
  const parsed = GenerateEmailDraftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const tone = parsed.data.tone ?? "professional";
  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    max_completion_tokens: 4096,
    messages: [
      {
        role: "system",
        content: `You are an expert email writer. Respond ONLY with valid JSON — no markdown, no code fences.
Schema: { "subject": string, "body": string }
Tone: ${tone}. Write clear, concise, well-structured emails.`,
      },
      {
        role: "user",
        content: `Context: ${parsed.data.context}${parsed.data.recipient ? `\nTo: ${parsed.data.recipient}` : ""}`,
      },
    ],
  });

  const text = response.choices[0]?.message?.content ?? "{}";
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    result = { subject: "Draft Email", body: text };
  }

  res.json(GenerateEmailDraftResponse.parse(result));
});

router.post("/emails/summarize", async (req, res): Promise<void> => {
  const parsed = SummarizeEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    max_completion_tokens: 2048,
    messages: [
      {
        role: "system",
        content: `You are an email analyst. Respond ONLY with valid JSON — no markdown, no code fences.
Schema: { "summary": string, "keyPoints": string[], "actionRequired": boolean }
- summary: 1-2 sentence overview
- keyPoints: 3-5 bullet points as an array of strings
- actionRequired: true if the email requires a reply or action`,
      },
      {
        role: "user",
        content: `${parsed.data.sender ? `From: ${parsed.data.sender}\n` : ""}${parsed.data.subject ? `Subject: ${parsed.data.subject}\n` : ""}Email content:\n${parsed.data.content}`,
      },
    ],
  });

  const text = response.choices[0]?.message?.content ?? "{}";
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    result = { summary: text, keyPoints: [], actionRequired: false };
  }

  res.json(SummarizeEmailResponse.parse(result));
});

router.post("/emails", async (req, res): Promise<void> => {
  const parsed = CreateEmailDraftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [draft] = await db
    .insert(emailDraftsTable)
    .values({
      subject: parsed.data.subject,
      body: parsed.data.body,
      recipient: parsed.data.recipient ?? null,
      context: parsed.data.context ?? null,
    })
    .returning();
  res.status(201).json(serialize(draft));
});

router.delete("/emails/:id", async (req, res): Promise<void> => {
  const params = DeleteEmailDraftParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(emailDraftsTable).where(eq(emailDraftsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
