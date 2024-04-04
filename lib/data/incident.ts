import { and, eq, gte, isNull } from "drizzle-orm";
import { isDatetimeLeftGtRight, iso9075Now } from "../core/date.js";
import { IncidentState } from "../core/fsm.js";
import { isBlockerActive } from "./blocker.js";
import { affected } from "./schema/affected-schema.js";
import { blockers } from "./schema/blocker-schema.js";
import { components } from "./schema/component-schema.js";
import { incidents } from "./schema/incident-schema.js";
import { log } from "./schema/log-entry-schema.js";

import type { DatetimeIso9075 } from "../core/date.js";
import type { BreakingBotDb } from "../types/index.js";
import type { Affected } from "./affected.js";
import type { Blocker } from "./blocker.js";
import type { Component } from "./component.js";
import type { LogEntry } from "./log.js";

type IncidentRelationTypes = {
	affected: Affected[];
	blockers: Blocker[];
	components: Component[];
};

export type Incident = typeof incidents.$inferSelect & IncidentRelationTypes;

export type IncidentOverview = {
	fiery: Incident[];
	mitigated: Incident[];
	inactive: Incident[];
};

export const findIncidentDb = (db: BreakingBotDb, incidentId: number) => {
	return db.query.incidents.findFirst({
		where: eq(incidents.id, incidentId),
		with: {
			affected: { orderBy: [affected.what] },
			blockers: {
				where: isNull(blockers.unblockedAt),
				orderBy: [blockers.createdAt],
			},
			components: { orderBy: [components.which] },
		},
	});
};

export const findIncidentsInProgressDb = (db: BreakingBotDb) => {
	return db.query.incidents.findMany({
		where: isNull(incidents.archivedAt),
		with: {
			affected: { orderBy: [affected.what] },
			blockers: {
				where: isNull(blockers.unblockedAt),
				orderBy: [blockers.createdAt],
			},
			components: { orderBy: [components.which] },
		},
	});
};

export const setIncidentPointDb = (
	db: BreakingBotDb,
	incidentId: number,
	point: string,
) => {
	return db
		.update(incidents)
		.set({ point, updatedAt: iso9075Now() })
		.where(eq(incidents.id, incidentId))
		.returning({ point: incidents.point });
};

export const setIncidentCommsDb = (
	db: BreakingBotDb,
	incidentId: number,
	comms: string,
) => {
	return db
		.update(incidents)
		.set({ comms, updatedAt: iso9075Now() })
		.where(eq(incidents.id, incidentId))
		.returning({ comms: incidents.comms });
};

export const setIncidentTriageDb = (
	db: BreakingBotDb,
	incidentId: number,
	triage: string,
) => {
	return db
		.update(incidents)
		.set({ triage, updatedAt: iso9075Now() })
		.where(eq(incidents.id, incidentId))
		.returning({ triage: incidents.triage });
};

export const setIncidentEngLeadDb = (
	db: BreakingBotDb,
	incidentId: number,
	engLead: string,
) => {
	return db
		.update(incidents)
		.set({ engLead, updatedAt: iso9075Now() })
		.where(eq(incidents.id, incidentId))
		.returning({ engLead: incidents.engLead });
};

export const setIncidentSummaryDb = (
	db: BreakingBotDb,
	incidentId: number,
	summary: string,
) => {
	return db
		.update(incidents)
		.set({ summary, updatedAt: iso9075Now() })
		.where(eq(incidents.id, incidentId))
		.returning({ summary: incidents.summary });
};

export const setIncidentTitleDb = (
	db: BreakingBotDb,
	incidentId: number,
	title: string,
) => {
	return db
		.update(incidents)
		.set({ title, updatedAt: iso9075Now() })
		.where(eq(incidents.id, incidentId))
		.returning({ title: incidents.title });
};

export const setIncidentAssignedDb = (
	db: BreakingBotDb,
	incidentId: number,
	assigned: string,
) => {
	return db
		.update(incidents)
		.set({ assigned, updatedAt: iso9075Now() })
		.where(eq(incidents.id, incidentId))
		.returning({ assigned: incidents.assigned });
};

export const setIncidentPriorityDb = (
	db: BreakingBotDb,
	incidentId: number,
	priority: number,
) => {
	return db
		.update(incidents)
		.set({ priority, updatedAt: iso9075Now() })
		.where(eq(incidents.id, incidentId))
		.returning({ priority: incidents.priority });
};

