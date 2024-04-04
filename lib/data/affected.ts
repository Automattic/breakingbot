import { and, eq } from "drizzle-orm";
import type { BreakingBotDb } from "../types/index.js";
import { affected } from "./schema/affected-schema.js";

export type Affected = typeof affected.$inferSelect;

export const addAffectedDb = async (
	db: BreakingBotDb,
	incidentId: number,
	newAffected: string[],
): Promise<Affected[]> => {
	return db
		.insert(affected)
		.values(
			newAffected.map<Affected>((what) => {
				return { incidentId, what };
			}),
		)
		.onConflictDoNothing()
		.returning();
};

export const removeAffectedDb = async (
	db: BreakingBotDb,
	incidentId: number,
	affectedToRm: string,
): Promise<string | null> => {
	const [deleted] = await db
		.delete(affected)
		.where(
			and(eq(affected.incidentId, incidentId), eq(affected.what, affectedToRm)),
		)
		.returning({ affected: affected.what });

	return deleted?.affected;
};
