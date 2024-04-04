import { relations } from "drizzle-orm";
import { bigint, pgTable, varchar } from "drizzle-orm/pg-core";
import { incidents } from "./incident-schema.js";

export const affected = pgTable("affected", {
	incidentId: bigint("incident_id", { mode: "number" })
		.references(() => incidents.id)
		.notNull(),
	what: varchar("what", { length: 2048 }).notNull(),
});

export const affectedRelations = relations(affected, ({ one }) => ({
	incident: one(incidents, {
		fields: [affected.incidentId],
		references: [incidents.id],
	}),
}));
