import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const researchNotesTable = pgTable("research_notes", {
  id: serial("id").primaryKey(),
  query: text("query").notNull(),
  summary: text("summary").notNull(),
  insights: text("insights").notNull(),
  conclusion: text("conclusion"),
  sources: text("sources"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertResearchNoteSchema = createInsertSchema(researchNotesTable).omit({ id: true, createdAt: true });
export type InsertResearchNote = z.infer<typeof insertResearchNoteSchema>;
export type ResearchNote = typeof researchNotesTable.$inferSelect;
