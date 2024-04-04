import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from "vitest";
import { type DeepMockProxy, mockDeep } from "vitest-mock-extended";
import { mockFluentDbInsertOnce } from "../../../../../test/index.js";
import { iso9075Now } from "../../../../core/date.js";
import { userCacheGet } from "../../../../data/user-cache.js";
import type { BreakingBot } from "../../../../types/index.js";
import { maybeResolveUser } from "../user-identity.js";

describe("user-identity.ts", () => {
	let robot: DeepMockProxy<BreakingBot>;

	const one = {
		chatUserId: "U123",
		trackerUserId: "T123",
		reporterUserId: "R123",
		name: "One",
		updatedAt: "2024-02-29 22:52:00",
	};

	const two = {
		chatUserId: "U456",
		trackerUserId: "T456",
		reporterUserId: "R456",
		name: "Two",
		updatedAt: "2024-03-18 14:21:00",
	};

	const three = {
		chatUserId: "U789",
		trackerUserId: "T789",
		reporterUserId: "R789",
		name: "Three",
		updatedAt: "2024-03-12 06:18:00",
	};

	beforeAll(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2024, 2, 18, 21, 10, 0));
	});

	afterAll(() => {
		vi.useRealTimers();
	});

	beforeEach(() => {
		robot = mockDeep<BreakingBot>();

		// @ts-expect-error
		robot.users = new Map([
			[one.chatUserId, one],
			[two.chatUserId, two],
			[three.chatUserId, three],
		]);
	});

	describe("maybeResolveUser", () => {
		test("happy path cache hit", async () => {
			await maybeResolveUser(robot, two.chatUserId);

			expect(robot.adapter.resolveUser).toHaveBeenCalledTimes(0);
			expect(robot.tracker?.resolveUserId).toHaveBeenCalledTimes(0);
			expect(robot.reporter?.resolveUserId).toHaveBeenCalledTimes(0);
			expect(robot.db.insert).toHaveBeenCalledTimes(0);
			expect(robot.logger.warn).toHaveBeenCalledTimes(0);
		});

		test("happy path refresh", async () => {
			const trackerUserId = "TNEW45";
			robot.adapter.resolveUser.mockResolvedValueOnce({
				name: "Three",
				email: "three@wp.com",
			});
			robot.tracker?.resolveUserId.mockResolvedValueOnce(trackerUserId);
			robot.reporter?.resolveUserId.mockResolvedValueOnce(three.reporterUserId);
			mockFluentDbInsertOnce(robot, []);

			await maybeResolveUser(robot, three.chatUserId);

			// call again, should just hit cache
			await maybeResolveUser(robot, three.chatUserId);

			expect(robot.adapter.resolveUser).toHaveBeenCalledTimes(1);
			expect(robot.tracker?.resolveUserId).toHaveBeenCalledTimes(1);
			expect(robot.reporter?.resolveUserId).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.logger.warn).toHaveBeenCalledTimes(0);

			expect(userCacheGet(robot.users, three.chatUserId)).toStrictEqual({
				...three,
				trackerUserId,
				updatedAt: iso9075Now(),
			});
		});

		test("something goes weird in network requests but we ok", async () => {
			robot.adapter.resolveUser.mockResolvedValueOnce({ name: null });
			robot.tracker?.resolveUserId.mockResolvedValueOnce(null);
			robot.reporter?.resolveUserId.mockResolvedValueOnce(null);
			mockFluentDbInsertOnce(robot, []);

			await maybeResolveUser(robot, one.chatUserId);

			// call again, should just hit cache
			await maybeResolveUser(robot, one.chatUserId);

			expect(robot.adapter.resolveUser).toHaveBeenCalledTimes(1);
			expect(robot.tracker?.resolveUserId).toHaveBeenCalledTimes(1);
			expect(robot.reporter?.resolveUserId).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.logger.warn).toHaveBeenCalledTimes(3);

			expect(userCacheGet(robot.users, one.chatUserId)).toStrictEqual({
				...one,
				updatedAt: iso9075Now(),
			});
		});

		test("user doesn't resolve anywhere", async () => {
			robot.adapter.resolveUser.mockResolvedValueOnce({ name: "Not Sure" });
			robot.tracker?.resolveUserId.mockResolvedValueOnce(null);
			robot.reporter?.resolveUserId.mockResolvedValueOnce(null);
			mockFluentDbInsertOnce(robot, []);

			await maybeResolveUser(robot, "someoneelse");

			// call again, should just hit cache
			await maybeResolveUser(robot, "someoneelse");

			expect(robot.adapter.resolveUser).toHaveBeenCalledTimes(1);
			expect(robot.tracker?.resolveUserId).toHaveBeenCalledTimes(1);
			expect(robot.reporter?.resolveUserId).toHaveBeenCalledTimes(1);
			expect(robot.db.insert).toHaveBeenCalledTimes(1);
			expect(robot.logger.warn).toHaveBeenCalledTimes(3);

			expect(userCacheGet(robot.users, "someoneelse")).toStrictEqual({
				chatUserId: "someoneelse",
				reporterUserId: null,
				trackerUserId: null,
				name: "Not Sure",
				updatedAt: iso9075Now(),
			});
		});
	});
});
