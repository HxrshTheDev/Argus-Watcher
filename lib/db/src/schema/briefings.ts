import { pgTable, serial, text, date, timestamp } from "drizzle-orm/pg-core";

export const briefings = pgTable("briefings", {
  id: serial("id").primaryKey(),
  date: date("date").notNull().unique(),
  headline: text("headline").notNull(),
  content: text("content").notNull(),
  priorities: text("priorities").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Briefing = typeof briefings.$inferSelect;
