import { beforeEach, describe, expect, test } from "vitest";
import { type DeepMockProxy, mockDeep } from "vitest-mock-extended";
import { config } from "../../../../../config/index.js";
import {
	TEST_ROOM,
	createIncident,
	createLogEntry,
	mockFluentDbInsertOnce,
} from "../../../../../test/index.js";
import { newIncidentMachine } from "../../../../core/fsm.js";
import type { BreakingBot } from "../../../../types/index.js";
import {
	logAddActionItem,
	logAddFactor,
	logAddNote,
	logAddPr,
} from "../log.js";

describe("log.ts", () => {
	let robot: DeepMockProxy<BreakingBot>;

	beforeEach(() => {
		robot = mockDeep<BreakingBot>();
		// @ts-expect-error
		robot.config = { ...config };
		// @ts-expect-error
		robot.incidents[TEST_ROOM] = newIncidentMachine(createIncident());
	});

	describe("logAddActionItem", () => {
		test("add ai", async () => {
			const entry = createLogEntry({
				createdAt: "2024-01-29 10:18:00",
				createdBy: "susan",
				text: "we need todo something about this other thing",
				contextUrl: "https://somejira.com/BREAKING-3483",
			});

			robot.tracker?.newActionItem.mockResolvedValue([
				"BREAKING-3483",
				"https://somejira/BREAKING-3483",
			]);

			mockFluentDbInsertOnce(robot, [entry]);

			await logAddActionItem(
				robot,
				TEST_ROOM,
				entry.text,
				entry.createdBy,
				"m256",
			);

			expect(robot.adapter.sendAddedActionItem).toHaveBeenCalledTimes(1);
			expect(robot.adapter.getPermalink).toHaveBeenCalledTimes(1);
			expect(robot.tracker?.newActionItem).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
		});

		test("add ai no message id", async () => {
			const entry = createLogEntry({
				createdAt: "2024-01-29 10:18:00",
				createdBy: "susan",
				text: "we need todo something about this other thing",
				contextUrl: "https://somejira.com/BREAKING-3483",
			});

			robot.tracker?.newActionItem.mockResolvedValue([
				"BREAKING-3483",
				"https://somejira/BREAKING-3483",
			]);

			mockFluentDbInsertOnce(robot, [entry]);

			await logAddActionItem(robot, TEST_ROOM, entry.text, entry.createdBy);

			expect(robot.adapter.sendAddedActionItem).toHaveBeenCalledTimes(1);
			expect(robot.adapter.getPermalink).toHaveBeenCalledTimes(0);
			expect(robot.tracker?.newActionItem).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
		});

		test("add ai no tracker", async () => {
			const entry = createLogEntry({
				createdAt: "2024-01-29 10:18:00",
				createdBy: "susan",
				text: "we need todo something about this other thing",
			});

			robot.tracker = undefined;

			mockFluentDbInsertOnce(robot, [entry]);

			await logAddActionItem(
				robot,
				TEST_ROOM,
				entry.text,
				entry.createdBy,
				"m839",
			);

			expect(robot.adapter.getPermalink).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendAddedActionItem).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
		});

		test("fails if db insert fails", async () => {
			robot.tracker = undefined;
			mockFluentDbInsertOnce(robot, []);

			await logAddActionItem(robot, TEST_ROOM, "whateva", "tommy", "m256");

			expect(robot.adapter.sendAddedActionItem).toHaveBeenCalledTimes(0);
			expect(robot.adapter.getPermalink).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledWith(
				TEST_ROOM,
				"DB write failed!",
				"m256",
			);
		});
	});

	describe("logAddFactor", () => {
		test("add factor url", async () => {
			const entry = createLogEntry({
				createdAt: "2024-01-30 13:49:00",
				createdBy: "walter",
				text: "https://tumblr.com/okengineer",
			});

			const entryWithResolvedUrl = {
				...entry,
				contextUrl: "https://tumblr.com/okengineer",
			};

			mockFluentDbInsertOnce(robot, [entryWithResolvedUrl]);

			await logAddFactor(robot, TEST_ROOM, entry.text, entry.createdBy, "m256");

			expect(robot.adapter.sendAddedFactor).toHaveBeenCalled();
			expect(robot.adapter.getPermalink).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
		});

		test("add factor text", async () => {
			const entry = createLogEntry({
				createdAt: "2024-01-30 13:49:00",
				createdBy: "walter",
				text: "we need todo something something more for sure",
			});

			mockFluentDbInsertOnce(robot, [entry]);

			await logAddFactor(robot, TEST_ROOM, entry.text, entry.createdBy);

			expect(robot.adapter.sendAddedFactor).toHaveBeenCalled();
			expect(robot.adapter.getPermalink).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
		});

		test("add factor text with permalink", async () => {
			const entry = createLogEntry({
				createdAt: "2024-01-30 13:49:00",
				createdBy: "walter",
				text: "we need todo something something more for sure",
			});

			const entryWithResolvedUrl = {
				...entry,
				contextUrl: "https://chat/permalink",
			};

			robot.adapter.getPermalink.mockResolvedValue("https://chat/permalink");

			mockFluentDbInsertOnce(robot, [entryWithResolvedUrl]);

			await logAddFactor(robot, TEST_ROOM, entry.text, entry.createdBy, "m256");

			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendAddedFactor).toHaveBeenCalledWith(
				TEST_ROOM,
				entryWithResolvedUrl,
				"m256",
			);
		});

		test("fails if db insert fails", async () => {
			mockFluentDbInsertOnce(robot, []);

			await logAddFactor(robot, TEST_ROOM, "whateva", "walter");

			expect(robot.adapter.sendAddedFactor).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledWith(
				TEST_ROOM,
				"DB write failed!",
				undefined,
			);
		});
	});

	describe("logAddPr", () => {
		test("add pr url", async () => {
			const entry = createLogEntry({
				createdAt: "2024-01-31 11:12:00",
				createdBy: "josh",
				text: "https://wp.com/123",
			});

			const entryWithResolvedUrl = {
				...entry,
				contextUrl: "https://wp.com/123",
			};

			mockFluentDbInsertOnce(robot, [entryWithResolvedUrl]);

			await logAddPr(robot, TEST_ROOM, entry.text, entry.createdBy, "m256");

			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendAddedPr).toHaveBeenCalledWith(
				TEST_ROOM,
				entryWithResolvedUrl,
				"m256",
			);
		});

		test("fails if not a url", async () => {
			await logAddPr(robot, TEST_ROOM, "whatever", "josh");

			expect(robot.adapter.reactToMessage).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendAddedPr).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
		});

		test("fails if db insert fails", async () => {
			mockFluentDbInsertOnce(robot, []);

			await logAddPr(robot, TEST_ROOM, "https://wp.com/123", "josh");

			expect(robot.adapter.sendAddedPr).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendError).toHaveBeenCalledWith(
				TEST_ROOM,
				"DB write failed!",
				undefined,
			);
		});
	});

	describe("logAddNote", () => {
		test("success", async () => {
			const entry = createLogEntry({
				createdAt: "2024-02-01 11:00:00",
				createdBy: "kelly",
				text: "Some, some, cool. https://wp.com/123",
			});

			mockFluentDbInsertOnce(robot, [entry]);

			await logAddNote(robot, TEST_ROOM, entry.text, entry.createdBy, "m256");

			expect(robot.adapter.replyToMessage).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
		});

		test("fails if db insert fails", async () => {
			mockFluentDbInsertOnce(robot, []);

			await logAddNote(robot, TEST_ROOM, "whatever", "kelly");

			expect(robot.adapter.replyToMessage).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendError).toHaveBeenCalledWith(
				TEST_ROOM,
				"DB write failed!",
				undefined,
			);
		});
	});
});
