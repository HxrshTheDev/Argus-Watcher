import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const notebooks = pgTable("notebooks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  emoji: text("emoji").notNull().default("📓"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const notebookSources = pgTable("notebook_sources", {
  id: serial("id").primaryKey(),
  notebookId: integer("notebook_id").notNull().references(() => notebooks.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  type: text("type").notNull().default("text"),
  url: text("url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const notebookNotes = pgTable("notebook_notes", {
  id: serial("id").primaryKey(),
  notebookId: integer("notebook_id").notNull().references(() => notebooks.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const notebookChats = pgTable("notebook_chats", {
  id: serial("id").primaryKey(),
  notebookId: integer("notebook_id").notNull().references(() => notebooks.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  citations: text("citations"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertNotebookSchema = createInsertSchema(notebooks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertNotebookSourceSchema = createInsertSchema(notebookSources).omit({ id: true, createdAt: true });
export const insertNotebookNoteSchema = createInsertSchema(notebookNotes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertNotebookChatSchema = createInsertSchema(notebookChats).omit({ id: true, createdAt: true });

export type Notebook = typeof notebooks.$inferSelect;
export type NotebookSource = typeof notebookSources.$inferSelect;
export type NotebookNote = typeof notebookNotes.$inferSelect;
export type NotebookChat = typeof notebookChats.$inferSelect;
export type InsertNotebook = z.infer<typeof insertNotebookSchema>;
