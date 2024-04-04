import { beforeEach, describe, expect, test, vi } from "vitest";
import { type DeepMockProxy, mockDeep } from "vitest-mock-extended";
import { testConfig } from "../../../../../config/test.js";
import {
	TEST_ROOM,
	TEST_TRACKER,
	createBlocker,
	createIncident,
	createLogEntry,
	createReviewedIncident,
	mockFindIncident,
	mockFluentDbInsertOnce,
	mockFluentDbSelectOnce,
	mockFluentDbUpdateOnce,
} from "../../../../../test/index.js";
import { iso9075Now } from "../../../../core/date.js";
import {
	ACK,
	IncidentState,
	NEXT,
	RFR,
	TutorialState,
	newIncidentMachine,
} from "../../../../core/fsm.js";
import type { Incident } from "../../../../data/incident.js";
import { type UserCache, userCacheMerge } from "../../../../data/user-cache.js";
import type { BreakingBot, ChatUserId } from "../../../../types/index.js";
import {
	incidentAcknowledge,
	incidentAddInterestedParty,
	incidentAssign,
	incidentCancel,
	incidentComplete,
	incidentMitigate,
	incidentNotify,
	incidentReadyForReview,
	incidentResolve,
	incidentRestart,
	incidentSetComms,
	incidentSetDetected,
	incidentSetEngLead,
	incidentSetGenesis,
	incidentSetMitigated,
	incidentSetPoint,
	incidentSetPriority,
	incidentSetSummary,
	incidentSetTitle,
	incidentSetTriage,
	incidentStart,
	incidentUncancel,
	incidentUnresolve,
} from "../incident.js";