export const isIncidentActive = (incident: Incident): boolean => {
	const state = currentPersistedState(incident);

	return (
		state === IncidentState.Started ||
		state === IncidentState.Acknowledged ||
		state === IncidentState.Mitigated ||
		state === IncidentState.Blocked
	);
};

export const isIncidentUpdatable = (incident: Incident): boolean => {
	const state = currentPersistedState(incident);

	return (
		state !== IncidentState.Archived &&
		state !== IncidentState.Canceled &&
		state !== IncidentState.Completed
	);
};

export const isIncidentBlocked = (incident: Incident): boolean => {
	return incident.blockers.some((b) => isBlockerActive(b));
};

export const ackIncidentDb = async (
	db: BreakingBotDb,
	incidentId: number,
): Promise<DatetimeIso9075 | null> => {
	const now = iso9075Now();

	const [result] = await db
		.update(incidents)
		.set({ acknowledgedAt: now, updatedAt: now })
		.where(eq(incidents.id, incidentId))
		.returning({ value: incidents.acknowledgedAt });

	return result?.value ?? null;
};

export const genesisIncidentDb = async (
	db: BreakingBotDb,
	incidentId: number,
	genesisAt: DatetimeIso9075,
): Promise<DatetimeIso9075 | null> => {
	const [result] = await db
		.update(incidents)
		.set({ genesisAt, updatedAt: iso9075Now() })
		.where(eq(incidents.id, incidentId))
		.returning({ value: incidents.genesisAt });

	return result?.value ?? null;
};

export const detectedIncidentDb = async (
	db: BreakingBotDb,
	incidentId: number,
	detectedAt: DatetimeIso9075,
): Promise<DatetimeIso9075 | null> => {
	const [result] = await db
		.update(incidents)
		.set({ detectedAt, updatedAt: iso9075Now() })
		.where(eq(incidents.id, incidentId))
		.returning({ value: incidents.detectedAt });

	return result?.value ?? null;
};

export const ackMitigateIncidentDb = async (
	db: BreakingBotDb,
	incidentId: number,
	at: DatetimeIso9075 = iso9075Now(),
): Promise<[DatetimeIso9075, DatetimeIso9075] | [null, null]> => {
	const [result] = await db
		.update(incidents)
		.set({ acknowledgedAt: at, mitigatedAt: at, updatedAt: iso9075Now() })
		.where(eq(incidents.id, incidentId))
		.returning({
			acknowledgedAt: incidents.acknowledgedAt,
			mitigatedAt: incidents.mitigatedAt,
		});

	return result?.acknowledgedAt && result?.mitigatedAt
		? [result.acknowledgedAt, result.mitigatedAt]
		: [null, null];
};

export const mitigateIncidentDb = async (
	db: BreakingBotDb,
	incidentId: number,
	mitigatedAt: DatetimeIso9075,
): Promise<DatetimeIso9075 | null> => {
	const [result] = await db
		.update(incidents)
		.set({ mitigatedAt, updatedAt: iso9075Now() })
		.where(eq(incidents.id, incidentId))
		.returning({ value: incidents.mitigatedAt });

	return result?.value ?? null;
};

export const mitigateResolveIncidentDb = async (
	db: BreakingBotDb,
	incidentId: number,
): Promise<[DatetimeIso9075, DatetimeIso9075] | [null, null]> => {
	const now = iso9075Now();

	const [result] = await db
		.update(incidents)
		.set({ mitigatedAt: now, resolvedAt: now, updatedAt: now })
		.where(eq(incidents.id, incidentId))
		.returning({
			mitigatedAt: incidents.mitigatedAt,
			resolvedAt: incidents.resolvedAt,
		});

	return result?.mitigatedAt && result?.resolvedAt
		? [result.mitigatedAt, result.resolvedAt]
		: [null, null];
};

export const ackMitigateResolveIncidentDb = async (
	db: BreakingBotDb,
	incidentId: number,
): Promise<
	[DatetimeIso9075, DatetimeIso9075, DatetimeIso9075] | [null, null, null]
> => {
	const now = iso9075Now();

	const [result] = await db
		.update(incidents)
		.set({
			acknowledgedAt: now,
			mitigatedAt: now,
			resolvedAt: now,
			updatedAt: now,
		})
		.where(eq(incidents.id, incidentId))
		.returning({
			acknowledgedAt: incidents.acknowledgedAt,
			mitigatedAt: incidents.mitigatedAt,
			resolvedAt: incidents.resolvedAt,
		});

	return result?.acknowledgedAt && result?.mitigatedAt && result?.resolvedAt
		? [result.acknowledgedAt, result.mitigatedAt, result.resolvedAt]
		: [null, null, null];
};

