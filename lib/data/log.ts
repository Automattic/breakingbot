import { and, eq, isNull, max, or } from "drizzle-orm";
import { iso9075Now } from "../core/date.js";
import { incidents } from "./schema/incident-schema.js";
import { LogType, log } from "./schema/log-entry-schema.js";

import type { DatetimeIso9075 } from "../core/date.js";
import type { BreakingBotDb } from "../types/index.js";

export type LogEntry = typeof log.$inferSelect;

export const getLogAllDb = (db: BreakingBotDb, incidentId: number) => {
	return db
		.select()
		.from(log)
		.where(eq(log.incidentId, incidentId))
		.orderBy(log.createdAt);
};

export const getLogTypeDb = (
	db: BreakingBotDb,
	incidentId: number,
	type: LogType,
) => {
	return db
		.select()
		.from(log)
		.where(and(eq(log.incidentId, incidentId), eq(log.type, type)))
		.orderBy(log.createdAt);
};

export const addLogTypeDb = (
	db: BreakingBotDb,
	incidentId: number,
	type: LogType,
	text: string,
	createdBy: string,
	contextUrl?: string,
) => {
	return db
		.insert(log)
		.values({
			incidentId,
			type,
			text,
			contextUrl,
			createdBy,
			createdAt: iso9075Now(),
		})
		.returning();
};

export const addLogNoteDb = (
	db: BreakingBotDb,
	incidentId: number,
	text: string,
	createdBy: string,
	contextUrl?: string,
) => {
	return addLogTypeDb(
		db,
		incidentId,
		LogType.Note,
		text,
		createdBy,
		contextUrl,
	);
};

export const getLogNotesDb = (db: BreakingBotDb, incidentId: number) => {
	return getLogTypeDb(db, incidentId, LogType.Note);
};

export const addLogActionItemDb = (
	db: BreakingBotDb,
	incidentId: number,
	text: string,
	createdBy: string,
	contextUrl?: string,
) => {
	return addLogTypeDb(
		db,
		incidentId,
		LogType.ActionItem,
		text,
		createdBy,
		contextUrl,
	);
};

export const getLogAisDb = (db: BreakingBotDb, incidentId: number) => {
	return getLogTypeDb(db, incidentId, LogType.ActionItem);
};

export const addLogContributingFactorDb = (
	db: BreakingBotDb,
	incidentId: number,
	text: string,
	createdBy: string,
	contextUrl?: string,
) => {
	return addLogTypeDb(
		db,
		incidentId,
		LogType.ContributingFactor,
		text,
		createdBy,
		contextUrl,
	);
};

export const getLogContributingFactorsDb = (
	db: BreakingBotDb,
	incidentId: number,
) => {
	return getLogTypeDb(db, incidentId, LogType.ContributingFactor);
};

export const addLogBlockerDb = (
	db: BreakingBotDb,
	incidentId: number,
	text: string,
	createdBy: string,
	contextUrl?: string,
) => {
	return addLogTypeDb(
		db,
		incidentId,
		LogType.Blocker,
		text,
		createdBy,
		contextUrl,
	);
};

export const getLogBlockersDb = (db: BreakingBotDb, incidentId: number) => {
	return getLogTypeDb(db, incidentId, LogType.Blocker);
};

export const addLogUnblockedDb = (
	db: BreakingBotDb,
	incidentId: number,
	text: string,
	createdBy: string,
	contextUrl?: string,
) => {
	return addLogTypeDb(
		db,
		incidentId,
		LogType.Unblock,
		text,
		createdBy,
		contextUrl,
	);
};

export const addLogEventDb = (
	db: BreakingBotDb,
	incidentId: number,
	text: string,
	createdBy: string,
	contextUrl?: string,
) => {
	return addLogTypeDb(
		db,
		incidentId,
		LogType.Event,
		text,
		createdBy,
		contextUrl,
	);
};

export const addLogSummaryUpdateDb = (
	db: BreakingBotDb,
	incidentId: number,
	text: string,
	createdBy: string,
	contextUrl?: string,
) => {
	return addLogTypeDb(
		db,
		incidentId,
		LogType.Summary,
		text,
		createdBy,
		contextUrl,
	);
};

export const addLogPriorityDb = (
	db: BreakingBotDb,
	incidentId: number,
	text: string,
	createdBy: string,
	contextUrl?: string,
) => {
	return addLogTypeDb(
		db,
		incidentId,
		LogType.Priority,
		text,
		createdBy,
		contextUrl,
	);
};

export const addLogPrDb = (
	db: BreakingBotDb,
	incidentId: number,
	text: string,
	createdBy: string,
	contextUrl?: string,
) => {
	return addLogTypeDb(db, incidentId, LogType.Pr, text, createdBy, contextUrl);
};

export const getLogPrsDb = (db: BreakingBotDb, incidentId: number) => {
	return getLogTypeDb(db, incidentId, LogType.Pr);
};

export const addLogCommsUpdateDb = (
	db: BreakingBotDb,
	incidentId: number,
	text: string,
	createdBy: string,
	contextUrl?: string,
) => {
	return addLogTypeDb(
		db,
		incidentId,
		LogType.CommUpdate,
		text,
		createdBy,
		contextUrl,
	);
};

export const getLogMostRecentCommUpdates = async (db: BreakingBotDb) => {
	const sq = db
		.select({
			incidentId: log.incidentId,
			mostRecentCu: max(log.createdAt).as("mostRecentCommUpdate"),
		})
		.from(log)
		.where(or(eq(log.type, LogType.CommUpdate), eq(log.type, LogType.Summary)))
		.groupBy(log.incidentId)
		.as("sq");

	const mostRecentCommUpdate = await db
		.select({ incidentId: incidents.id, mostRecentCommUpdate: sq.mostRecentCu })
		.from(incidents)
		.leftJoin(sq, eq(incidents.id, sq.incidentId))
		.where(and(isNull(incidents.mitigatedAt), isNull(incidents.canceledAt)));

	return mostRecentCommUpdate.reduce(
		(acc: { [incidentId: string]: DatetimeIso9075 | null }, update) => {
			acc[update.incidentId] = update.mostRecentCommUpdate;
			return acc;
		},
		{},
	);
};
