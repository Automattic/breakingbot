import { relations } from "drizzle-orm";
import {
	bigint,
	bigserial,
	pgTable,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";
import { incidents } from "./incident-schema.js";

export const blockers = pgTable("blockers", {
	id: bigserial("id", { mode: "number" }).primaryKey(),

	incidentId: bigint("incident_id", { mode: "number" })
		.references(() => incidents.id)
		.notNull(),

	whomst: varchar("whomst", { length: 255 }).notNull(),
	reason: varchar("reason", { length: 2048 }),
	createdAt: timestamp("created_at", { mode: "string" }).notNull(),
	unblockedAt: timestamp("unblocked_at", { mode: "string" }),
});

export const blockerRelations = relations(blockers, ({ one }) => ({
	incident: one(incidents, {
		fields: [blockers.incidentId],
		references: [incidents.id],
	}),
}));
