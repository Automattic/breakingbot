import { describe, expect, test } from "vitest";
import { config } from "../../../config/index.js";
import {
	isHighPriority,
	isReportRequiredForPriority,
	isReviewRequiredForPriority,
	isValidPriority,
	priorityEmoji,
	priorityName,
	priorityUrl,
} from "../priority.js";

const { priorities: testPriorityCfg } = config;

describe("priority.ts", () => {
	describe("priorityName", () => {
		test("P2", () => {
			expect(priorityName(2, testPriorityCfg)).toBe("P2");
		});
	});

	describe("priorityEmoji", () => {
		test("P1", () => {
			expect(priorityEmoji(1, testPriorityCfg)).toBe("fire");
		});
	});

	describe("priorityUrl", () => {
		test("P1", () => {
			const cfg = {
				...testPriorityCfg,
				priorities: {
					...testPriorityCfg.priorities,
					1: {
						...testPriorityCfg.priorities[1],
						url: "https://unit-test.local/p1",
					},
				},
			};

			expect(priorityUrl(1, cfg)).toBe("https://unit-test.local/p1");
		});

		test("P85", () => {
			expect(priorityUrl(85, testPriorityCfg)).toBeNull();
		});
	});

	describe("isHighPriority", () => {
		test("P1", () => {
			expect(isHighPriority(1, testPriorityCfg)).toBe(true);
		});

		test("P4", () => {
			expect(isHighPriority(4, testPriorityCfg)).toBe(false);
		});

		test("Everything high priority if no low configured", () => {
			expect(
				isHighPriority(4, { ...testPriorityCfg, defaultLow: undefined }),
			).toBe(true);
		});
	});

	describe("isReviewRequiredForPriority", () => {
		test("P1", () => {
			expect(isReviewRequiredForPriority(1, testPriorityCfg)).toBe(true);
		});

		test("P3", () => {
			expect(isReviewRequiredForPriority(3, testPriorityCfg)).toBe(false);
		});

		test("invalid priority also false", () => {
			expect(isReviewRequiredForPriority(93, testPriorityCfg)).toBe(false);
		});
	});

	describe("isReportRequiredForPriority", () => {
		test("P1", () => {
			expect(isReportRequiredForPriority(1, testPriorityCfg)).toBe(true);
		});

		test("P3", () => {
			expect(isReportRequiredForPriority(3, testPriorityCfg)).toBe(false);
		});

		test("invalid priority also false", () => {
			expect(isReportRequiredForPriority(93, testPriorityCfg)).toBe(false);
		});
	});

	describe("priorities.ts", () => {
		describe("isValidPriority", () => {
			test("true 1 to 5", () => {
				expect(isValidPriority(1)).toBe(true);
				expect(isValidPriority(2)).toBe(true);
				expect(isValidPriority(3)).toBe(true);
				expect(isValidPriority(4)).toBe(true);
				expect(isValidPriority(5)).toBe(true);
			});

			test("true 1 to 5 strings", () => {
				expect(isValidPriority("1")).toBe(true);
				expect(isValidPriority("2")).toBe(true);
				expect(isValidPriority("3")).toBe(true);
				expect(isValidPriority("4")).toBe(true);
				expect(isValidPriority("5")).toBe(true);
			});

			test("false outside defined priorities", () => {
				expect(isValidPriority(-2)).toBe(false);
				expect(isValidPriority(0)).toBe(false);
				expect(isValidPriority(8)).toBe(false);
				expect(isValidPriority(23)).toBe(false);
			});
		});
	});
});
