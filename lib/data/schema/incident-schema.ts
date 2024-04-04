import { relations } from "drizzle-orm";
import {
	bigserial,
	pgTable,
	smallint,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";
import { affected } from "./affected-schema.js";
import { blockers } from "./blocker-schema.js";
import { components } from "./component-schema.js";
import { log } from "./log-entry-schema.js";

export const incidents = pgTable("incidents", {
	id: bigserial("id", { mode: "number" }).primaryKey(),
	title: varchar("title", { length: 512 }).notNull(),
	summary: text("summary"),
	chatRoomUid: varchar("chat_room_uid", { length: 255 }).unique(),
	trackerUid: varchar("tracker_uid", { length: 2048 }).unique(),
	priority: smallint("priority").notNull(),
	point: varchar("point", { length: 255 }),
	comms: varchar("comms", { length: 255 }),
	triage: varchar("triage", { length: 255 }),
	engLead: varchar("eng_lead", { length: 255 }),
	assigned: varchar("assigned", { length: 255 }),
	genesisAt: timestamp("genesis_at", { mode: "string" }),
	detectedAt: timestamp("detected_at", { mode: "string" }),
	acknowledgedAt: timestamp("acknowledged_at", { mode: "string" }),
	mitigatedAt: timestamp("mitigated_at", { mode: "string" }),
	resolvedAt: timestamp("resolved_at", { mode: "string" }),
	readyForReviewAt: timestamp("rfr_at", { mode: "string" }),
	completedAt: timestamp("completed_at", { mode: "string" }),
	archivedAt: timestamp("archived_at", { mode: "string" }),
	canceledAt: timestamp("canceled_at", { mode: "string" }),
	createdBy: varchar("created_by", { length: 255 }).notNull(),
	createdAt: timestamp("created_at", { mode: "string" }).notNull(),
	updatedAt: timestamp("updated_at", { mode: "string" }).notNull(),
});

export const incidentRelations = relations(incidents, ({ many }) => ({
	affected: many(affected),
	blockers: many(blockers),
	components: many(components),
	log: many(log),
}));
