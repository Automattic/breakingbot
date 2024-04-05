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
import { addAffected, removeAffected } from "../affected.js";

describe("affected.ts", () => {
	let robot: DeepMockProxy<BreakingBot>;

	beforeEach(() => {
		robot = mockDeep<BreakingBot>();
		// @ts-expect-error
		robot.config = { ...config };
		// @ts-expect-error
		robot.incidents[TEST_ROOM] = newIncidentMachine(createIncident());
	});

	describe("addAffected", () => {
		test("add single affected", async () => {
			const added = [{ incidentId: 42, what: "nasa" }];
			mockFluentDbInsertOnce(robot, added);

			await addAffected(robot, TEST_ROOM, "nasa");

			expect(robot.adapter.reactToMessage).toHaveBeenCalledWith(
				TEST_ROOM,
				"ok_hand",
				undefined,
			);
			expect(robot.adapter.sendAffectedAddedMessage).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().affected).toStrictEqual(added);
		});

		test("add multiple affected", async () => {
			const added = [
				{ incidentId: 42, what: "fairchild" },
				{ incidentId: 42, what: "gmc" },
				{ incidentId: 42, what: "lockheed" },
				{ incidentId: 42, what: "nasa" },
			];

			mockFluentDbInsertOnce(robot, added);

			await addAffected(robot, TEST_ROOM, "nasa,lockheed, gmc,  fairchild");

			expect(robot.adapter.reactToMessage).toHaveBeenCalledWith(
				TEST_ROOM,
				"ok_hand",
				undefined,
			);

			expect(robot.adapter.sendAffectedAddedMessage).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.incidents[TEST_ROOM].data().affected).toStrictEqual(added);
		});
	});

	describe("removeAffected", () => {
		test("remove affected", async () => {
			// @ts-expect-error
			robot.incidents.yet_another = newIncidentMachine(
				createIncident({
					id: 9,
					affected: [
						{ incidentId: 9, what: "braves" },
						{ incidentId: 9, what: "guardians" },
						{ incidentId: 9, what: "royals" },
					],
				}),
			);

			mockFluentDbDeleteOnce(robot, [{ affected: "guardians" }]);

			await removeAffected(robot, "yet_another", "guardians");

			expect(robot.adapter.reactToMessage).toHaveBeenCalledWith(
				"yet_another",
				"ok_hand",
				undefined,
			);

			expect(robot.db.delete).toHaveBeenCalledTimes(1);

			expect(robot.incidents.yet_another.data().affected).toStrictEqual([
				{ incidentId: 9, what: "braves" },
				{ incidentId: 9, what: "royals" },
			]);
		});

		test("remove nonexistent affected noops and errors", async () => {
			// @ts-expect-error
			robot.incidents.yet_another = newIncidentMachine(
				createIncident({
					id: 9,
					affected: [
						{ incidentId: 9, what: "braves" },
						{ incidentId: 9, what: "guardians" },
						{ incidentId: 9, what: "royals" },
					],
				}),
			);

			mockFluentDbDeleteOnce(robot, []);

			await removeAffected(robot, "yet_another", "giants");

			expect(robot.adapter.sendError).toHaveBeenCalledTimes(1);
			expect(robot.db.delete).toHaveBeenCalledTimes(1);

			expect(robot.incidents.yet_another.data().affected).toStrictEqual([
				{ incidentId: 9, what: "braves" },
				{ incidentId: 9, what: "guardians" },
				{ incidentId: 9, what: "royals" },
			]);
		});
	});
});
