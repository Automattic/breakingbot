import { describe, expect, test } from "vitest";
import { config } from "../../../config/index.js";
import { LogType } from "../../data/schema/log-entry-schema.js";
import {
	type UserEntry,
	userCacheGet,
	userCacheMerge,
} from "../../data/user-cache.js";
import type { ChatUserId } from "../../types/index.js";
import { iso9075Now } from "../date.js";
import {
	isNonEmptyString,
	isString,
	logTextPrefix,
	normalizeUserId,
	pluralize,
	resolveChatUserIds,
	sortAryOfObjByStringAttribute,
	stringSplitCommaToArray,
	titleCase,
	unEscUrl,
} from "../string.js";

describe("string.ts", () => {
	describe("stringSplitCommaToArray", () => {
		test("splits a standard comma separated string into an array", () => {
			const result = stringSplitCommaToArray("apple, banana, orange");
			expect(result).toEqual(["apple", "banana", "orange"]);
		});

		test("trims whitespace from the splitted elements", () => {
			const result = stringSplitCommaToArray("  apple ,banana ,   orange  ");
			expect(result).toEqual(["apple", "banana", "orange"]);
		});

		test("filters out empty strings", () => {
			const result = stringSplitCommaToArray("apple,, banana, , orange,,");
			expect(result).toEqual(["apple", "banana", "orange"]);
		});

		test("returns an empty array if the input string is empty", () => {
			const result = stringSplitCommaToArray("");
			expect(result).toEqual([]);
		});

		test("returns an array with a single element if there are no commas", () => {
			const result = stringSplitCommaToArray("apple");
			expect(result).toEqual(["apple"]);
		});

		test("handles strings with only commas and whitespace", () => {
			const result = stringSplitCommaToArray(" , , ");
			expect(result).toEqual([]);
		});
	});

	describe("titleCase", () => {
		test("converts a lowercase sentence into title case", () => {
			const result = titleCase("hello world");
			expect(result).toEqual("Hello World");
		});

		test("converts a mixed case sentence into title case", () => {
			const result = titleCase("hElLo WoRlD");
			expect(result).toEqual("Hello World");
		});

		test("handles an all uppercase sentence", () => {
			const result = titleCase("HELLO WORLD");
			expect(result).toEqual("Hello World");
		});

		test("returns an empty string if the input string is empty", () => {
			const result = titleCase("");
			expect(result).toEqual("");
		});

		test("handles a single word", () => {
			const result = titleCase("word");
			expect(result).toEqual("Word");
		});

		test("ignores extra spaces between words", () => {
			const result = titleCase("  hello    world  ");
			expect(result).toEqual("  Hello    World  ");
		});

		test("handles punctuation correctly", () => {
			const result = titleCase("hello, world!");
			expect(result).toEqual("Hello, World!");
		});

		test("handles hyphenated words correctly [Chicago Style]", () => {
			const result = titleCase(
				"the long-term results of low-emission vehicles",
			);
			expect(result).toEqual("The Long-term Results Of Low-emission Vehicles");
		});
	});

	describe("sortAryOfObjByStringAttribute", () => {
		interface Person {
			name: string;
			age: number;
		}

		test("sorts an array of objects by string attribute", () => {
			const people = [
				{ name: "Bob", age: 25 },
				{ name: "Alice", age: 30 },
				{ name: "Charlie", age: 35 },
			];
			const sorted = sortAryOfObjByStringAttribute(people, "name");
			expect(sorted).toEqual([
				{ name: "Alice", age: 30 },
				{ name: "Bob", age: 25 },
				{ name: "Charlie", age: 35 },
			]);
		});

		test("handles different cases and sorts case-insensitively", () => {
			const people: Person[] = [
				{ name: "Bob", age: 25 },
				{ name: "charlie", age: 35 },
				{ name: "alice", age: 30 },
			];
			const sorted = sortAryOfObjByStringAttribute(people, "name");
			expect(sorted).toEqual([
				{ name: "alice", age: 30 },
				{ name: "Bob", age: 25 },
				{ name: "charlie", age: 35 },
			]);
		});

		test("does not modify array with equal keys", () => {
			const people: Person[] = [
				{ name: "Bob", age: 30 },
				{ name: "Bob", age: 25 },
			];
			const sorted = sortAryOfObjByStringAttribute(people, "name");
			expect(sorted).toEqual([
				{ name: "Bob", age: 30 },
				{ name: "Bob", age: 25 },
			]);
		});

		test("returns an empty array when given an empty array", () => {
			const people: Person[] = [];
			const sorted = sortAryOfObjByStringAttribute(people, "name");
			expect(sorted).toEqual([]);
		});

		test("is stable for objects with equal keys", () => {
			const people: Person[] = [
				{ name: "Chris", age: 22 },
				{ name: "Andy", age: 30 },
				{ name: "Andy", age: 25 },
			];
			const sorted = sortAryOfObjByStringAttribute(people, "name");

			// The object with name 'Andy' and age 30 should come before the one with age 25
			expect(sorted).toStrictEqual([
				{ name: "Andy", age: 30 },
				{ name: "Andy", age: 25 },
				{ name: "Chris", age: 22 },
			]);
		});
	});

	describe("isString", () => {
		test("true for a string literal", () => {
			expect(isString("Hello, world!")).toBe(true);
		});

		test("false for a number", () => {
			expect(isString(42)).toBe(false);
		});

		test("false for an array", () => {
			expect(isString(["a", "b", "c"])).toBe(false);
		});

		test("false for an object", () => {
			expect(isString({ key: "value" })).toBe(false);
		});

		test("false for null", () => {
			expect(isString(null)).toBe(false);
		});

		test("false for undefined", () => {
			expect(isString(undefined)).toBe(false);
		});

		test("false for boolean", () => {
			expect(isString(true)).toBe(false);
			expect(isString(false)).toBe(false);
		});

		test("false for a function", () => {
			expect(isString(() => ({}))).toBe(false);
		});

		test("false for a number object", () => {
			expect(isString(new Number(42))).toBe(false);
		});

		test("false for a Date object", () => {
			expect(isString(new Date())).toBe(false);
		});
	});

	describe("isNonEmptyString", () => {
		test("true for a string literal", () => {
			expect(isNonEmptyString("Hello, world!")).toBe(true);
		});

		test("false for an empty string", () => {
			expect(isNonEmptyString("")).toBe(false);
		});

		test("false for an string with just whitespace", () => {
			expect(isNonEmptyString("   ")).toBe(false);
		});

		test("false for an string with just tab", () => {
			expect(isNonEmptyString("	")).toBe(false);
		});

		test("false for an string with whitespaces and tabs", () => {
			expect(isNonEmptyString(" 	   	")).toBe(false);
		});

		test("false for a number", () => {
			expect(isNonEmptyString(42)).toBe(false);
		});

		test("false for an array", () => {
			expect(isNonEmptyString(["a", "b", "c"])).toBe(false);
		});

		test("false for an object", () => {
			expect(isNonEmptyString({ key: "value" })).toBe(false);
		});

		test("false for null", () => {
			expect(isNonEmptyString(null)).toBe(false);
		});

		test("false for undefined", () => {
			expect(isNonEmptyString(undefined)).toBe(false);
		});

		test("false for boolean", () => {
			expect(isNonEmptyString(true)).toBe(false);
			expect(isNonEmptyString(false)).toBe(false);
		});

		test("false for a function", () => {
			expect(isNonEmptyString(() => ({}))).toBe(false);
		});

		test("false for a number object", () => {
			expect(isNonEmptyString(new Number(42))).toBe(false);
		});

		test("false for a Date object", () => {
			expect(isNonEmptyString(new Date())).toBe(false);
		});
	});

	describe("pluralize", () => {
		test("singular when count is 1", () => {
			expect(pluralize(1, "apple")).toBe("1 apple");
		});

		test("plural when count is 0", () => {
			expect(pluralize(0, "apple")).toBe("0 apples");
		});

		test("plural when count is greater than 1", () => {
			expect(pluralize(2, "apple")).toBe("2 apples");
		});
	});

	describe("unEscUrl", () => {
		test("removes angle brackets from a Slack-style escaped URL", () => {
			const url = "<https://example.com>";
			expect(unEscUrl(url)).toBe("https://example.com");
		});

		test("same URL if no angle brackets", () => {
			const url = "https://example.com";
			expect(unEscUrl(url)).toBe("https://example.com");
		});

		test("same URL if angle brackets on inside", () => {
			const url = "https://example.com/<>path";
			expect(unEscUrl(url)).toBe("https://example.com/<>path");
		});

		test("same string if it starts or ends with only one angle bracket", () => {
			let url = "<https://example.com";
			expect(unEscUrl(url)).toBe("<https://example.com");

			url = "https://example.com>";
			expect(unEscUrl(url)).toBe("https://example.com>");
		});

		test("same string if given an empty string", () => {
			const url = "";
			expect(unEscUrl(url)).toBe("");
		});
	});

	describe("normalizeUserId", () => {
		test("strip Slack-style ID correctly for U-prefixed IDs", () => {
			expect(normalizeUserId("<@U123ABC456>")).toBe("U123ABC456");
		});

		test("strip Slack-style ID correctly for W-prefixed IDs", () => {
			expect(normalizeUserId("<@W987XYZ654>")).toBe("W987XYZ654");
		});

		test("noop strings without user formatting", () => {
			expect(normalizeUserId("U123ABC456")).toBe("U123ABC456");
		});
	});

	describe("logTextPrefix", () => {
		test('prefix text with "Comm update: " for LogType.CommUpdate', () => {
			expect(logTextPrefix(LogType.CommUpdate)).toBe("Comm update: ");
		});

		test('prefix text with "Blocked on: " for LogType.Blocker', () => {
			expect(logTextPrefix(LogType.Blocker)).toBe("Blocked on: ");
		});

		test('prefix text with "Unblocked: " for LogType.Unblock', () => {
			expect(logTextPrefix(LogType.Unblock)).toBe("Unblocked: ");
		});

		test("original text for an undefined LogType", () => {
			expect(logTextPrefix("undefined_log_type" as LogType)).toBe("");
		});
	});

	describe("resolveChatUserIds", () => {
		test("Slack-style user ids", () => {
			const str = "U28487MD3 and <@W523EK4SF> love U2 music. U7873725KD, nope.";

			const userMap = new Map();

			userCacheMerge(userMap, {
				chatUserId: "U28487MD3",
				name: "jack thomas",
				trackerUserId: null,
				reporterUserId: "jack",
				updatedAt: iso9075Now(),
			});

			userCacheMerge(userMap, {
				chatUserId: "W523EK4SF",
				name: "jill thomas",
				trackerUserId: null,
				reporterUserId: "jill",
				updatedAt: iso9075Now(),
			});

			userCacheMerge(userMap, {
				chatUserId: "U7873725KD",
				name: "dan",
				trackerUserId: null,
				reporterUserId: null,
				updatedAt: iso9075Now(),
			});

			const resolveFn = (
				map: Map<ChatUserId, UserEntry>,
				chatUserId: string,
			) => {
				const entry = userCacheGet(map, normalizeUserId(chatUserId));

				if (!entry?.reporterUserId) {
					return entry?.name ?? chatUserId;
				}

				return `@${entry.reporterUserId}`;
			};

			expect(
				resolveChatUserIds(
					str,
					config.commPlatform.userIdRegexPattern,
					userMap,
					resolveFn,
				),
			).toBe("@jack and @jill love U2 music. dan, nope.");
		});
	});
});
