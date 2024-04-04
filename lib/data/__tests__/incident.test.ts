import { describe, expect, test } from "vitest";
import { createBlocker, createIncident } from "../../../test/index.js";
import { IncidentState } from "../../core/fsm.js";
import {
	currentPersistedState,
	incidentSortByPriority,
	isIncidentActive,
	isIncidentBlocked,
} from "../incident.js";

describe("incident.ts", () => {
	describe("currentPersistedState", () => {
		test("Started", () => {
			const state = currentPersistedState(createIncident());
			expect(state).toBe(IncidentState.Started);
		});

		test("Acknowledged", () => {
			const state = currentPersistedState(
				createIncident({ acknowledgedAt: "2024-02-03 10:24:00" }),
			);

			expect(state).toBe(IncidentState.Acknowledged);
		});

		test("Mitigated", () => {
			const state = currentPersistedState(
				createIncident({ mitigatedAt: "2024-02-03 10:24:00" }),
			);

			expect(state).toBe(IncidentState.Mitigated);
		});

		test("Blocked", () => {
			const state = currentPersistedState(
				createIncident({ blockers: [createBlocker()] }),
			);

			expect(state).toBe(IncidentState.Blocked);
		});

		test("Resolved", () => {
			const state = currentPersistedState(
				createIncident({ resolvedAt: "2024-02-03 10:24:00" }),
			);

			expect(state).toBe(IncidentState.Resolved);
		});

		test("Completed", () => {
			const state = currentPersistedState(
				createIncident({ completedAt: "2024-02-03 10:24:00" }),
			);

			expect(state).toBe(IncidentState.Completed);
		});

		test("Canceled", () => {
			const state = currentPersistedState(
				createIncident({ canceledAt: "2024-02-03 10:24:00" }),
			);

			expect(state).toBe(IncidentState.Canceled);
		});

		test("Archived", () => {
			const state = currentPersistedState(
				createIncident({ archivedAt: "2024-02-03 10:24:00" }),
			);

			expect(state).toBe(IncidentState.Archived);
		});

		test("Archived when all sorta stuff set", () => {
			const state = currentPersistedState(
				createIncident({
					acknowledgedAt: "2024-02-03 10:20:00",
					mitigatedAt: "2024-02-03 10:20:00",
					resolvedAt: "2024-02-03 10:20:00",
					completedAt: "2024-02-03 10:22:00",
					archivedAt: "2024-02-03 10:24:00",
				}),
			);

			expect(state).toBe(IncidentState.Archived);
		});
	});

	describe("isIncidentActive", () => {
		test("Started is active", () => {
			expect(isIncidentActive(createIncident())).toBe(true);
		});

		test("Acknowledged is active", () => {
			const incident = createIncident({
				acknowledgedAt: "2024-02-03 10:15:00",
			});

			expect(isIncidentActive(incident)).toBe(true);
		});

		test("Mitigated is active", () => {
			const incident = createIncident({
				acknowledgedAt: "2024-02-03 10:15:00",
				mitigatedAt: "2024-02-03 10:15:00",
			});

			expect(isIncidentActive(incident)).toBe(true);
		});

		test("Mitigated but blocked is active", () => {
			const incident = createIncident({
				acknowledgedAt: "2024-02-03 10:15:00",
				mitigatedAt: "2024-02-03 10:15:00",
				blockers: [createBlocker()],
			});

			expect(isIncidentActive(incident)).toBe(true);
		});

		test("Resolved is inactive", () => {
			const incident = createIncident({
				acknowledgedAt: "2024-02-03 10:15:00",
				mitigatedAt: "2024-02-03 10:15:00",
				resolvedAt: "2024-02-03 10:18:00",
			});

			expect(isIncidentActive(incident)).toBe(false);
		});

		test("Canceled is inactive", () => {
			const incident = createIncident({
				acknowledgedAt: "2024-02-03 10:15:00",
				mitigatedAt: "2024-02-03 10:15:00",
				canceledAt: "2024-02-03 10:18:00",
			});

			expect(isIncidentActive(incident)).toBe(false);
		});

		test("ArchivedAt is inactive", () => {
			const incident = createIncident({
				acknowledgedAt: "2024-02-03 10:15:00",
				mitigatedAt: "2024-02-03 10:15:00",
				canceledAt: "2024-02-03 10:18:00",
				archivedAt: "2024-02-03 10:18:00",
			});

			expect(isIncidentActive(incident)).toBe(false);
		});
	});

	describe("isIncidentBlocked", () => {
		test("blocked", () => {
			const incident = createIncident({
				blockers: [createBlocker()],
			});

			expect(isIncidentBlocked(incident)).toBe(true);
		});

		test("blocked with some blockers unblocked", () => {
			const incident = createIncident({
				blockers: [
					createBlocker({ unblockedAt: "2024-02-03 10:37:00" }),
					createBlocker(),
					createBlocker({ unblockedAt: "2024-02-03 10:41:00" }),
				],
			});

			expect(isIncidentBlocked(incident)).toBe(true);
		});

		test("not blocked", () => {
			expect(isIncidentBlocked(createIncident())).toBe(false);
		});
	});

	describe("incidentSortByPriority", () => {
		test("sort incidents by priority and then by title", () => {
			const aP3 = createIncident({ title: "A Incident", priority: 3 });
			const bP1 = createIncident({ title: "B Incident", priority: 1 });
			const cP1 = createIncident({ title: "C Incident", priority: 1 });
			const dP2 = createIncident({ title: "D Incident", priority: 2 });

			const incidents = [cP1, aP3, bP1, dP2];

			incidentSortByPriority(incidents);

			expect(incidents).toStrictEqual([bP1, cP1, dP2, aP3]);
		});
	});
});
