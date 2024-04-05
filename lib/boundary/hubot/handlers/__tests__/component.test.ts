import { beforeEach, describe, expect, test } from "vitest";
import { type DeepMockProxy, mockDeep } from "vitest-mock-extended";
import { config } from "../../../../../config/index.js";
import {
	TEST_ROOM,
	createIncident,
	mockFluentDbDeleteOnce,
	mockFluentDbInsertOnce,
} from "../../../../../test/index.js";
import { newIncidentMachine } from "../../../../core/fsm.js";
import type { BreakingBot } from "../../../../types/index.js";
import { addComponent, removeComponent } from "../component.js";

describe("component.ts", () => {
	let robot: DeepMockProxy<BreakingBot>;

	beforeEach(() => {
		robot = mockDeep<BreakingBot>();
		// @ts-expect-error
		robot.config = { ...config };
		// @ts-expect-error
		robot.incidents[TEST_ROOM] = newIncidentMachine(createIncident());
	});

	describe("addComponent", () => {
		test("add single component", async () => {
			const added = [{ incidentId: 42, which: "apple" }];
			mockFluentDbInsertOnce(robot, added);

			await addComponent(robot, TEST_ROOM, "apple");

			expect(robot.adapter.reactToMessage).toHaveBeenCalledWith(
				TEST_ROOM,
				"ok_hand",
				undefined,
			);
			expect(robot.adapter.sendComponentsAdded).toHaveBeenCalledTimes(0);
			expect(robot.tracker?.syncComponents).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().components).toStrictEqual(added);
		});

		test("add multiple components", async () => {
			const added = [
				{ incidentId: 42, which: "apple" },
				{ incidentId: 42, which: "orange" },
				{ incidentId: 42, which: "pair" },
				{ incidentId: 42, which: "plum" },
			];

			mockFluentDbInsertOnce(robot, added);

			await addComponent(robot, TEST_ROOM, "orange,apple, pair,  plum");

			expect(robot.adapter.reactToMessage).toHaveBeenCalledWith(
				TEST_ROOM,
				"ok_hand",
				undefined,
			);
			expect(robot.adapter.sendComponentsAdded).toHaveBeenCalledTimes(0);
			expect(robot.tracker?.syncComponents).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().components).toStrictEqual(added);
		});

		test("add multiple components with validation", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					id: 7,
					components: [{ incidentId: 7, which: "plum" }],
				}),
			);

			robot.config = { ...robot.config, issueTrackerStrictComponents: true };
			robot.tracker?.validComponentNames.mockResolvedValue([
				"plum",
				"pair",
				"orange",
			]);

			const added = [
				{ incidentId: 7, which: "orange" },
				{ incidentId: 7, which: "pair" },
			];

			mockFluentDbInsertOnce(robot, added);

			await addComponent(robot, TEST_ROOM, "orange,apple, pair, pair,plum");

			expect(robot.adapter.reactToMessage).toHaveBeenCalledWith(
				TEST_ROOM,
				"exclamation",
				undefined,
			);
			expect(robot.adapter.sendComponentsAdded).toHaveBeenCalledWith(
				TEST_ROOM,
				["orange", "pair"],
				["plum"],
				["apple"],
				undefined,
			);
			expect(robot.tracker?.syncComponents).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().components).toStrictEqual([
				{ incidentId: 7, which: "orange" },
				{ incidentId: 7, which: "pair" },
				{ incidentId: 7, which: "plum" },
			]);
		});

		test("add dupe components quietly succeeds", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					id: 17,
					components: [
						{ incidentId: 17, which: "orange" },
						{ incidentId: 17, which: "pair" },
						{ incidentId: 17, which: "plum" },
					],
				}),
			);

			mockFluentDbInsertOnce(robot, []);

			await addComponent(robot, TEST_ROOM, "pair, plum");

			expect(robot.adapter.reactToMessage).toHaveBeenCalledWith(
				TEST_ROOM,
				"ok_hand",
				undefined,
			);
			expect(robot.adapter.sendComponentsAdded).toHaveBeenCalledTimes(0);
			expect(robot.tracker?.syncComponents).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().components).toStrictEqual([
				{ incidentId: 17, which: "orange" },
				{ incidentId: 17, which: "pair" },
				{ incidentId: 17, which: "plum" },
			]);
		});
	});

	describe("removeComponent", () => {
		test("remove component", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					id: 9,
					components: [
						{ incidentId: 9, which: "apple" },
						{ incidentId: 9, which: "banana" },
						{ incidentId: 9, which: "plum" },
					],
				}),
			);

			mockFluentDbDeleteOnce(robot, [{ component: "banana" }]);

			await removeComponent(robot, TEST_ROOM, "banana");

			expect(robot.adapter.reactToMessage).toHaveBeenCalledWith(
				TEST_ROOM,
				"ok_hand",
				undefined,
			);
			expect(robot.db.delete).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().components).toStrictEqual([
				{ incidentId: 9, which: "apple" },
				{ incidentId: 9, which: "plum" },
			]);
			expect(robot.tracker?.syncComponents).toHaveBeenCalledTimes(1);
		});

		test("remove nonexistent component noops and errors", async () => {
			// @ts-expect-error
			robot.incidents[TEST_ROOM] = newIncidentMachine(
				createIncident({
					id: 9,
					components: [
						{ incidentId: 9, which: "apple" },
						{ incidentId: 9, which: "banana" },
						{ incidentId: 9, which: "plum" },
					],
				}),
			);

			mockFluentDbDeleteOnce(robot, []);

			await removeComponent(robot, TEST_ROOM, "grape");

			expect(robot.adapter.reactToMessage).toHaveBeenCalledWith(
				TEST_ROOM,
				"exclamation",
				undefined,
			);
			expect(robot.db.delete).toHaveBeenCalledTimes(1);
			expect(robot.adapter.replyToMessage).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().components).toStrictEqual([
				{ incidentId: 9, which: "apple" },
				{ incidentId: 9, which: "banana" },
				{ incidentId: 9, which: "plum" },
			]);
			expect(robot.tracker?.syncComponents).toHaveBeenCalledTimes(0);
		});
	});
});
