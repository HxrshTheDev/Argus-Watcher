import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const socialPostsTable = pgTable("social_posts", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull(),
  content: text("content").notNull(),
  caption: text("caption"),
  hashtags: text("hashtags"),
  tone: text("tone").notNull().default("professional"),
  platform: text("platform"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSocialPostSchema = createInsertSchema(socialPostsTable).omit({ id: true, createdAt: true });
export type InsertSocialPost = z.infer<typeof insertSocialPostSchema>;
export type SocialPost = typeof socialPostsTable.$inferSelect;
