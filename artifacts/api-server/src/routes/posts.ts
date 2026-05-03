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

  const platformRules: Record<string, string> = {
    Twitter:   "Max 280 characters. Punchy, no fluff. Use line breaks sparingly. 3-5 hashtags.",
    LinkedIn:  "Professional network. Can be longer and thoughtful. Personal anecdotes work well. 3-5 hashtags.",
    Instagram: "Visual platform. Emojis welcome. Strong caption. 8-12 hashtags for reach.",
  };

  const toneGuide: Record<string, string> = {
    professional:  "Authoritative, clear, polished. No slang.",
    casual:        "Friendly, conversational, like texting a colleague.",
    witty:         "Clever, a little playful. Use wordplay or a punchline.",
    inspirational: "Uplifting, motivating. End with a call to action or quote.",
    promotional:   "Highlight benefits and urgency. Action-oriented.",
  };

  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    max_completion_tokens: 4096,
    messages: [
      {
        role: "system",
        content: `You are an expert social media copywriter. Respond ONLY with valid JSON — no markdown, no code fences.
Schema: { "content": string, "caption": string, "hashtags": string[], "hook": string }
- content: the full post body (${length === "long" ? "3-5 paragraphs" : "2-4 sentences"})
- caption: 1 punchy sentence summary of the post
- hashtags: array of strings WITHOUT the # symbol
- hook: the very first sentence designed to stop the scroll

Platform rules: ${platformRules[platform] ?? "General social media."}
Tone: ${toneGuide[parsed.data.tone] ?? parsed.data.tone}`,
      },
      { role: "user", content: `Create a ${platform} post about: ${parsed.data.topic}` },
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
