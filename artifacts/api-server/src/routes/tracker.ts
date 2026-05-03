import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

router.post("/tracker/review", async (req, res): Promise<void> => {
  const { context } = req.body;

  if (!context || typeof context !== "string") {
    res.status(400).json({ error: "context string required" });
    return;
  }

  const messages = [
    {
      role: "system" as const,
      content:
        "You are an encouraging personal productivity coach. Write a brief, warm weekly productivity review in 3–4 sentences. Mention what went well, any area to improve, and one specific actionable tip for the coming week. Be genuine and specific to the stats — not generic. Keep it under 100 words.",
    },
    {
      role: "user" as const,
      content: `Generate my weekly productivity review based on these stats:\n\n${context}`,
    },
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: 256,
      messages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log?.error({ err }, "tracker review error");
    res.write(`data: ${JSON.stringify({ error: "Failed to generate review" })}\n\n`);
    res.end();
  }
});

export default router;
