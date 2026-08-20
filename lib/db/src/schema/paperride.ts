import { createInsertSchema } from "drizzle-zod";
import { boolean, numeric, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const roundModeEnum = pgEnum("paperride_round_mode", ["TEST", "PRODUCTION"]);
export const directionEnum = pgEnum("paperride_direction", ["LONG", "SHORT"]);

export const usersTable = pgTable("paperride_users", {
  wallet: text("wallet").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roundsTable = pgTable("paperride_rounds", {
  id: text("id").primaryKey(),
  mode: roundModeEnum("mode").notNull(),
  opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
  closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
  resolvesAt: timestamp("resolves_at", { withTimezone: true }).notNull(),
  participantCount: numeric("participant_count").notNull().default("0"),
});

export const submissionsTable = pgTable("paperride_submissions", {
  id: text("id").primaryKey(),
  wallet: text("wallet").notNull().references(() => usersTable.wallet),
  roundId: text("round_id").notNull().references(() => roundsTable.id),
  tokenMint: text("token_mint").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  direction: directionEnum("direction").notNull(),
  entryPrice: numeric("entry_price").notNull(),
  entryTimestamp: timestamp("entry_timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const priceSnapshotsTable = pgTable("paperride_price_snapshots", {
  id: text("id").primaryKey(),
  roundId: text("round_id").notNull().references(() => roundsTable.id),
  tokenMint: text("token_mint").notNull(),
  price: numeric("price").notNull(),
  source: text("source").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
});

export const resultsTable = pgTable("paperride_results", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id").notNull().references(() => submissionsTable.id),
  roundId: text("round_id").notNull().references(() => roundsTable.id),
  exitPrice: numeric("exit_price").notNull(),
  returnPct: numeric("return_pct").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settingsTable = pgTable("paperride_settings", {
  id: text("id").primaryKey(),
  mode: roundModeEnum("mode").notNull().default("TEST"),
  tokenMints: text("token_mints").array().notNull(),
});

export const insertSubmissionSchema = createInsertSchema(submissionsTable).omit({ entryTimestamp: true });
export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;