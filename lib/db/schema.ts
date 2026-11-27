import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  varchar,
  integer,
  pgEnum,
  boolean,
} from "drizzle-orm/pg-core";

// -------------------------------------------------------------------------
// MAGICLY — /lib/db/schema.ts
// Drizzle table definitions for Support Tickets (Sprint 1, Batch 1)
//
// These tables mirror the existing support_tickets schema in the
// Supabase project. The schema is minimal — only the fields used by the
// tickets API routes are defined here. This matches the existing project
// architecture (Supabase + Drizzle wrapper).
//
// No Production access — this is a local implementation for the
// feat/inbox-phase0-security-fixes branch only.
// -------------------------------------------------------------------------

// Status enum matching the routes
export const ticketStatusEnum = pgEnum("status", [
  "open",
  "in_progress",
  "closed",
  "cancelled",
]);

export const ticketPriorityEnum = pgEnum("priority", [
  "low",
  "normal",
  "high",
  "urgent",
]);

export const ticketCategoryEnum = pgEnum("category", [
  "bug",
  "feature",
  "question",
  "other",
]);

// Support ticket entity
export const support_tickets = pgTable("support_tickets", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: uuid("user_id").notNull(),
  subject: text("subject").notNull(),
  description: text("description"),
  category: ticketCategoryEnum("category").notNull(),
  status: ticketStatusEnum("status").default("open").notNull(),
  priority: ticketPriorityEnum("priority").default("normal").notNull(),
  assigned_to: uuid("assigned_to"),
  resolved_by: uuid("resolved_by"),
  resolved_at: timestamp("resolved_at"),
  closed_reason: text("closed_reason"),
  rating: integer("rating"),
  rating_at: timestamp("rating_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

// Ticket assignment entity
export const support_ticket_assignments = pgTable("support_ticket_assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticket_id: uuid("ticket_id")
    .notNull()
    .references(() => support_tickets.id),
  user_id: uuid("user_id").notNull(),
  assigned_by: uuid("assigned_by"),
  assigned_at: timestamp("assigned_at").defaultNow().notNull(),
});

// Ticket event entity (audit log)
export const support_ticket_events = pgTable("support_ticket_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticket_id: uuid("ticket_id").notNull(),
  event_type: text("event_type").notNull(),
  user_id: uuid("user_id"),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// Ticket rating entity
export const support_ticket_ratings = pgTable("support_ticket_ratings", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticket_id: uuid("ticket_id").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  user_id: uuid("user_id").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// Message entity
export const support_messages = pgTable("support_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticket_id: uuid("ticket_id").notNull(),
  user_id: uuid("user_id").notNull(),
  author_role: text("author_role").notNull(),
  body: text("body").notNull(),
  is_deleted: boolean("is_deleted").default(false).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// Ticket attachment entity
export const support_ticket_attachments = pgTable("support_ticket_attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticket_id: uuid("ticket_id").notNull(),
  user_id: uuid("user_id").notNull(),
  file_url: text("file_url").notNull(),
  file_name: text("file_name").notNull(),
  mime_type: text("mime_type"),
  size_bytes: integer("size_bytes"),
  uploaded_by: uuid("uploaded_by").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});
