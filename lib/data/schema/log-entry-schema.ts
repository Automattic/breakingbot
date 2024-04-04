import { relations } from "drizzle-orm";
import {
	bigint,
	bigserial,
	pgTable,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";
import { incidents } from "./incident-schema.js";

export enum LogType {
	ActionItem = "action_item",
	Affected = "affected",
	Blocker = "blocker",
	CommUpdate = "comm_update",
	Component = "component",
	ContributingFactor = "contributing_factor",
	Event = "event",
	Note = "note",
	Pr = "pr",
	Priority = "priority",
	Summary = "summary",
	Unblock = "unblock",
}

export const log = pgTable("log", {
	id: bigserial("id", { mode: "number" }).primaryKey(),
	incidentId: bigint("incident_id", { mode: "number" })
		.references(() => incidents.id)
		.notNull(),
	type: varchar("type", {
		// the enum is only checked at compile time, not actually configured in db column
		enum: [
			LogType.ActionItem,
			LogType.Affected,
			LogType.Blocker,
			LogType.CommUpdate,
			LogType.Component,
			LogType.ContributingFactor,
			LogType.Event,
			LogType.Note,
			LogType.Pr,
			LogType.Priority,
			LogType.Summary,
			LogType.Unblock,
		],
		length: 255,
	}).notNull(),
	text: text("text").notNull(),
	contextUrl: varchar("context_url", { length: 2048 }),
	createdBy: varchar("created_by", { length: 255 }).notNull(),
	createdAt: timestamp("created_at", { mode: "string" }).notNull(),
});

export const logRelations = relations(log, ({ one }) => ({
	incident: one(incidents, {
		fields: [log.incidentId],
		references: [incidents.id],
	}),
}));
