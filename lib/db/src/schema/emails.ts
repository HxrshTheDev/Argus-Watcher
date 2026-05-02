import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const emailDraftsTable = pgTable("email_drafts", {
  id: serial("id").primaryKey(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  recipient: text("recipient"),
  context: text("context"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEmailDraftSchema = createInsertSchema(emailDraftsTable).omit({ id: true, createdAt: true });
export type InsertEmailDraft = z.infer<typeof insertEmailDraftSchema>;
export type EmailDraft = typeof emailDraftsTable.$inferSelect;