describe("incident.ts", () => {
	let robot: DeepMockProxy<BreakingBot>;

	beforeEach(() => {
		robot = mockDeep<BreakingBot>();
		// @ts-expect-error
		robot.config = { ...testConfig };
		// @ts-expect-error
		robot.incidents[TEST_ROOM] = newIncidentMachine({ ...newIncident });
		// @ts-expect-error
		robot.users = new Map();
	});

	describe("incidentStart", () => {
		test("success without tracker", async () => {
			robot.db.transaction.mockResolvedValue(newIncidentDbRecord);

			robot.tracker = undefined;

			await incidentStart(robot, "test123!", "sally");

			expect(robot.db.transaction).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(0);
			expect(robot.adapter.notifyNewIncident).toHaveBeenCalledTimes(1);
			expect(robot.adapter.introNewIncident).toHaveBeenCalledTimes(1);
		});

		test("success with tracker", async () => {
			robot.db.transaction.mockResolvedValue(newIncidentDbRecord);
			mockFluentDbUpdateOnce(robot, null);
			robot.tracker?.createIssue.mockResolvedValue(TEST_TRACKER);

			await incidentStart(robot, "test123!", "juan");

			expect(robot.db.transaction).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.tracker?.createIssue).toHaveBeenCalledTimes(1);
			expect(robot.adapter.notifyNewIncident).toHaveBeenCalledTimes(1);
			expect(robot.adapter.introNewIncident).toHaveBeenCalledTimes(1);
		});

		test("success low priority", async () => {
			robot.db.transaction.mockResolvedValue({
				...newIncidentDbRecord,
				priority: testConfig.priorities.defaultLow,
			});

			mockFluentDbUpdateOnce(robot, null);
			robot.tracker?.createIssue.mockResolvedValue(TEST_TRACKER);

			await incidentStart(
				robot,
				"test123!",
				"juan",
				testConfig.priorities.defaultLow,
			);

			expect(robot.db.transaction).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.tracker?.createIssue).toHaveBeenCalledTimes(1);
			expect(robot.adapter.notifyNewLowIncident).toHaveBeenCalledTimes(1);
			expect(robot.adapter.introNewIncident).toHaveBeenCalledTimes(1);
		});

		test("initial db transaction fails", async () => {
			robot.db.transaction.mockResolvedValue(undefined);

			await incidentStart(robot, "test123!", "smith");

			expect(robot.logger.error).toHaveBeenCalledWith(
				expect.stringContaining("Incident start failure!"),
			);
		});

		test("late missing chatRoomUid fatals", async () => {
			const mockExit = vi
				.spyOn(process, "exit")
				.mockImplementation((code?: number) => {
					throw new Error(`Process.exit(${code})`);
				});

			robot.db.transaction.mockResolvedValue({
				id: 42,
				title: "detriot rap city",
				chatRoomUid: null,
				priority: 2,
				createdAt: "2024-01-19 03:10:00",
				updatedAt: "2024-01-19 03:10:00",
			});

			try {
				await incidentStart(robot, "test123!", "talia");
			} catch (e) {
				if (!(e instanceof Error)) {
					throw e;
				}

				expect(robot.logger.error).toHaveBeenCalledTimes(1);
				expect(mockExit).toHaveBeenCalledTimes(1);
				expect(e.message).toBe("Process.exit(1)");
			}

			mockExit.mockRestore();
		});
	});

	describe("incidentResolve", () => {
		test("success", async () => {
			mockFluentDbUpdateOnce(robot, [
				{
					acknowledgedAt: "2024-01-25 00:28:00",
					mitigatedAt: "2024-01-25 00:28:00",
					resolvedAt: "2024-01-25 00:28:00",
				},
			]);
			mockFluentDbInsertOnce(robot, []);
			mockFluentDbSelectOnce(robot, []);

			await incidentResolve(robot, TEST_ROOM, "wassim");

			expect(robot.adapter.sendResolved).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Resolved);
			expect(robot.incidents[TEST_ROOM].data().acknowledgedAt).toBe(
				"2024-01-25 00:28:00",
			);
			expect(robot.incidents[TEST_ROOM].data().mitigatedAt).toBe(
				"2024-01-25 00:28:00",
			);
			expect(robot.incidents[TEST_ROOM].data().resolvedAt).toBe(
				"2024-01-25 00:28:00",
			);
		});

		test("success with acknowledged already set", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({ acknowledgedAt: "2024-01-25 00:02:30" }),
			);

			mockFluentDbUpdateOnce(robot, [
				{
					mitigatedAt: "2024-01-25 00:28:00",
					resolvedAt: "2024-01-25 00:28:00",
				},
			]);
			mockFluentDbInsertOnce(robot, []);
			mockFluentDbSelectOnce(robot, []);

			await incidentResolve(robot, TEST_ROOM, "wassim");

			expect(robot.adapter.sendResolved).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Resolved);
			expect(robot.incidents[TEST_ROOM].data().acknowledgedAt).toBe(
				"2024-01-25 00:02:30",
			);
			expect(robot.incidents[TEST_ROOM].data().mitigatedAt).toBe(
				"2024-01-25 00:28:00",
			);
			expect(robot.incidents[TEST_ROOM].data().resolvedAt).toBe(
				"2024-01-25 00:28:00",
			);
		});

		test("success with mitigated already set", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					acknowledgedAt: "2024-01-25 00:03:40",
					mitigatedAt: "2024-01-25 00:03:40",
				}),
			);

			mockFluentDbUpdateOnce(robot, [{ value: "2024-01-25 00:28:00" }]);
			mockFluentDbInsertOnce(robot, []);
			mockFluentDbSelectOnce(robot, []);

			await incidentResolve(robot, TEST_ROOM, "wassim");

			expect(robot.adapter.sendResolved).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Resolved);
			expect(robot.incidents[TEST_ROOM].data().acknowledgedAt).toBe(
				"2024-01-25 00:03:40",
			);
			expect(robot.incidents[TEST_ROOM].data().mitigatedAt).toBe(
				"2024-01-25 00:03:40",
			);
			expect(robot.incidents[TEST_ROOM].data().resolvedAt).toBe(
				"2024-01-25 00:28:00",
			);
		});

		test("fails if incident has blockers", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({ blockers: [{ whomst: "google" }] }),
			);

			await incidentResolve(robot, TEST_ROOM, "wassim");
			expect(robot.adapter.sendResolved).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().resolvedAt).toBeNull();
		});

		test("fails if incident in an inactive state", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({ completedAt: "2024-01-27 16:47:49" }),
			);

			await incidentResolve(robot, TEST_ROOM, "wassim");
			expect(robot.adapter.sendResolved).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().resolvedAt).toBeNull();
		});

		test("fails if db update fails", async () => {
			mockFluentDbUpdateOnce(robot, []);
			await incidentResolve(robot, TEST_ROOM, "wassim");
			expect(robot.adapter.sendResolved).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().resolvedAt).toBeNull();
		});
	});

	describe("incidentUnresolve", () => {
		test("success fallback to Mitigated", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					point: "john",
					comms: "sue",
					acknowledgedAt: "2024-01-27 12:35:00",
					mitigatedAt: "2024-01-27 12:50:00",
					resolvedAt: "2024-01-27 17:50:00",
				}),
			);

			mockFluentDbUpdateOnce(robot, [{ value: "someIncidentId" }]);
			mockFluentDbInsertOnce(robot, []);

			await incidentUnresolve(robot, TEST_ROOM, "gunther");

			expect(robot.adapter.replyToMessage).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Mitigated);
			expect(robot.incidents[TEST_ROOM].data().mitigatedAt).toBe(
				"2024-01-27 12:50:00",
			);
			expect(robot.incidents[TEST_ROOM].data().resolvedAt).toBeNull();
		});

		test("fails if incident in Canceled", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					resolvedAt: "2024-01-27 17:50:00",
					canceledAt: "2024-01-27 18:12:34",
				}),
			);

			await incidentUnresolve(robot, TEST_ROOM, "gunther");
			expect(robot.adapter.replyToMessage).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Canceled);
			expect(robot.incidents[TEST_ROOM].data().resolvedAt).toBe(
				"2024-01-27 17:50:00",
			);
		});

		test("fails if incident in Completed", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					resolvedAt: "2024-01-27 17:50:00",
					completedAt: "2024-01-27 16:47:49",
				}),
			);

			await incidentUnresolve(robot, TEST_ROOM, "gunther");
			expect(robot.adapter.replyToMessage).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Completed);
			expect(robot.incidents[TEST_ROOM].data().resolvedAt).toBe(
				"2024-01-27 17:50:00",
			);
		});

		test("fails if incident in Archived", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					resolvedAt: "2024-01-27 17:50:00",
					completedAt: "2024-01-27 16:47:49",
					archivedAt: "2024-01-27 20:47:49",
				}),
			);

			await incidentUnresolve(robot, TEST_ROOM, "gunther");
			expect(robot.adapter.replyToMessage).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Archived);
			expect(robot.incidents[TEST_ROOM].data().resolvedAt).toBe(
				"2024-01-27 17:50:00",
			);
		});

		test("fails if db update fails", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					acknowledgedAt: "2024-01-27 17:50:00",
					mitigatedAt: "2024-01-27 17:50:00",
					resolvedAt: "2024-01-27 17:50:00",
				}),
			);

			mockFluentDbUpdateOnce(robot, []);
			await incidentUnresolve(robot, TEST_ROOM, "gunther");
			expect(robot.adapter.replyToMessage).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Resolved);
			expect(robot.incidents[TEST_ROOM].data().resolvedAt).toBe(
				"2024-01-27 17:50:00",
			);
		});
	});

	describe("incidentComplete", () => {
		test("success RFR to Completed with report", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(createReviewedIncident());
			robot.incidents[TEST_ROOM].action(RFR);

			mockFluentDbUpdateOnce(robot, [{ value: "2024-01-26 13:04:00" }]);
			mockFluentDbInsertOnce(robot, null);
			mockFluentDbSelectOnce(robot, []);

			await incidentComplete(robot, TEST_ROOM, "johnston");

			expect(robot.adapter.sendCompleted).toHaveBeenCalledTimes(1);
			expect(robot.reporter?.draft).toHaveBeenCalledTimes(1);
			expect(robot.adapter.reactToMessage).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Completed);
			expect(robot.incidents[TEST_ROOM].data().completedAt).toBe(
				"2024-01-26 13:04:00",
			);
		});

		test("success RFR to Completed without reporter", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(createReviewedIncident());
			robot.incidents[TEST_ROOM].action(RFR);

			mockFluentDbUpdateOnce(robot, [{ value: "2024-01-26 13:04:00" }]);
			mockFluentDbInsertOnce(robot, null);

			robot.reporter = undefined;

			await incidentComplete(robot, TEST_ROOM, "johnston");

			expect(robot.adapter.sendCompleted).toHaveBeenCalledTimes(1);
			expect(robot.adapter.reactToMessage).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Completed);
			expect(robot.incidents[TEST_ROOM].data().completedAt).toBe(
				"2024-01-26 13:04:00",
			);
		});

		test("success RFR to Completed with reporter no report required", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createReviewedIncident({ priority: 4 }),
			);
			robot.incidents[TEST_ROOM].action(RFR);

			mockFluentDbUpdateOnce(robot, [{ value: "2024-01-26 13:04:00" }]);
			mockFluentDbInsertOnce(robot, null);

			await incidentComplete(robot, TEST_ROOM, "johnston");

			expect(robot.adapter.sendCompleted).toHaveBeenCalledTimes(1);
			expect(robot.reporter?.draft).toHaveBeenCalledTimes(0);
			expect(robot.adapter.reactToMessage).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Completed);
			expect(robot.incidents[TEST_ROOM].data().completedAt).toBe(
				"2024-01-26 13:04:00",
			);
		});

		test("success Resolved to Completed with reporter no review or report required", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createReviewedIncident({ priority: 4 }),
			);

			mockFluentDbUpdateOnce(robot, [{ value: "2024-01-26 13:04:00" }]);
			mockFluentDbInsertOnce(robot, null);

			await incidentComplete(robot, TEST_ROOM, "johnston");

			expect(robot.adapter.sendCompleted).toHaveBeenCalledTimes(1);
			expect(robot.reporter?.draft).toHaveBeenCalledTimes(0);
			expect(robot.adapter.reactToMessage).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Completed);
			expect(robot.incidents[TEST_ROOM].data().completedAt).toBe(
				"2024-01-26 13:04:00",
			);
		});

		test("fails when review required but not past RFR", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createReviewedIncident({ readyForReviewAt: null }),
			);

			mockFluentDbUpdateOnce(robot, [{ value: "2024-01-26 13:04:00" }]);
			mockFluentDbInsertOnce(robot, null);
			mockFluentDbSelectOnce(robot, []);

			await incidentComplete(robot, TEST_ROOM, "johnston");

			expect(robot.adapter.sendCompleted).toHaveBeenCalledTimes(0);
			expect(robot.reporter?.draft).toHaveBeenCalledTimes(0);
			expect(robot.adapter.reactToMessage).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Resolved);
			expect(robot.incidents[TEST_ROOM].data().completedAt).toBeNull();
		});
	});

	describe("incidentSetPoint", () => {
		test("success with ack action", async () => {
			setUserCacheEntry(robot.users, "adele");
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({ comms: "jojo" }),
			);

			const point = "adele";
			const ackAt = iso9075Now();

			mockFluentDbUpdateOnce(robot, [{ point }]);
			mockFluentDbUpdateOnce(robot, [{ value: ackAt }]);
			mockFluentDbInsertOnce(robot, null);
			mockFluentDbInsertOnce(robot, null);

			await incidentSetPoint(robot, TEST_ROOM, point, point);

			expect(robot.adapter.sendPointTakeover).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(2);
			expect(robot.db.insert).toHaveBeenCalledTimes(2);
			expect(robot.incidents[TEST_ROOM].data().point).toBe(point);
			expect(robot.incidents[TEST_ROOM].data().acknowledgedAt).toBe(ackAt);
		});

		test("success without ack action", async () => {
			setUserCacheEntry(robot.users, "adele");
			mockFluentDbUpdateOnce(robot, [{ point: "adele" }]);
			mockFluentDbInsertOnce(robot, []);

			await incidentSetPoint(robot, TEST_ROOM, "adele", "adele");

			expect(robot.adapter.sendPointTakeover).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().point).toBe("adele");
			expect(robot.incidents[TEST_ROOM].data().acknowledgedAt).toBeNull();
		});

		test("success without ack with cache miss", async () => {
			robot.adapter.validateUser.mockResolvedValue(true);
			mockFluentDbUpdateOnce(robot, [{ point: "adele" }]);
			mockFluentDbInsertOnce(robot, []);

			await incidentSetPoint(robot, TEST_ROOM, "adele", "adele");

			expect(robot.adapter.sendPointTakeover).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().point).toBe("adele");
			expect(robot.incidents[TEST_ROOM].data().acknowledgedAt).toBeNull();
		});

		test("fails if invalid user", async () => {
			await incidentSetPoint(robot, TEST_ROOM, "adele", "adele");

			expect(robot.adapter.reactToMessage).toHaveBeenCalledWith(
				TEST_ROOM,
				"exclamation",
				undefined,
			);

			expect(robot.db.update).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().point).toBeNull();
		});

		test("fails if db update fails", async () => {
			setUserCacheEntry(robot.users, "adele");
			mockFluentDbUpdateOnce(robot, []);

			await incidentSetPoint(robot, TEST_ROOM, "adele", "adele");

			expect(robot.adapter.sendPointTakeover).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().point).toBeNull();
			expect(robot.incidents[TEST_ROOM].data().acknowledgedAt).toBeNull();
		});
	});

	describe("incidentSetComms", () => {
		test("success with ack action", async () => {
			setUserCacheEntry(robot.users, "adele");
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({ point: "jojo" }),
			);

			const comms = "adele";
			const ackAt = iso9075Now();

			mockFluentDbUpdateOnce(robot, [{ comms }]);
			mockFluentDbUpdateOnce(robot, [{ value: ackAt }]);
			mockFluentDbInsertOnce(robot, null);
			mockFluentDbInsertOnce(robot, null);

			await incidentSetComms(robot, TEST_ROOM, comms, comms);

			expect(robot.adapter.sendCommsTakeover).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(2);
			expect(robot.db.insert).toHaveBeenCalledTimes(2);
			expect(robot.incidents[TEST_ROOM].data().comms).toBe(comms);
			expect(robot.incidents[TEST_ROOM].data().acknowledgedAt).toBe(ackAt);
		});

		test("success without ack action", async () => {
			setUserCacheEntry(robot.users, "adele");
			mockFluentDbUpdateOnce(robot, [{ comms: "adele" }]);
			mockFluentDbInsertOnce(robot, []);

			await incidentSetComms(robot, TEST_ROOM, "adele", "adele");

			expect(robot.adapter.sendCommsTakeover).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().comms).toBe("adele");
			expect(robot.incidents[TEST_ROOM].data().acknowledgedAt).toBeNull();
		});

		test("success without ack with cache miss", async () => {
			robot.adapter.validateUser.mockResolvedValue(true);
			mockFluentDbUpdateOnce(robot, [{ comms: "adele" }]);
			mockFluentDbInsertOnce(robot, []);

			await incidentSetComms(robot, TEST_ROOM, "adele", "adele");

			expect(robot.adapter.sendCommsTakeover).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().comms).toBe("adele");
			expect(robot.incidents[TEST_ROOM].data().acknowledgedAt).toBeNull();
		});

		test("fails if invalid user", async () => {
			await incidentSetComms(robot, TEST_ROOM, "adele", "adele");

			expect(robot.adapter.reactToMessage).toHaveBeenCalledWith(
				TEST_ROOM,
				"exclamation",
				undefined,
			);

			expect(robot.db.update).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().comms).toBeNull();
		});

		test("fails if db update fails", async () => {
			setUserCacheEntry(robot.users, "adele");
			mockFluentDbUpdateOnce(robot, []);

			await incidentSetComms(robot, TEST_ROOM, "adele", "adele");

			expect(robot.adapter.sendCommsTakeover).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().comms).toBeNull();
			expect(robot.incidents[TEST_ROOM].data().acknowledgedAt).toBeNull();
		});
	});

	describe("incidentSetTriage", () => {
		test("success", async () => {
			setUserCacheEntry(robot.users, "stani");
			mockFluentDbUpdateOnce(robot, [{ triage: "stani" }]);
			mockFluentDbInsertOnce(robot, []);

			await incidentSetTriage(robot, TEST_ROOM, "stani", "stani");

			expect(robot.adapter.sendTriageTakeover).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().triage).toBe("stani");
		});

		test("success with cache miss", async () => {
			robot.adapter.validateUser.mockResolvedValue(true);
			mockFluentDbUpdateOnce(robot, [{ triage: "stani" }]);
			mockFluentDbInsertOnce(robot, []);

			await incidentSetTriage(robot, TEST_ROOM, "stani", "stani");

			expect(robot.adapter.sendTriageTakeover).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().triage).toBe("stani");
		});

		test("fails if invalid user", async () => {
			await incidentSetTriage(robot, TEST_ROOM, "stani", "stani");

			expect(robot.adapter.reactToMessage).toHaveBeenCalledWith(
				TEST_ROOM,
				"exclamation",
				undefined,
			);

			expect(robot.db.update).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().triage).toBeNull();
		});

		test("fails if db update fails", async () => {
			setUserCacheEntry(robot.users, "stani");
			mockFluentDbUpdateOnce(robot, []);

			await incidentSetTriage(robot, TEST_ROOM, "stani", "stani");

			expect(robot.adapter.sendTriageTakeover).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().triage).toBeNull();
		});
	});

	describe("incidentSetEngLead", () => {
		test("success", async () => {
			setUserCacheEntry(robot.users, "luke");
			mockFluentDbUpdateOnce(robot, [{ engLead: "luke" }]);
			mockFluentDbInsertOnce(robot, []);

			await incidentSetEngLead(robot, TEST_ROOM, "luke", "luke");

			expect(robot.adapter.sendEngLeadTakeover).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().engLead).toBe("luke");
		});

		test("success with cache miss", async () => {
			robot.adapter.validateUser.mockResolvedValue(true);
			mockFluentDbUpdateOnce(robot, [{ engLead: "luke" }]);
			mockFluentDbInsertOnce(robot, []);

			await incidentSetEngLead(robot, TEST_ROOM, "luke", "luke");

			expect(robot.adapter.sendEngLeadTakeover).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().engLead).toBe("luke");
		});

		test("fails if invalid user", async () => {
			await incidentSetEngLead(robot, TEST_ROOM, "luke", "luke");

			expect(robot.adapter.reactToMessage).toHaveBeenCalledWith(
				TEST_ROOM,
				"exclamation",
				undefined,
			);

			expect(robot.db.update).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().engLead).toBeNull();
		});

		test("fails if db update fails", async () => {
			setUserCacheEntry(robot.users, "luke");
			mockFluentDbUpdateOnce(robot, []);

			await incidentSetEngLead(robot, TEST_ROOM, "luke", "luke");

			expect(robot.adapter.sendEngLeadTakeover).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().engLead).toBeNull();
		});
	});

	describe("incidentSetSummary", () => {
		test("success", async () => {
			const summary = "Some summary";

			mockFluentDbUpdateOnce(robot, [{ summary }]);
			mockFluentDbInsertOnce(robot, null);

			await incidentSetSummary(robot, TEST_ROOM, summary, "kurt");

			expect(robot.adapter.sendSummaryUpdated).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().summary).toBe(summary);
		});

		test("fails if db update fails", async () => {
			mockFluentDbUpdateOnce(robot, []);

			await incidentSetSummary(robot, TEST_ROOM, "Some summary!", "kurt");

			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendSummaryUpdated).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().summary).toBeNull();
		});
	});

	describe("incidentSetTitle", () => {
		test("success", async () => {
			const title = "Awwwoooooga!";

			mockFluentDbUpdateOnce(robot, [{ title }]);
			mockFluentDbInsertOnce(robot, null);

			await incidentSetTitle(robot, TEST_ROOM, title, "maria");

			expect(robot.adapter.updateBreakingTopic).toHaveBeenCalledTimes(1);
			expect(robot.adapter.reactToMessage).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().title).toBe(title);
		});

		test("success without report uid", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({ trackerUid: null }),
			);

			const title = "Awwwoooooga!";

			mockFluentDbUpdateOnce(robot, [{ title }]);
			mockFluentDbInsertOnce(robot, null);

			await incidentSetTitle(robot, TEST_ROOM, title, "maria");

			expect(robot.adapter.updateBreakingTopic).toHaveBeenCalledTimes(1);
			expect(robot.adapter.reactToMessage).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().title).toBe(title);
		});

		test("fails if db update fails", async () => {
			mockFluentDbUpdateOnce(robot, []);

			await incidentSetTitle(robot, TEST_ROOM, "Awwwoooooga!", "maria");

			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.adapter.updateBreakingTopic).toHaveBeenCalledTimes(0);
			expect(robot.adapter.reactToMessage).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().title).toBe(
				"Testing...testing!",
			);
		});
	});

	describe("incidentSetPriority", () => {
		test("success", async () => {
			mockFluentDbUpdateOnce(robot, [{ priority: 1 }]);
			mockFluentDbInsertOnce(robot, []);

			await incidentSetPriority(robot, TEST_ROOM, 1, null, "peter");

			expect(robot.adapter.sendPriorityUpdated).toHaveBeenCalledTimes(1);
			expect(robot.adapter.updateBreakingTopic).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().priority).toBe(1);
		});

		test("success noop if set to same", async () => {
			const current = robot.incidents[TEST_ROOM].data().priority;

			await incidentSetPriority(robot, TEST_ROOM, current, null, "peter");

			expect(robot.adapter.reactToMessage).toHaveBeenLastCalledWith(
				TEST_ROOM,
				"ok_hand",
				undefined,
			);

			expect(robot.adapter.sendPriorityUpdated).toHaveBeenCalledTimes(0);
			expect(robot.adapter.updateBreakingTopic).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().priority).toBe(current);
		});

		test("fails if not a priority", async () => {
			await incidentSetPriority(robot, TEST_ROOM, 94, null, "peter");

			expect(robot.adapter.sendPriorityUpdated).toHaveBeenCalledTimes(0);
			expect(robot.adapter.updateBreakingTopic).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledWith(
				TEST_ROOM,
				"Invalid priority. Maybe check out `.priorities`?",
				undefined,
			);
			expect(robot.db.update).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().priority).toBe(2);
		});

		test("fails if priority NaN", async () => {
			await incidentSetPriority(robot, TEST_ROOM, Number.NaN, null, "peter");

			expect(robot.adapter.sendPriorityUpdated).toHaveBeenCalledTimes(0);
			expect(robot.adapter.updateBreakingTopic).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().priority).toBe(2);
		});

		test("fails if db update fails", async () => {
			mockFluentDbUpdateOnce(robot, []);

			await incidentSetPriority(robot, TEST_ROOM, 1, null, "peter");

			expect(robot.adapter.sendPriorityUpdated).toHaveBeenCalledTimes(0);
			expect(robot.adapter.updateBreakingTopic).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().priority).toBe(2);
		});
	});

	describe("incidentAssign", () => {
		test("success", async () => {
			setUserCacheEntry(robot.users, "john");
			mockFluentDbUpdateOnce(robot, [{ assigned: "john" }]);
			mockFluentDbInsertOnce(robot, []);

			await incidentAssign(robot, TEST_ROOM, "john", "peter");

			expect(robot.adapter.reactToMessage).toHaveBeenCalledWith(
				TEST_ROOM,
				"ok_hand",
				undefined,
			);

			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().assigned).toBe("john");
		});

		test("success with cache miss", async () => {
			robot.adapter.validateUser.mockResolvedValueOnce(true);
			mockFluentDbUpdateOnce(robot, [{ assigned: "john" }]);
			mockFluentDbInsertOnce(robot, []);

			await incidentAssign(robot, TEST_ROOM, "john", "peter");

			expect(robot.adapter.reactToMessage).toHaveBeenCalledWith(
				TEST_ROOM,
				"ok_hand",
				undefined,
			);

			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().assigned).toBe("john");
		});

		test("fails if invalid user", async () => {
			await incidentAssign(robot, TEST_ROOM, "john", "peter");

			expect(robot.adapter.reactToMessage).toHaveBeenCalledWith(
				TEST_ROOM,
				"exclamation",
				undefined,
			);

			expect(robot.db.update).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().assigned).toBeNull();
		});

		test("fails if db update fails", async () => {
			setUserCacheEntry(robot.users, "john");
			mockFluentDbUpdateOnce(robot, []);

			await incidentAssign(robot, TEST_ROOM, "john", "peter");

			expect(robot.adapter.reactToMessage).toHaveBeenCalledWith(
				TEST_ROOM,
				"exclamation",
				undefined,
			);

			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().assigned).toBeNull();
		});
	});

	describe("incidentAcknowledge", () => {
		test("success", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({ point: "dan", comms: "steph" }),
			);

			robot.incidents[TEST_ROOM].action(ACK);

			mockFluentDbUpdateOnce(robot, [{ value: "2024-02-03 09:46:00" }]);
			mockFluentDbInsertOnce(robot, null);

			await incidentAcknowledge(robot, TEST_ROOM, "ezra");

			expect(robot.adapter.reactToMessage).toHaveBeenCalledTimes(0);
			expect(robot.adapter.replyToMessage).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().acknowledgedAt).toBe(
				"2024-02-03 09:46:00",
			);
		});

		test("fails if incident not in Acknowledged", async () => {
			mockFluentDbUpdateOnce(robot, [{ value: "2024-02-03 09:46:00" }]);
			mockFluentDbInsertOnce(robot, null);

			await incidentAcknowledge(robot, TEST_ROOM, "ezra");

			expect(robot.adapter.reactToMessage).toHaveBeenCalledTimes(1);
			expect(robot.adapter.replyToMessage).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().acknowledgedAt).toBeNull();
		});

		test("fails if db update fails", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({ point: "dan", comms: "steph" }),
			);

			robot.incidents[TEST_ROOM].action(ACK);

			mockFluentDbUpdateOnce(robot, []);

			await incidentAcknowledge(robot, TEST_ROOM, "ezra");

			expect(robot.logger.error).toHaveBeenCalledTimes(1);
			expect(robot.adapter.replyToMessage).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().acknowledgedAt).toBeNull();
		});
	});

	describe("incidentSetGenesis", () => {
		test("success", async () => {
			robot.adapter.getUserTimezone.mockResolvedValue("America/Detroit");
			mockFluentDbUpdateOnce(robot, [{ value: "valid time" }]);
			mockFluentDbInsertOnce(robot, null);

			await incidentSetGenesis(robot, TEST_ROOM, "January 1, 2024", "meg");

			expect(robot.adapter.sendGenesisUpdated).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().genesisAt).toBe("valid time");
		});

		test("fails if after incident start", async () => {
			robot.adapter.getUserTimezone.mockResolvedValue("America/Detroit");

			await incidentSetGenesis(robot, TEST_ROOM, "tomorrow", "meg");

			expect(robot.adapter.sendGenesisUpdated).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().genesisAt).toBeNull();
		});

		test("fails if db update fails", async () => {
			robot.adapter.getUserTimezone.mockResolvedValue("America/Detroit");
			mockFluentDbUpdateOnce(robot, []);

			await incidentSetGenesis(robot, TEST_ROOM, "January 1, 2024", "meg");

			expect(robot.adapter.sendGenesisUpdated).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().genesisAt).toBeNull();
		});
	});

	describe("incidentSetDetected", () => {
		test("success", async () => {
			robot.adapter.getUserTimezone.mockResolvedValue("America/Detroit");
			mockFluentDbUpdateOnce(robot, [{ value: "valid time" }]);
			mockFluentDbInsertOnce(robot, null);

			await incidentSetDetected(robot, TEST_ROOM, "January 1, 2024", "meg");

			expect(robot.adapter.sendDetectedUpdated).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().detectedAt).toBe("valid time");
		});

		test("fails if after incident start", async () => {
			robot.adapter.getUserTimezone.mockResolvedValue("America/Detroit");

			await incidentSetDetected(robot, TEST_ROOM, "tomorrow", "meg");

			expect(robot.adapter.sendDetectedUpdated).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().detectedAt).toBeNull();
		});

		test("fails if db update fails", async () => {
			robot.adapter.getUserTimezone.mockResolvedValue("America/Detroit");
			mockFluentDbUpdateOnce(robot, []);

			await incidentSetDetected(robot, TEST_ROOM, "January 1, 2024", "meg");

			expect(robot.adapter.sendDetectedUpdated).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().detectedAt).toBeNull();
		});
	});

	describe("incidentMitigate", () => {
		test("success when not acknowledged", async () => {
			const datetime = "2024-02-02 21:44:00";

			robot.adapter.getUserTimezone.mockResolvedValue("America/Detroit");

			mockFluentDbInsertOnce(robot, null);
			mockFluentDbUpdateOnce(robot, [
				{ acknowledgedAt: datetime, mitigatedAt: datetime },
			]);

			await incidentMitigate(robot, TEST_ROOM, "jack");

			expect(robot.adapter.sendMitigated).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().acknowledgedAt).toBe(datetime);
			expect(robot.incidents[TEST_ROOM].data().mitigatedAt).toBe(datetime);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Mitigated);
		});

		test("success when acknowledged", async () => {
			const ackDt = "2024-01-27 22:01:00";
			const mitDt = "2024-02-02 21:44:00";

			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({ acknowledgedAt: ackDt }),
			);

			robot.adapter.getUserTimezone.mockResolvedValue("America/Detroit");

			mockFluentDbInsertOnce(robot, null);
			mockFluentDbUpdateOnce(robot, [{ value: mitDt }]);

			await incidentMitigate(robot, TEST_ROOM, "jack");

			expect(robot.adapter.sendMitigated).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().acknowledgedAt).toBe(ackDt);
			expect(robot.incidents[TEST_ROOM].data().mitigatedAt).toBe(mitDt);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Mitigated);
		});

		test("fails if incident cannot be mitigated", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({ canceledAt: "2024-01-26 14:40:00" }),
			);

			await incidentMitigate(robot, TEST_ROOM, "jack");

			expect(robot.adapter.sendMitigated).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
		});

		test("fails if db update fails", async () => {
			robot.adapter.getUserTimezone.mockResolvedValue("America/Detroit");
			mockFluentDbUpdateOnce(robot, []);

			await incidentMitigate(robot, TEST_ROOM, "jack");

			expect(robot.adapter.sendMitigated).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
		});
	});

	describe("incidentSetMitigated", () => {
		test("success when not acknowledged", async () => {
			const datetime = "2024-02-02 21:44:00";

			robot.adapter.getUserTimezone.mockResolvedValue("America/Detroit");

			mockFluentDbInsertOnce(robot, null);
			mockFluentDbUpdateOnce(robot, [
				{ acknowledgedAt: datetime, mitigatedAt: datetime },
			]);

			await incidentSetMitigated(robot, TEST_ROOM, "17 minutes ago", "jack");

			expect(robot.adapter.sendMitigated).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().acknowledgedAt).toBe(datetime);
			expect(robot.incidents[TEST_ROOM].data().mitigatedAt).toBe(datetime);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Mitigated);
		});

		test("success when acknowledged", async () => {
			const ackDt = "2024-01-27 22:01:00";
			const mitDt = "2024-02-02 21:44:00";

			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({ acknowledgedAt: ackDt }),
			);

			robot.adapter.getUserTimezone.mockResolvedValue("America/Detroit");

			mockFluentDbInsertOnce(robot, null);
			mockFluentDbUpdateOnce(robot, [{ value: mitDt }]);

			await incidentSetMitigated(robot, TEST_ROOM, "17 minutes ago", "jack");

			expect(robot.adapter.sendMitigated).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().acknowledgedAt).toBe(ackDt);
			expect(robot.incidents[TEST_ROOM].data().mitigatedAt).toBe(mitDt);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Mitigated);
		});

		test("success when resolved", async () => {
			const ackDt = "2024-01-27 22:01:00";
			const mitDt = "2024-02-02 21:44:00";
			const resDt = "2024-02-02 21:52:00";

			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					acknowledgedAt: ackDt,
					mitigatedAt: "2024-02-02 21:52:00",
					resolvedAt: resDt,
				}),
			);

			robot.adapter.getUserTimezone.mockResolvedValue("America/Detroit");

			mockFluentDbInsertOnce(robot, null);
			mockFluentDbUpdateOnce(robot, [{ value: mitDt }]);

			await incidentSetMitigated(robot, TEST_ROOM, "17 minutes ago", "jack");

			expect(robot.adapter.sendMitigated).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().acknowledgedAt).toBe(ackDt);
			expect(robot.incidents[TEST_ROOM].data().mitigatedAt).toBe(mitDt);
			expect(robot.incidents[TEST_ROOM].data().resolvedAt).toBe(resDt);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Resolved);
		});

		test("fails if incident cannot be mitigated", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({ canceledAt: "2024-01-26 14:40:00" }),
			);

			await incidentSetMitigated(robot, TEST_ROOM, "17 minutes ago", "jack");

			expect(robot.adapter.sendMitigated).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Canceled);
		});

		test("fails if in the future", async () => {
			robot.adapter.getUserTimezone.mockResolvedValue("America/Detroit");

			await incidentSetMitigated(robot, TEST_ROOM, "tomorrow", "jack");

			expect(robot.adapter.sendMitigated).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].data().mitigatedAt).toBeNull();
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Started);
		});

		test("fails if db update fails", async () => {
			robot.adapter.getUserTimezone.mockResolvedValue("America/Detroit");
			mockFluentDbUpdateOnce(robot, []);

			await incidentSetMitigated(robot, TEST_ROOM, "17 minutes ago", "jack");

			expect(robot.adapter.sendMitigated).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Started);
		});
	});

	describe("incidentReadyForReview", () => {
		test("success", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					summary: "some problem",
					point: "john",
					comms: "sue",
					assigned: "matt",
					genesisAt: "2024-01-31 14:50:00",
					detectedAt: "2024-01-31 15:05:00",
					acknowledgedAt: "2024-01-31 15:09:00",
					mitigatedAt: "2024-01-31 15:24:00",
					resolvedAt: "2024-01-31 15:38:00",
					components: ["bigcompy1"],
				}),
			);

			mockFluentDbUpdateOnce(robot, [{ value: "2024-01-31 15:40:00" }]);
			mockFluentDbSelectOnce(robot, []);
			mockFluentDbInsertOnce(robot, []);

			await incidentReadyForReview(robot, TEST_ROOM, "cindy");

			expect(robot.adapter.sendBeginReview).toHaveBeenCalledTimes(1);
			expect(robot.adapter.reactToMessage).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].state()).toBe(
				IncidentState.ReadyForReview,
			);
		});

		test("already in progress", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					summary: "some problem",
					point: "john",
					comms: "sue",
					assigned: "matt",
					genesisAt: "2024-01-31 14:50:00",
					detectedAt: "2024-01-31 15:05:00",
					acknowledgedAt: "2024-01-31 15:09:00",
					mitigatedAt: "2024-01-31 15:24:00",
					resolvedAt: "2024-01-31 15:38:00",
					components: ["bigcompy1"],
				}),
			);

			robot.incidents[TEST_ROOM].action(RFR);

			await incidentReadyForReview(robot, TEST_ROOM, "cindy");

			expect(robot.adapter.sendBeginReview).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledWith(
				TEST_ROOM,
				"Review currently in progress!",
				undefined,
			);
			expect(robot.incidents[TEST_ROOM].state()).toBe(
				IncidentState.ReadyForReview,
			);
		});

		test("fails if missing summary", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					point: "john",
					comms: "sue",
					assigned: "matt",
					genesisAt: "2024-01-31 14:50:00",
					detectedAt: "2024-01-31 15:05:00",
					acknowledgedAt: "2024-01-31 15:09:00",
					mitigatedAt: "2024-01-31 15:24:00",
					resolvedAt: "2024-01-31 15:38:00",
					components: ["bigcompy1"],
				}),
			);

			await incidentReadyForReview(robot, TEST_ROOM, "cindy");

			expect(robot.adapter.sendBeginReview).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendErrorListToRoom).toHaveBeenCalledTimes(1);
		});

		test("fails if missing assigned", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					summary: "some problem",
					point: "john",
					comms: "sue",
					genesisAt: "2024-01-31 14:50:00",
					detectedAt: "2024-01-31 15:05:00",
					acknowledgedAt: "2024-01-31 15:09:00",
					mitigatedAt: "2024-01-31 15:24:00",
					resolvedAt: "2024-01-31 15:38:00",
					components: ["bigcompy1"],
				}),
			);

			await incidentReadyForReview(robot, TEST_ROOM, "cindy");

			expect(robot.adapter.sendBeginReview).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendErrorListToRoom).toHaveBeenCalledTimes(1);
		});

		test("fails if missing genesis", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					summary: "some problem",
					point: "john",
					comms: "sue",
					assigned: "matt",
					detectedAt: "2024-01-31 15:05:00",
					acknowledgedAt: "2024-01-31 15:09:00",
					mitigatedAt: "2024-01-31 15:24:00",
					resolvedAt: "2024-01-31 15:38:00",
					components: ["bigcompy1"],
				}),
			);

			await incidentReadyForReview(robot, TEST_ROOM, "cindy");

			expect(robot.adapter.sendBeginReview).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendErrorListToRoom).toHaveBeenCalledTimes(1);
		});

		test("fails if missing detected", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					summary: "some problem",
					point: "john",
					comms: "sue",
					assigned: "matt",
					genesisAt: "2024-01-31 14:50:00",
					acknowledgedAt: "2024-01-31 15:09:00",
					mitigatedAt: "2024-01-31 15:24:00",
					resolvedAt: "2024-01-31 15:38:00",
					components: ["bigcompy1"],
				}),
			);

			await incidentReadyForReview(robot, TEST_ROOM, "cindy");

			expect(robot.adapter.sendBeginReview).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendErrorListToRoom).toHaveBeenCalledTimes(1);
		});

		test("fails if missing acknowledged", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					summary: "some problem",
					point: "john",
					comms: "sue",
					assigned: "matt",
					genesisAt: "2024-01-31 14:50:00",
					detectedAt: "2024-01-31 15:05:00",
					mitigatedAt: "2024-01-31 15:24:00",
					resolvedAt: "2024-01-31 15:38:00",
					components: ["bigcompy1"],
				}),
			);

			await incidentReadyForReview(robot, TEST_ROOM, "cindy");

			expect(robot.adapter.sendBeginReview).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendErrorListToRoom).toHaveBeenCalledTimes(1);
		});

		test("fails if missing mitigated", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					summary: "some problem",
					point: "john",
					comms: "sue",
					assigned: "matt",
					genesisAt: "2024-01-31 14:50:00",
					detectedAt: "2024-01-31 15:05:00",
					acknowledgedAt: "2024-01-31 15:09:00",
					resolvedAt: "2024-01-31 15:38:00",
					components: ["bigcompy1"],
				}),
			);

			await incidentReadyForReview(robot, TEST_ROOM, "cindy");

			expect(robot.adapter.sendBeginReview).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendErrorListToRoom).toHaveBeenCalledTimes(1);
		});

		test("fails if missing resolved", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					summary: "some problem",
					point: "john",
					comms: "sue",
					assigned: "matt",
					genesisAt: "2024-01-31 14:50:00",
					detectedAt: "2024-01-31 15:05:00",
					acknowledgedAt: "2024-01-31 15:09:00",
					mitigatedAt: "2024-01-31 15:24:00",
					components: ["bigcompy1"],
				}),
			);

			await incidentReadyForReview(robot, TEST_ROOM, "cindy");

			expect(robot.adapter.sendBeginReview).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledWith(
				TEST_ROOM,
				"Incident must be resolved first!",
				undefined,
			);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Mitigated);
		});

		test("fails if no components", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					summary: "some problem",
					point: "john",
					comms: "sue",
					assigned: "matt",
					genesisAt: "2024-01-31 14:50:00",
					detectedAt: "2024-01-31 15:05:00",
					acknowledgedAt: "2024-01-31 15:09:00",
					mitigatedAt: "2024-01-31 15:24:00",
					resolvedAt: "2024-01-31 15:38:00",
				}),
			);

			await incidentReadyForReview(robot, TEST_ROOM, "cindy");

			expect(robot.adapter.sendBeginReview).toHaveBeenCalledTimes(0);
			expect(robot.adapter.reactToMessage).toHaveBeenCalledTimes(1);
		});

		test("fails if db update fails", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createReviewedIncident({ readyForReviewAt: null }),
			);

			mockFluentDbUpdateOnce(robot, []);

			await incidentReadyForReview(robot, TEST_ROOM, "cindy");

			expect(robot.adapter.sendBeginReview).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledWith(
				TEST_ROOM,
				"DB update failed!",
				undefined,
			);
		});
	});

	describe("incidentCancel", () => {
		test("success from Started", async () => {
			mockFluentDbUpdateOnce(robot, [{ value: "2024-02-03 23:03:00" }]);
			mockFluentDbInsertOnce(robot, []);

			await incidentCancel(robot, TEST_ROOM, "sandy");

			expect(robot.adapter.notifyCanceled).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Canceled);
			expect(robot.incidents[TEST_ROOM].data().canceledAt).toBe(
				"2024-02-03 23:03:00",
			);
		});

		test("success from Acknowledged", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({ acknowledgedAt: "2024-01-27 11:10:00" }),
			);

			mockFluentDbUpdateOnce(robot, [{ value: "2024-02-03 23:03:00" }]);
			mockFluentDbInsertOnce(robot, []);

			expect(robot.incidents[TEST_ROOM].state()).toBe(
				IncidentState.Acknowledged,
			);

			await incidentCancel(robot, TEST_ROOM, "sandy");

			expect(robot.adapter.notifyCanceled).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Canceled);
			expect(robot.incidents[TEST_ROOM].data().canceledAt).toBe(
				"2024-02-03 23:03:00",
			);
		});

		test("success from Mitigated", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					acknowledgedAt: "2024-01-27 11:10:00",
					mitigatedAt: "2024-01-27 11:10:00",
				}),
			);

			mockFluentDbUpdateOnce(robot, [{ value: "2024-02-03 23:03:00" }]);
			mockFluentDbInsertOnce(robot, []);

			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Mitigated);

			await incidentCancel(robot, TEST_ROOM, "sandy");

			expect(robot.adapter.notifyCanceled).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Canceled);
			expect(robot.incidents[TEST_ROOM].data().canceledAt).toBe(
				"2024-02-03 23:03:00",
			);
		});

		test("success from Blocked", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					acknowledgedAt: "2024-01-27 11:10:00",
					mitigatedAt: "2024-01-27 11:10:00",
					blockers: [createBlocker()],
				}),
			);

			mockFluentDbUpdateOnce(robot, [{ value: "2024-02-03 23:03:00" }]);
			mockFluentDbInsertOnce(robot, []);

			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Blocked);

			await incidentCancel(robot, TEST_ROOM, "sandy");

			expect(robot.adapter.notifyCanceled).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Canceled);
			expect(robot.incidents[TEST_ROOM].data().canceledAt).toBe(
				"2024-02-03 23:03:00",
			);
		});
	});

	describe("incidentUncancel", () => {
		test("success from Canceled", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({ canceledAt: "2024-02-03 23:44:00" }),
			);

			mockFluentDbUpdateOnce(robot, [{ value: "2024-02-03 23:03:00" }]);
			mockFluentDbInsertOnce(robot, []);

			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Canceled);

			await incidentUncancel(robot, TEST_ROOM, "sandy");

			expect(robot.adapter.replyToMessage).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Started);
			expect(robot.incidents[TEST_ROOM].data().canceledAt).toBeNull();
		});

		test("fails from Resolved", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					acknowledgedAt: "2024-01-27 11:10:00",
					mitigatedAt: "2024-01-27 14:50:00",
					resolvedAt: "2024-01-27 14:50:00",
				}),
			);

			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Resolved);

			await incidentUncancel(robot, TEST_ROOM, "sandy");

			expect(robot.adapter.replyToMessage).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Resolved);
		});

		test("fails from Archived", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					acknowledgedAt: "2024-01-27 11:10:00",
					mitigatedAt: "2024-01-27 14:50:00",
					resolvedAt: "2024-01-27 14:50:00",
					completedAt: "2024-01-27 14:50:00",
					archivedAt: "2024-01-27 14:50:00",
				}),
			);

			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Archived);

			await incidentUncancel(robot, TEST_ROOM, "sandy");

			expect(robot.adapter.replyToMessage).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Archived);
		});
	});

	describe("incidentRestart", () => {
		test("success with mitigated incident", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					point: "john",
					comms: "sue",
					acknowledgedAt: "2024-01-27 11:10:00",
					mitigatedAt: "2024-01-27 14:50:00",
				}),
			);

			mockFluentDbUpdateOnce(robot, [{ value: "someIncidentId" }]);
			mockFluentDbInsertOnce(robot, []);
			mockFindIncident(
				robot,
				createIncident({
					point: "john",
					comms: "sue",
					acknowledgedAt: "2024-01-27 11:10:00",
				}),
			);

			await incidentRestart(robot, TEST_ROOM, "liam");

			expect(robot.adapter.notifyRestarted).toHaveBeenCalledTimes(1);
			expect(robot.adapter.updateBreakingTopic).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].state()).toBe(
				IncidentState.Acknowledged,
			);
			expect(robot.incidents[TEST_ROOM].data().acknowledgedAt).toBe(
				"2024-01-27 11:10:00",
			);
			expect(robot.incidents[TEST_ROOM].data().mitigatedAt).toBeNull();
			expect(robot.incidents[TEST_ROOM].data().resolvedAt).toBeNull();
		});

		test("success with resolved incident", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					point: "john",
					comms: "sue",
					acknowledgedAt: "2024-01-27 11:10:00",
					mitigatedAt: "2024-01-27 14:50:00",
					resolvedAt: "2024-01-27 17:50:00",
				}),
			);

			mockFluentDbUpdateOnce(robot, [{ value: "someIncidentId" }]);
			mockFluentDbInsertOnce(robot, []);
			mockFindIncident(
				robot,
				createIncident({
					point: "john",
					comms: "sue",
					acknowledgedAt: "2024-01-27 11:10:00",
				}),
			);

			await incidentRestart(robot, TEST_ROOM, "liam");

			expect(robot.adapter.notifyRestarted).toHaveBeenCalledTimes(1);
			expect(robot.adapter.updateBreakingTopic).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].state()).toBe(
				IncidentState.Acknowledged,
			);
			expect(robot.incidents[TEST_ROOM].data().acknowledgedAt).toBe(
				"2024-01-27 11:10:00",
			);
			expect(robot.incidents[TEST_ROOM].data().mitigatedAt).toBeNull();
			expect(robot.incidents[TEST_ROOM].data().resolvedAt).toBeNull();
		});

		test("success with tutorial incident", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					point: "john",
					comms: "sue",
					acknowledgedAt: "2024-01-27 11:10:00",
					mitigatedAt: "2024-01-27 14:50:00",
					resolvedAt: "2024-01-27 17:50:00",
				}),
			);

			robot.incidents[TEST_ROOM].action(NEXT);
			expect(robot.incidents[TEST_ROOM].state()).toBe(TutorialState.Assignee);

			mockFluentDbUpdateOnce(robot, [{ value: "someIncidentId" }]);
			mockFluentDbInsertOnce(robot, []);
			mockFindIncident(
				robot,
				createIncident({
					point: "john",
					comms: "sue",
					acknowledgedAt: "2024-01-27 11:10:00",
				}),
			);

			await incidentRestart(robot, TEST_ROOM, "liam");

			expect(robot.adapter.notifyRestarted).toHaveBeenCalledTimes(1);
			expect(robot.adapter.updateBreakingTopic).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(0);
			expect(robot.incidents[TEST_ROOM].state()).toBe(
				IncidentState.Acknowledged,
			);
			expect(robot.incidents[TEST_ROOM].data().acknowledgedAt).toBe(
				"2024-01-27 11:10:00",
			);
			expect(robot.incidents[TEST_ROOM].data().mitigatedAt).toBeNull();
			expect(robot.incidents[TEST_ROOM].data().resolvedAt).toBeNull();
		});

		test("fails with active, unmitigated incident", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					point: "john",
					comms: "sue",
					acknowledgedAt: "2024-01-27 11:10:00",
				}),
			);

			expect(robot.incidents[TEST_ROOM].state()).toBe(
				IncidentState.Acknowledged,
			);

			await incidentRestart(robot, TEST_ROOM, "liam");

			expect(robot.adapter.notifyRestarted).toHaveBeenCalledTimes(0);
			expect(robot.adapter.updateBreakingTopic).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledWith(
				TEST_ROOM,
				"Unable to restart an active incident!",
				undefined,
			);
			expect(robot.incidents[TEST_ROOM].state()).toBe(
				IncidentState.Acknowledged,
			);
			expect(robot.incidents[TEST_ROOM].data().acknowledgedAt).toBe(
				"2024-01-27 11:10:00",
			);
		});

		test("fails with archived incident", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					point: "john",
					comms: "sue",
					acknowledgedAt: "2024-01-27 11:10:00",
					mitigatedAt: "2024-01-27 14:50:00",
					resolvedAt: "2024-01-27 17:50:00",
					archivedAt: "2024-02-03 22:47:00",
				}),
			);

			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Archived);

			await incidentRestart(robot, TEST_ROOM, "liam");

			expect(robot.adapter.notifyRestarted).toHaveBeenCalledTimes(0);
			expect(robot.adapter.updateBreakingTopic).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledWith(
				TEST_ROOM,
				"Unable to restart incident. Maybe `.start` a new one?",
				undefined,
			);
			expect(robot.incidents[TEST_ROOM].state()).toBe(IncidentState.Archived);
			expect(robot.incidents[TEST_ROOM].data().resolvedAt).toBe(
				"2024-01-27 17:50:00",
			);
			expect(robot.incidents[TEST_ROOM].data().archivedAt).toBe(
				"2024-02-03 22:47:00",
			);
		});
	});

	describe("incidentNotify", () => {
		test("success", async () => {
			mockFluentDbInsertOnce(robot, [createLogEntry()]);
			await incidentNotify(robot, TEST_ROOM, "something happened!", "U123456");
			expect(robot.adapter.reactToMessage).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendCommUpdate).toHaveBeenCalledTimes(1);
			expect(robot.tracker?.syncCommUpdate).toHaveBeenCalledTimes(1);
		});

		test("success low priority", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({ priority: 4 }),
			);

			mockFluentDbInsertOnce(robot, [createLogEntry()]);
			await incidentNotify(robot, TEST_ROOM, "something happened!", "U123456");
			expect(robot.adapter.reactToMessage).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendCommUpdate).toHaveBeenCalledTimes(0);
			expect(robot.tracker?.syncCommUpdate).toHaveBeenCalledTimes(1);
		});

		test("success no tracker", async () => {
			robot.tracker = undefined;
			mockFluentDbInsertOnce(robot, [createLogEntry()]);
			await incidentNotify(robot, TEST_ROOM, "something happened!", "U123456");
			expect(robot.adapter.reactToMessage).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendCommUpdate).toHaveBeenCalledTimes(1);
		});

		test("fails with error if db insert fails", async () => {
			mockFluentDbInsertOnce(robot, []);
			await incidentNotify(robot, TEST_ROOM, "something happened!", "U123456");
			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.adapter.reactToMessage).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendCommUpdate).toHaveBeenCalledTimes(0);
		});
	});

	describe("incidentAddInterestedParty", () => {
		test("success", async () => {
			userCacheMerge(robot.users, {
				chatUserId: "U123456",
				name: "al",
				trackerUserId: "tracker123",
				reporterUserId: "reporter456",
				updatedAt: iso9075Now(),
			});

			await incidentAddInterestedParty(robot, TEST_ROOM, "U123456");
			expect(robot.tracker?.isAlreadyInterestedParty).toHaveBeenCalledTimes(1);
			expect(robot.tracker?.addInterestedParty).toHaveBeenCalledTimes(1);
		});

		test("Not in a breaking room exits", async () => {
			// @ts-expect-error
			robot.incidents["some-other-chan"] = null;
			await incidentAddInterestedParty(robot, "some-other-chan", "U123456");
			expect(robot.tracker?.isAlreadyInterestedParty).toHaveBeenCalledTimes(0);
			expect(robot.tracker?.addInterestedParty).toHaveBeenCalledTimes(0);
		});

		test("No tracker exits", async () => {
			robot.tracker = undefined;
			await incidentAddInterestedParty(robot, TEST_ROOM, "U123456");
			expect(robot.logger.debug).toHaveBeenCalledTimes(0);
		});

		test("No tracker uid exits", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({ trackerUid: null }),
			);

			await incidentAddInterestedParty(robot, TEST_ROOM, "U123456");
			expect(robot.tracker?.isAlreadyInterestedParty).toHaveBeenCalledTimes(0);
			expect(robot.tracker?.addInterestedParty).toHaveBeenCalledTimes(0);
		});

		test("Inactive incident exits", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({ resolvedAt: "2024-02-13 00:45:00" }),
			);

			await incidentAddInterestedParty(robot, TEST_ROOM, "U123456");
			expect(robot.tracker?.isAlreadyInterestedParty).toHaveBeenCalledTimes(0);
			expect(robot.tracker?.addInterestedParty).toHaveBeenCalledTimes(0);
		});

		test("User index miss exits", async () => {
			await incidentAddInterestedParty(robot, TEST_ROOM, "U123456");
			expect(robot.tracker?.isAlreadyInterestedParty).toHaveBeenCalledTimes(0);
			expect(robot.tracker?.addInterestedParty).toHaveBeenCalledTimes(0);
		});

		test("User index hit but no tracker uid exits", async () => {
			userCacheMerge(robot.users, {
				chatUserId: "U123456",
				name: "al",
				trackerUserId: null,
				reporterUserId: null,
				updatedAt: iso9075Now(),
			});

			await incidentAddInterestedParty(robot, TEST_ROOM, "U123456");
			expect(robot.tracker?.isAlreadyInterestedParty).toHaveBeenCalledTimes(0);
			expect(robot.tracker?.addInterestedParty).toHaveBeenCalledTimes(0);
		});

		test("Already interested party exits", async () => {
			userCacheMerge(robot.users, {
				chatUserId: "U123456",
				name: "al",
				trackerUserId: "tracker123",
				reporterUserId: "reporter456",
				updatedAt: iso9075Now(),
			});

			robot.tracker?.isAlreadyInterestedParty.mockReturnValue(true);
			await incidentAddInterestedParty(robot, TEST_ROOM, "U123456");
			expect(robot.tracker?.isAlreadyInterestedParty).toHaveBeenCalledTimes(1);
			expect(robot.tracker?.addInterestedParty).toHaveBeenCalledTimes(0);
		});
	});
});

const newIncidentDbRecord = {
	id: 42,
	title: "Testing...testing!",
	summary: null,
	chatRoomUid: TEST_ROOM,
	trackerUid: null,
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
	completedAt: null,
	archivedAt: null,
	canceledAt: null,
	createdBy: "bob",
	createdAt: "2024-01-19 07:17:00",
	updatedAt: "2024-01-19 07:17:00",
};

const newIncident: Incident = createIncident({
	...newIncidentDbRecord,
	trackerUid: TEST_TRACKER,
});

const setUserCacheEntry = (userCache: UserCache, chatUserId: ChatUserId) => {
	userCacheMerge(userCache, {
		chatUserId,
		name: chatUserId,
		trackerUserId: null,
		reporterUserId: null,
		updatedAt: iso9075Now(),
	});
};
