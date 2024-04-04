import { and, eq, isNull } from "drizzle-orm";
import { iso9075Now } from "../core/date.js";
import type { BreakingBotDb } from "../types/index.js";
import { blockers } from "./schema/blocker-schema.js";

export type Blocker = typeof blockers.$inferSelect;

export const addBlockerDb = (
	db: BreakingBotDb,
	incidentId: number,
	whomst: string,
	reason?: string,
): Promise<Blocker[]> => {
	return db
		.insert(blockers)
		.values({ incidentId, whomst, reason, createdAt: iso9075Now() })
		.onConflictDoNothing()
		.returning();
};

export const unblockBlockerDb = (
	db: BreakingBotDb,
	incidentId: number,
	blockerId: number,
): Promise<Blocker[]> => {
	return db
		.update(blockers)
		.set({ unblockedAt: iso9075Now() })
		.where(
			and(
				eq(blockers.id, blockerId),
				eq(blockers.incidentId, incidentId),
				isNull(blockers.unblockedAt),
			),
		)
		.returning();
};

export const unblockAllBlockersDb = (
	db: BreakingBotDb,
	incidentId: number,
): Promise<Blocker[]> => {
	return db
		.update(blockers)
		.set({ unblockedAt: iso9075Now() })
		.where(eq(blockers.incidentId, incidentId))
		.returning();
};

export const isBlockerActive = (blocker: Blocker): boolean => {
	return blocker.unblockedAt === null || blocker.unblockedAt === undefined;
};
