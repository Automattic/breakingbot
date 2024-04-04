import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import type { BreakingBotDb } from "../../types/index.js";
import {
	initUserCache,
	isUserEntryFreshish,
	userCacheGet,
	userCacheMerge,
} from "../user-cache.js";

describe("user-cache.ts", () => {
	beforeAll(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2024, 1, 13, 22, 20, 0));
	});

	afterAll(() => {
		vi.useRealTimers();
	});

	describe("userCacheMerge", () => {
		test("add a new user entry to the user index", () => {
			const userMap = new Map();
			userCacheMerge(userMap, {
				chatUserId: "U489BC342",
				trackerUserId: "38daxksenk3p50",
				reporterUserId: "spiffyspaceman",
				name: "Neil Armstrong",
				updatedAt: "2024-02-13 22:20:00",
			});

			expect(userMap.get("U489BC342")).toStrictEqual({
				chatUserId: "U489BC342",
				trackerUserId: "38daxksenk3p50",
				reporterUserId: "spiffyspaceman",
				name: "Neil Armstrong",
				updatedAt: "2024-02-13 22:20:00",
			});
		});

		test("add a new user entry with an optional trackerUserId", () => {
			const userMap = new Map();
			userCacheMerge(userMap, {
				chatUserId: "U489BC342",
				trackerUserId: "tracker-id-123",
				reporterUserId: null,
				name: "user2",
				updatedAt: "2024-02-13 22:20:00",
			});

			expect(userMap.get("U489BC342")).toStrictEqual({
				chatUserId: "U489BC342",
				trackerUserId: "tracker-id-123",
				reporterUserId: null,
				name: "user2",
				updatedAt: "2024-02-13 22:20:00",
			});
		});

		test("add a new user entry with an optional reporterUserId", () => {
			const userMap = new Map();
			userCacheMerge(userMap, {
				chatUserId: "U489BC342",
				trackerUserId: null,
				reporterUserId: "reporter-id-123",
				name: "user2",
				updatedAt: "2024-02-13 22:20:00",
			});

			expect(userMap.get("U489BC342")).toStrictEqual({
				chatUserId: "U489BC342",
				trackerUserId: null,
				reporterUserId: "reporter-id-123",
				name: "user2",
				updatedAt: "2024-02-13 22:20:00",
			});
		});

		test("data can be updated", () => {
			const userMap = new Map();

			userCacheMerge(userMap, {
				chatUserId: "U489BC342",
				trackerUserId: "tracker-id-123",
				reporterUserId: null,
				name: "user0",
				updatedAt: "2024-02-12 23:47:00",
			});

			userCacheMerge(userMap, {
				chatUserId: "U489BC342",
				trackerUserId: "tracker-id-456",
				reporterUserId: "reporter-id-876",
				name: "user1",
				updatedAt: "2024-02-13 22:20:00",
			});

			expect(userMap.get("U489BC342")).toStrictEqual({
				chatUserId: "U489BC342",
				trackerUserId: "tracker-id-456",
				reporterUserId: "reporter-id-876",
				name: "user1",
				updatedAt: "2024-02-13 22:20:00",
			});
		});

		test("previous data stays if update is nully", () => {
			const userMap = new Map();

			userCacheMerge(userMap, {
				chatUserId: "U489BC342",
				trackerUserId: "tracker-id-123",
				reporterUserId: "reporter-id-123",
				name: "user1",
				updatedAt: "2024-02-12 23:47:00",
			});

			userCacheMerge(userMap, {
				chatUserId: "U489BC342",
				trackerUserId: null,
				reporterUserId: null,
				name: null,
				updatedAt: "2024-02-13 22:20:00",
			});

			expect(userMap.get("U489BC342")).toStrictEqual({
				chatUserId: "U489BC342",
				trackerUserId: "tracker-id-123",
				reporterUserId: "reporter-id-123",
				name: "user1",
				updatedAt: "2024-02-13 22:20:00",
			});
		});
	});

	describe("userCacheGet", () => {
		test("return the user entry if it exists in the index", () => {
			const userMap = new Map();

			userMap.set("user1", {
				trackerUserId: null,
				reporterUserId: null,
				name: "user1",
				updatedAt: "2024-02-13 22:20:00",
			});

			expect(userCacheGet(userMap, "user1")).toStrictEqual({
				trackerUserId: null,
				reporterUserId: null,
				name: "user1",
				updatedAt: "2024-02-13 22:20:00",
			});
		});

		test("return null if the user does not exist in the index", () => {
			expect(userCacheGet(new Map(), "nonExistingUser")).toBeNull();
		});
	});

	test("initUserCache", async () => {
		const db = mock<BreakingBotDb>();

		const one = {
			chatUserId: "U123",
			trackerUserId: "T123",
			reporterUserId: "R123",
			name: "One",
			updatedAt: "2024-03-18 14:21:00",
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
			updatedAt: "2024-03-18 14:21:00",
		};

		// @ts-expect-error
		db.select.mockReturnValueOnce({
			from: vi.fn().mockResolvedValue([one, two, three]),
		});

		expect(await initUserCache(db)).toStrictEqual(
			new Map([
				[one.chatUserId, one],
				[two.chatUserId, two],
				[three.chatUserId, three],
			]),
		);
	});

	describe("isUserEntryFreshish", () => {
		const duration = 72 * 60 * 60; // seconds

		test("true if within freshish duration", () => {
			const userMap = new Map();

			userMap.set("user1", {
				trackerUserId: null,
				reporterUserId: null,
				name: "user1",
				updatedAt: "2024-02-12 22:20:00",
			});

			expect(isUserEntryFreshish(userMap, duration, "user1")).toBe(true);
		});

		test("null adds can be freshish", () => {
			const userMap = new Map();
			userCacheMerge(userMap, {
				chatUserId: "U489BC342",
				trackerUserId: null,
				reporterUserId: null,
				name: null,
				updatedAt: "2024-02-13 22:20:00",
			});
			expect(isUserEntryFreshish(userMap, duration, "U489BC342")).toBe(true);
		});

		test("false if outside freshish duration", () => {
			const userMap = new Map();

			userMap.set("user1", {
				trackerUserId: null,
				reporterUserId: null,
				name: "user1",
				updatedAt: "2024-02-09 22:20:00",
			});

			expect(isUserEntryFreshish(userMap, duration, "user1")).toBe(false);
		});

		test("false if index miss", () => {
			expect(isUserEntryFreshish(new Map(), duration, "user1")).toBe(false);
		});
	});
});
