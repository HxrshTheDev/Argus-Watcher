import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, socialPostsTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { serialize } from "../lib/serialize";
import {
  CreatePostBody,
  GeneratePostBody,
  GeneratePostResponse,
  DeletePostParams,
  ListPostsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/posts", async (_req, res): Promise<void> => {
  const posts = await db
    .select()
    .from(socialPostsTable)
    .orderBy(desc(socialPostsTable.createdAt));
  res.json(ListPostsResponse.parse(serialize(posts)));
});

router.post("/posts/generate", async (req, res): Promise<void> => {
  const parsed = GeneratePostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const length = parsed.data.length ?? "short";
  const platform = parsed.data.platform ?? "general";

  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    max_completion_tokens: 4096,
    messages: [
      {
        role: "system",
        content: `You are a social media content creator. Respond ONLY with valid JSON — no markdown, no code fences.
Schema: { "content": string, "caption": string, "hashtags": string[], "hook": string }
- content: the full post body (${length === "long" ? "3-5 paragraphs" : "2-3 sentences"})
- caption: a shorter version for display (1-2 sentences)
- hashtags: 5-8 relevant hashtags as an array of strings (without #)
- hook: a compelling first line to grab attention
Tone: ${parsed.data.tone}. Platform: ${platform}.`,
      },
      { role: "user", content: `Topic: ${parsed.data.topic}` },
    ],
  });

  const text = response.choices[0]?.message?.content ?? "{}";
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    result = { content: text, caption: text, hashtags: [], hook: "" };
  }

  res.json(GeneratePostResponse.parse(result));
});

router.post("/posts", async (req, res): Promise<void> => {
  const parsed = CreatePostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [post] = await db
    .insert(socialPostsTable)
    .values({
      topic: parsed.data.topic,
      content: parsed.data.content,
      caption: parsed.data.caption ?? null,
      hashtags: parsed.data.hashtags ?? null,
      tone: parsed.data.tone,
      platform: parsed.data.platform ?? null,
    })
    .returning();
  res.status(201).json(serialize(post));
});

router.delete("/posts/:id", async (req, res): Promise<void> => {
  const params = DeletePostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(socialPostsTable).where(eq(socialPostsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
