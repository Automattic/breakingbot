import { describe, expect, test } from "vitest";
import { createBlocker } from "../../../test/index.js";
import { isBlockerActive } from "../blocker.js";

describe("blocker.ts", () => {
	describe("isBlockerActive", () => {
		test("active", () => {
			expect(isBlockerActive(createBlocker())).toBe(true);
		});

		test("inactive", () => {
			const blocker = createBlocker({ unblockedAt: "2024-02-03 10:37:00" });
			expect(isBlockerActive(blocker)).toBe(false);
		});
	});
});
