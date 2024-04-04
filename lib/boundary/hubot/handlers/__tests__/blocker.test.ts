import { beforeEach, describe, expect, test } from "vitest";
import { type DeepMockProxy, mockDeep } from "vitest-mock-extended";
import { testConfig } from "../../../../../config/test.js";
import {
	TEST_ROOM,
	createBlocker,
	createIncident,
	mockFluentDbInsertOnce,
	mockFluentDbUpdateOnce,
} from "../../../../../test/index.js";
import { newIncidentMachine } from "../../../../core/fsm.js";
import type { BreakingBot } from "../../../../types/index.js";
import { addBlocker, removeAllBlockers, removeBlocker } from "../blocker.js";

describe("blocker.ts", () => {
	let robot: DeepMockProxy<BreakingBot>;

	beforeEach(() => {
		robot = mockDeep<BreakingBot>();
		// @ts-expect-error
		robot.config = { ...testConfig };
		// @ts-expect-error
		robot.incidents[TEST_ROOM] = newIncidentMachine(createIncident());
	});

	describe("addBlocker", () => {
		test("success", async () => {
			const blocker = createBlocker({
				whomst: "tumblr",
				reason: "roflcopters",
			});

			mockFluentDbInsertOnce(robot, [blocker]);

			await addBlocker(robot, TEST_ROOM, "tumblr", "roflcopters", "janet");

			expect(robot.adapter.sendBlockerAddedMessage).toHaveBeenCalledTimes(1);
			expect(robot.adapter.updateBreakingTopic).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(2);
			expect(robot.incidents[TEST_ROOM].data().blockers).toStrictEqual([
				blocker,
			]);
		});

		test("success with blocker already there", async () => {
			const incident = robot.incidents[TEST_ROOM].data();

			const one = createBlocker({ id: 9 });
			const two = createBlocker({ id: 10 });

			incident.blockers = [one];

			mockFluentDbInsertOnce(robot, [two]);

			await addBlocker(robot, TEST_ROOM, "someone", "", "janet");

			expect(robot.adapter.sendBlockerAddedMessage).toHaveBeenCalledTimes(1);
			expect(robot.adapter.updateBreakingTopic).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(2);
			expect(incident.blockers).toStrictEqual([one, two]);
		});

		test("fails if db insert fails", async () => {
			mockFluentDbInsertOnce(robot, []);

			await addBlocker(robot, TEST_ROOM, "tumblr", "roflcopters", "janet");

			expect(robot.adapter.sendError).toHaveBeenCalledWith(
				TEST_ROOM,
				"DB write failed!",
				undefined,
			);
			expect(robot.adapter.sendBlockerAddedMessage).toHaveBeenCalledTimes(0);
			expect(robot.adapter.updateBreakingTopic).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().blockers).toStrictEqual([]);
		});
	});

	describe("removeBlocker", () => {
		test("remove blocker", async () => {
			const incident = robot.incidents[TEST_ROOM].data();

			const one = createBlocker({ id: 9 });
			const two = createBlocker({ id: 10 });
			const three = createBlocker({ id: 14 });

			incident.blockers = [one, two, three];

			mockFluentDbUpdateOnce(robot, [two]);
			mockFluentDbInsertOnce(robot, []);

			await removeBlocker(robot, TEST_ROOM, 10, "janet");

			expect(robot.adapter.reactToMessage).toHaveBeenCalledWith(
				TEST_ROOM,
				"ok_hand",
				undefined,
			);

			expect(robot.adapter.updateBreakingTopic).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(incident.blockers).toStrictEqual([one, three]);
		});

		test("remove last blocker", async () => {
			const incident = robot.incidents[TEST_ROOM].data();

			const one = createBlocker({ id: 9 });

			incident.blockers = [one];

			mockFluentDbUpdateOnce(robot, [one]);
			mockFluentDbInsertOnce(robot, []);

			await removeBlocker(robot, TEST_ROOM, 9, "janet");

			expect(robot.adapter.reactToMessage).toHaveBeenCalledWith(
				TEST_ROOM,
				"ok_hand",
				undefined,
			);

			expect(robot.adapter.updateBreakingTopic).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(incident.blockers).toStrictEqual([]);
		});

		test("remove nonexistent blocker noops and errors", async () => {
			const incident = robot.incidents[TEST_ROOM].data();

			const one = createBlocker({ id: 9 });
			const two = createBlocker({ id: 10 });
			const three = createBlocker({ id: 14 });

			incident.blockers = [one, two, three];

			mockFluentDbUpdateOnce(robot, []);

			await removeBlocker(robot, TEST_ROOM, 11, "janet");

			expect(robot.adapter.sendError).toHaveBeenCalledWith(
				TEST_ROOM,
				"Unable to remove blocker with that id. Maybe it's not a `.blockers`?",
				undefined,
			);

			expect(robot.adapter.updateBreakingTopic).toHaveBeenCalledTimes(0);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(incident.blockers).toStrictEqual([one, two, three]);
		});
	});

	describe("removeAllBlockers", () => {
		test("success", async () => {
			const incident = robot.incidents[TEST_ROOM].data();

			const one = createBlocker({ id: 9 });
			const two = createBlocker({ id: 10 });
			const three = createBlocker({ id: 14 });

			incident.blockers = [one, two, three];

			mockFluentDbUpdateOnce(robot, []);
			mockFluentDbInsertOnce(robot, []);

			await removeAllBlockers(robot, TEST_ROOM, "janet");

			expect(robot.adapter.reactToMessage).toHaveBeenCalledWith(
				TEST_ROOM,
				"ok_hand",
				undefined,
			);

			expect(robot.adapter.updateBreakingTopic).toHaveBeenCalledTimes(1);
			expect(robot.db.update).toHaveBeenCalledTimes(1);
			expect(incident.blockers).toStrictEqual([]);
		});
	});
});
