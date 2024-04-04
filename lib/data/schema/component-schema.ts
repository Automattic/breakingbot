import { relations } from "drizzle-orm";
import { bigint, pgTable, varchar } from "drizzle-orm/pg-core";

import { incidents } from "./incident-schema.js";

export const components = pgTable("components", {
	incidentId: bigint("incident_id", { mode: "number" })
		.references(() => incidents.id)
		.notNull(),
	which: varchar("which", { length: 2048 }).notNull(),
});

export const componentRelations = relations(components, ({ one }) => ({
	incident: one(incidents, {
		fields: [components.incidentId],
		references: [incidents.id],
	}),
}));
