import { vi } from "vitest";
import { newIncidentMachine } from "../lib/core/fsm.js";
import { LogType } from "../lib/data/schema/log-entry-schema.js";

import type { DeepMockProxy } from "vitest-mock-extended";
import type { Blocker } from "../lib/data/blocker.js";
import type { Incident } from "../lib/data/incident.js";
import type { LogEntry } from "../lib/data/log.js";
import type { BreakingBot, IncidentIndex } from "../lib/types/index.js";

export const TEST_ROOM = "unit-test-breaking-42";
export const TEST_TRACKER = "BREAKING-42";

export const createIncident = (overrides = {}): Incident => ({
	id: 42,
	title: "Testing 123",
	summary: null,
	chatRoomUid: TEST_ROOM,
	trackerUid: TEST_TRACKER,
	priority: 2,
	point: null,
	comms: null,
	triage: null,
	engLead: null,
	assigned: null,
	genesisAt: null,
	detectedAt: null,
	acknowledgedAt: null,
	mitigatedAt: null,
	resolvedAt: null,
	readyForReviewAt: null,
	completedAt: null,
	archivedAt: null,
	canceledAt: null,
	createdBy: "hanni",
	createdAt: "2024-01-24 14:20:00",
	updatedAt: "2024-01-24 14:20:00",
	affected: [],
	blockers: [],
	components: [],
	...overrides,
});

export const createReviewedIncident = (overrides = {}): Incident => ({
	...createIncident({
		summary: "we've got problems!",
		point: "alice",
		comms: "bob",
		assigned: "charlie",
		genesisAt: "2024-01-24 02:17:00",
		detectedAt: "2024-01-24 13:58:00",
		acknowledgedAt: "2024-01-24 14:23:00",
		mitigatedAt: "2024-01-24 15:02:00",
		resolvedAt: "2024-01-24 21:44:00",
		readyForReviewAt: "2024-01-24 22:31:00",
		components: [{ incidentId: 42, which: "something" }],
	}),
	...overrides,
});

export const createLogEntry = (overrides = {}): LogEntry => ({
	id: 1,
	createdBy: "USOME1234",
	createdAt: "2024-01-24 15:15:00",
	incidentId: 42,
	type: LogType.Note,
	text: "UOTHER456, just noting this down",
	contextUrl: null,
	...overrides,
});

export const createBlocker = (overrides = {}): Blocker => ({
	id: 1,
	createdAt: "2024-02-01 14:25:00",
	incidentId: 42,
	whomst: "javascript",
	reason: "inherently fragile and typescript doesn't save it",
	unblockedAt: null,
	...overrides,
});

export const mockFluentDbInsertOnce = (
	robot: DeepMockProxy<BreakingBot>,
	returnValue: unknown,
) => {
	robot.db.insert.mockReturnValue({
		values: vi.fn().mockReturnThis(),
		// @ts-expect-error
		onConflictDoNothing: vi.fn().mockReturnThis(),
		onConflictDoUpdate: vi.fn().mockReturnThis(),
		returning: vi.fn().mockResolvedValue(returnValue),
	});
};

export const mockFluentDbUpdateOnce = (
	robot: DeepMockProxy<BreakingBot>,
	returnValue: unknown,
) => {
	robot.db.update.mockReturnValueOnce({
		set: vi.fn().mockReturnThis(),
		// @ts-expect-error
		where: vi.fn().mockReturnThis(),
		returning: vi.fn().mockResolvedValue(returnValue),
	});
};

export const mockFluentDbDeleteOnce = (
	robot: DeepMockProxy<BreakingBot>,
	returnValue: unknown,
) => {
	// @ts-expect-error
	robot.db.delete.mockReturnValueOnce({
		where: vi.fn().mockReturnThis(),
		returning: vi.fn().mockResolvedValue(returnValue),
	});
};

export const mockFluentDbSelectOnce = (
	robot: DeepMockProxy<BreakingBot>,
	returnValue: unknown,
) => {
	robot.db.select.mockReturnValue({
		from: vi.fn().mockReturnThis(),
		// @ts-expect-error
		innerJoin: vi.fn().mockReturnThis(),
		leftJoin: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		orderBy: vi.fn().mockResolvedValue(returnValue),
	});
};

export const mockFluentDbSelectDistinctOnce = (
	robot: DeepMockProxy<BreakingBot>,
	returnValue: unknown,
) => {
	robot.db.selectDistinct.mockReturnValue({
		from: vi.fn().mockReturnThis(),
		// @ts-expect-error
		where: vi.fn().mockReturnThis(),
		as: vi.fn().mockResolvedValue(returnValue),
	});
};

export const mockFindIncident = (
	robot: DeepMockProxy<BreakingBot>,
	returnValue: Incident,
) => {
	robot.db.query.incidents.findFirst.mockResolvedValueOnce(returnValue);
};

export const initRobotIncidents = (
	robot: BreakingBot,
	incidents: Incident[],
) => {
	const value = incidents.reduce((acc: IncidentIndex, incident) => {
		if (!incident.chatRoomUid) {
			throw new Error(`Incident ${incident.id} is missing a chat room!`);
		}

		acc[incident.chatRoomUid] = newIncidentMachine(incident);

		return acc;
	}, {});

	Object.defineProperty(robot, "incidents", { value, enumerable: true });
};