export const resolveIncidentDb = async (
	db: BreakingBotDb,
	incidentId: number,
): Promise<DatetimeIso9075 | null> => {
	const now = iso9075Now();

	const [result] = await db
		.update(incidents)
		.set({ resolvedAt: now, updatedAt: now })
		.where(eq(incidents.id, incidentId))
		.returning({ value: incidents.resolvedAt });

	return result?.value ?? null;
};

export const unresolveIncidentDb = async (
	db: BreakingBotDb,
	incidentId: number,
): Promise<boolean> => {
	const [result] = await db
		.update(incidents)
		.set({ resolvedAt: null, updatedAt: iso9075Now() })
		.where(eq(incidents.id, incidentId))
		.returning({ value: incidents.id });

	return result?.value ? false : true;
};

export const rfrIncidentDb = async (
	db: BreakingBotDb,
	incidentId: number,
): Promise<DatetimeIso9075 | null> => {
	const [result] = await db
		.update(incidents)
		.set({ readyForReviewAt: iso9075Now(), updatedAt: iso9075Now() })
		.where(eq(incidents.id, incidentId))
		.returning({ value: incidents.readyForReviewAt });

	return result?.value ?? null;
};

export const completeIncidentDb = async (
	db: BreakingBotDb,
	incidentId: number,
): Promise<DatetimeIso9075 | null> => {
	const [result] = await db
		.update(incidents)
		.set({ completedAt: iso9075Now(), updatedAt: iso9075Now() })
		.where(eq(incidents.id, incidentId))
		.returning({ value: incidents.completedAt });

	return result?.value ?? null;
};

export const archiveIncidentDb = async (
	db: BreakingBotDb,
	incidentId: number,
): Promise<DatetimeIso9075 | null> => {
	const [result] = await db
		.update(incidents)
		.set({ archivedAt: iso9075Now(), updatedAt: iso9075Now() })
		.where(eq(incidents.id, incidentId))
		.returning({ value: incidents.archivedAt });

	return result?.value ?? null;
};

export const cancelIncidentDb = async (
	db: BreakingBotDb,
	incidentId: number,
): Promise<DatetimeIso9075 | null> => {
	const [result] = await db
		.update(incidents)
		.set({ canceledAt: iso9075Now(), updatedAt: iso9075Now() })
		.where(eq(incidents.id, incidentId))
		.returning({ value: incidents.canceledAt });

	return result?.value ?? null;
};

export const uncancelIncidentDb = async (
	db: BreakingBotDb,
	incidentId: number,
): Promise<boolean> => {
	const [result] = await db
		.update(incidents)
		.set({ canceledAt: null, updatedAt: iso9075Now() })
		.where(eq(incidents.id, incidentId))
		.returning({ value: incidents.id });

	return result?.value ? false : true;
};

export const restartIncidentDb = async (
	db: BreakingBotDb,
	incidentId: number,
): Promise<Incident | undefined> => {
	const [result] = await db
		.update(incidents)
		.set({
			mitigatedAt: null,
			resolvedAt: null,
			canceledAt: null,
			updatedAt: iso9075Now(),
		})
		.where(
			and(
				eq(incidents.id, incidentId),
				isNull(incidents.completedAt),
				isNull(incidents.archivedAt),
			),
		)
		.returning({ value: incidents.id });

	if (!result?.value) {
		return;
	}

	return findIncidentDb(db, result.value);
};

export const getStateOfInterest = (
	incident: Incident,
): IncidentState | null => {
	const state = currentPersistedState(incident);

	if (
		state === IncidentState.Resolved ||
		state === IncidentState.Blocked ||
		state === IncidentState.Mitigated
	) {
		return state;
	}

	return null;
};

