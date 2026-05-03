import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, emailDraftsTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { serialize } from "../lib/serialize";
import { sendMail, isSmtpConfigured } from "../lib/mailer";
import { fetchInbox, fetchEmailBody, isImapConfigured, invalidateInboxCache } from "../lib/imap";
import {
  CreateEmailDraftBody, GenerateEmailDraftBody,
  GenerateEmailDraftResponse, SummarizeEmailBody,
  SummarizeEmailResponse, DeleteEmailDraftParams,
  ListEmailDraftsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

/* ── List drafts ── */
router.get("/emails", async (_req, res): Promise<void> => {
  const drafts = await db.select().from(emailDraftsTable).orderBy(desc(emailDraftsTable.createdAt));
  res.json(ListEmailDraftsResponse.parse(serialize(drafts)));
});

/* ── SMTP + IMAP status ── */
router.get("/emails/smtp-status", (_req, res): void => {
  res.json({
    configured: isSmtpConfigured(),
    imapConfigured: isImapConfigured(),
    from: isSmtpConfigured() ? process.env.SMTP_USER : null,
  });
});

/* ── INBOX: list ── */
router.get("/emails/inbox", async (req, res): Promise<void> => {
  if (!isImapConfigured()) {
    res.json({ emails: [], unread: 0, configured: false });
    return;
  }
  try {
    const forceRefresh = req.query.refresh === "1";
    const emails = await fetchInbox(40, forceRefresh);
    const unread = emails.filter(e => !e.seen).length;
    res.json({ emails, unread, configured: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "IMAP connection failed" });
  }
});

/* ── INBOX: full email body ── */
router.get("/emails/inbox/:uid", async (req, res): Promise<void> => {
  const uid = parseInt(req.params.uid ?? "");
  if (isNaN(uid)) { res.status(400).json({ error: "Invalid UID" }); return; }
  try {
    const detail = await fetchEmailBody(uid);
    res.json(detail);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch email" });
  }
});

/* ── INBOX: send reply ── */
router.post("/emails/reply", async (req, res): Promise<void> => {
  const { to, subject, body } = req.body as { to?: string; subject?: string; body?: string };
  if (!to || !subject || !body) {
    res.status(400).json({ error: "Missing to, subject, body" });
    return;
  }
  try {
    const messageId = await sendMail({ to, subject, body });
    invalidateInboxCache();
    res.json({ success: true, messageId });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Send failed" });
  }
});

/* ── Generate draft with AI ── */
router.post("/emails/draft", async (req, res): Promise<void> => {
  const parsed = GenerateEmailDraftBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const tone = parsed.data.tone ?? "professional";
  const response = await openai.chat.completions.create({
    model: "gpt-4.1", max_completion_tokens: 4096,
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
  try { result = JSON.parse(text); }
  catch { result = { subject: "Draft Email", body: text }; }
  res.json(GenerateEmailDraftResponse.parse(result));
});

/* ── Summarize email ── */
router.post("/emails/summarize", async (req, res): Promise<void> => {
  const parsed = SummarizeEmailBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const response = await openai.chat.completions.create({
    model: "gpt-4.1", max_completion_tokens: 2048,
    messages: [
      {
        role: "system",
        content: `You are an email analyst. Respond ONLY with valid JSON — no markdown, no code fences.
Schema: { "summary": string, "keyPoints": string[], "actionRequired": boolean }`,
      },
      {
        role: "user",
        content: `${parsed.data.sender ? `From: ${parsed.data.sender}\n` : ""}${parsed.data.subject ? `Subject: ${parsed.data.subject}\n` : ""}Email content:\n${parsed.data.content}`,
      },
    ],
  });

  const text = response.choices[0]?.message?.content ?? "{}";
  let result;
  try { result = JSON.parse(text); }
  catch { result = { summary: text, keyPoints: [], actionRequired: false }; }
  res.json(SummarizeEmailResponse.parse(result));
});

/* ── Save draft ── */
router.post("/emails", async (req, res): Promise<void> => {
  const parsed = CreateEmailDraftBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [draft] = await db.insert(emailDraftsTable).values({
    subject:   parsed.data.subject,
    body:      parsed.data.body,
    recipient: parsed.data.recipient ?? null,
    context:   parsed.data.context ?? null,
  }).returning();
  res.status(201).json(serialize(draft));
});

/* ── Send email ── */
router.post("/emails/send", async (req, res): Promise<void> => {
  const { to, subject, body } = req.body as { to?: string; subject?: string; body?: string };
  if (!to || !subject || !body) {
    res.status(400).json({ error: "Missing required fields: to, subject, body" });
    return;
  }
  try {
    const messageId = await sendMail({ to, subject, body });
    await db.insert(emailDraftsTable).values({
      subject, body, recipient: to, context: null, status: "sent",
    }).catch(() => {});
    res.json({ success: true, messageId, message: `Email sent to ${to}` });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to send email" });
  }
});

/* ── Delete draft ── */
router.delete("/emails/:id", async (req, res): Promise<void> => {
  const params = DeleteEmailDraftParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(emailDraftsTable).where(eq(emailDraftsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
