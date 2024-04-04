import { and, eq } from "drizzle-orm";
import type { BreakingBotDb } from "../types/index.js";
import { components } from "./schema/component-schema.js";

export type Component = typeof components.$inferSelect;

export const addComponentDb = async (
	db: BreakingBotDb,
	incidentId: number,
	newComponents: string[],
): Promise<Component[]> => {
	return db
		.insert(components)
		.values(
			newComponents.map<Component>((which) => {
				return { incidentId, which };
			}),
		)
		.onConflictDoNothing()
		.returning();
};

export const removeComponentDb = async (
	db: BreakingBotDb,
	incidentId: number,
	component: string,
): Promise<string | null> => {
	const [deleted] = await db
		.delete(components)
		.where(
			and(
				eq(components.incidentId, incidentId),
				eq(components.which, component),
			),
		)
		.returning({ component: components.which });

	return deleted?.component;
};