export const currentPersistedState = (incident: Incident): IncidentState => {
	if (incident.archivedAt) {
		return IncidentState.Archived;
	}

	if (incident.canceledAt) {
		return IncidentState.Canceled;
	}

	if (incident.completedAt) {
		return IncidentState.Completed;
	}

	if (incident.readyForReviewAt) {
		return IncidentState.ReadyForReview;
	}

	if (incident.resolvedAt) {
		return IncidentState.Resolved;
	}

	if (isIncidentBlocked(incident)) {
		return IncidentState.Blocked;
	}

	if (incident.mitigatedAt) {
		return IncidentState.Mitigated;
	}

	if (incident.acknowledgedAt) {
		return IncidentState.Acknowledged;
	}

	return IncidentState.Started;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: tricksy
export const rfrAnalysis = (incident: Incident): string[] => {
	const analysis = [];

	if (!incident.assigned) {
		analysis.push("`.assign` must be set");
	}

	if (!incident.summary) {
		analysis.push("`.summary` must be set");
	}

	if (!incident.genesisAt) {
		analysis.push("`.genesis <when>` must be set");
	}

	if (!incident.detectedAt) {
		analysis.push("`.detected <when>` must be set");
	}

	if (!incident.acknowledgedAt) {
		analysis.push("`.acknowledged <when>` must be set");
	}

	if (!incident.mitigatedAt) {
		analysis.push("`.mitgated <when>` must be set");
	}

	if (!incident.resolvedAt) {
		analysis.push("`.resolved <when>` must be set");
	}

	if (incident.components.length === 0) {
		analysis.push("At least one `.component` must be set");
	}

	if (
		incident.genesisAt &&
		incident.detectedAt &&
		isDatetimeLeftGtRight(incident.genesisAt, incident.detectedAt)
	) {
		analysis.push(
			"Incident genesis must be before detection, use `.genesis` and/or `.detected` to correct",
		);
	}

	if (
		incident.genesisAt &&
		incident.mitigatedAt &&
		isDatetimeLeftGtRight(incident.genesisAt, incident.mitigatedAt)
	) {
		analysis.push(
			"Incident genesis must be before mitigation, use `.genesis` and/or `.mitigated` to correct",
		);
	}

	if (
		incident.detectedAt &&
		incident.acknowledgedAt &&
		isDatetimeLeftGtRight(incident.detectedAt, incident.acknowledgedAt)
	) {
		analysis.push(
			"Incident detection must be before acknowledgement, use `.detected` to correct",
		);
	}

	if (
		incident.mitigatedAt &&
		incident.resolvedAt &&
		isDatetimeLeftGtRight(incident.mitigatedAt, incident.resolvedAt)
	) {
		analysis.push(
			"Incident must be mitigated before it was resolved, use `.mitigated` and/or `.resolved` to correct",
		);
	}

	return analysis;
};

export const isIncidentReadyForReview = (incident: Incident) => {
	return rfrAnalysis(incident).length === 0;
};

export const incidentSortByPriority = (incidents: Incident[]) => {
	incidents.sort((a, b) => {
		if (a.priority === b.priority) {
			return a.title.localeCompare(b.title);
		}

		return a.priority - b.priority;
	});
};

export const incidentOverview = (incidents: Incident[]) => {
	const incidentOverview: IncidentOverview = {
		fiery: [],
		mitigated: [],
		inactive: [],
	};

	for (const key in incidents) {
		const incident = incidents[key];

		if (!isIncidentActive(incident)) {
			incidentOverview.inactive.push(incident);
		} else if (incident.mitigatedAt) {
			incidentOverview.mitigated.push(incident);
		} else {
			incidentOverview.fiery.push(incident);
		}
	}

	return incidentOverview;
};

export const getSyncsToDo = async (
	db: BreakingBotDb,
	lastRunAt: DatetimeIso9075,
) => {
	const sq = db
		.selectDistinct({ incidentId: log.incidentId })
		.from(log)
		.where(gte(log.createdAt, lastRunAt))
		.as("sq");

	const logs = await db
		.select({
			chatRoomId: incidents.chatRoomUid,
			logId: log.id,
			logIncidentId: log.incidentId,
			logType: log.type,
			logText: log.text,
			logContextUrl: log.contextUrl,
			logCreatedBy: log.createdBy,
			logCreatedAt: log.createdAt,
		})
		.from(log)
		.innerJoin(sq, eq(log.incidentId, sq.incidentId))
		.leftJoin(incidents, eq(log.incidentId, incidents.id))
		.orderBy(log.createdAt);

	return logs.reduce((acc: { [chatRoomId: string]: LogEntry[] }, record) => {
		if (!record.chatRoomId) {
			throw new Error("getSyncsToDo: missing chat room id!"); // "should never happen!"
		}

		acc[record.chatRoomId] = [
			...(acc[record.chatRoomId] || []),
			{
				id: record.logId,
				incidentId: record.logIncidentId,
				type: record.logType,
				text: record.logText,
				contextUrl: record.logContextUrl,
				createdBy: record.logCreatedBy,
				createdAt: record.logCreatedAt,
			},
		];

		return acc;
	}, {});
};
