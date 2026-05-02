import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, conversations as conversationsTable, messages as messagesTable } from "@workspace/db";
import { serialize } from "../lib/serialize";
import {
  CreateConversationBody,
  GetConversationParams,
  DeleteConversationParams,
  ListConversationsResponse,
  GetConversationResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/conversations", async (_req, res): Promise<void> => {
  const convos = await db
    .select({
      id: conversationsTable.id,
      title: conversationsTable.title,
      createdAt: conversationsTable.createdAt,
      updatedAt: conversationsTable.updatedAt,
      messageCount: sql<number>`(SELECT COUNT(*) FROM messages WHERE conversation_id = ${conversationsTable.id})::int`,
    })
    .from(conversationsTable)
    .orderBy(desc(conversationsTable.updatedAt));
  res.json(ListConversationsResponse.parse(serialize(convos)));
});

router.post("/conversations", async (req, res): Promise<void> => {
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [conversation] = await db
    .insert(conversationsTable)
    .values({ title: parsed.data.title })
    .returning();
  res.status(201).json({
    ...serialize(conversation),
    messageCount: 0,
  });
});

router.get("/conversations/:id", async (req, res): Promise<void> => {
  const params = GetConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, params.data.id));
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const msgs = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, params.data.id))
    .orderBy(messagesTable.createdAt);
  res.json(GetConversationResponse.parse(serialize({ ...conversation, messages: msgs })));
});

router.delete("/conversations/:id", async (req, res): Promise<void> => {
  const params = DeleteConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(messagesTable).where(eq(messagesTable.conversationId, params.data.id));
  await db.delete(conversationsTable).where(eq(conversationsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
