import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import {
	humanDateDiff,
	humanDateDiffShort,
	isDatetimeInFuture,
	isDatetimeLeftGtRight,
	isInsideTimeAgo,
	isOutsideTimeAgo,
	isValidHour,
	isValidTime,
	iso9075Now,
	iso9075ToFriendlyShort,
	iso9075ToSlackDatetimeShort,
	iso9075ToUnixtime,
	iso9075ToUtcDatetimeShort,
	iso9075Toiso8601,
	parseNaturalLanguageDate,
	prettifyDate,
} from "../date.js";

describe("date.ts", () => {
	describe("iso9075Now", () => {
		beforeAll(() => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date(2024, 0, 20, 11, 0, 0));
		});

		afterAll(() => {
			vi.useRealTimers();
		});

		test("now", () => {
			expect(iso9075Now()).toBe("2024-01-20 11:00:00");
		});
	});

	describe("iso9075ToUnixtime", () => {
		test("converts an ISO 9075 DateTime in UTC to Unix time correctly", () => {
			expect(iso9075ToUnixtime("2023-01-01 00:00:00")).toBe(1672531200);
		});

		test("accounts for leap years", () => {
			expect(iso9075ToUnixtime("2024-02-29 00:00:00")).toBe(1709164800);
		});
	});

	describe("humanDateDiff", () => {
		test("d1 < d2", () => {
			const d1 = "2018-04-18 00:20:00";
			const d2 = "2018-04-20 21:37:22";
			const expected = "2 days, 21 hours, 17 minutes";
			expect(humanDateDiff(d1, d2)).toBe(expected);
		});
		test("d1 > d2", () => {
			const d1 = "2018-04-20 13:35:22";
			const d2 = "2018-04-20 09:15:00";
			const expected = "4 hours, 20 minutes";
			expect(humanDateDiff(d1, d2)).toBe(expected);
		});
		test("d1 == d2", () => {
			const d1 = "2018-04-20 13:35:22";
			const d2 = "2018-04-20 13:35:22";
			expect(humanDateDiff(d1, d2)).toBe("0 seconds");
		});
		test("d1 > d2 small diff reports only seconds", () => {
			const d1 = "2018-04-20 13:35:22";
			const d2 = "2018-04-20 13:35:25";
			expect(humanDateDiff(d1, d2)).toBe("3 seconds");
		});
		test("long timeframes show days as well", () => {
			const d1 = "2018-04-20 13:35:22";
			const d2 = "2018-02-10 09:15:00";
			const expected = "69 days, 4 hours, 20 minutes";
			expect(humanDateDiff(d1, d2)).toBe(expected);
		});
	});

	describe("humanDateDiffShort", () => {
		test("d1 < d2", () => {
			const d1 = "2018-04-18 00:20:00";
			const d2 = "2018-04-20 21:37:22";
			expect(humanDateDiffShort(d1, d2)).toBe("2d21h17m");
		});
		test("d1 > d2", () => {
			const d1 = "2018-04-20 13:35:22";
			const d2 = "2018-04-20 09:15:00";
			expect(humanDateDiffShort(d1, d2)).toBe("4h20m");
		});
		test("d1 == d2", () => {
			const d1 = "2018-04-20 13:35:22";
			const d2 = "2018-04-20 13:35:22";
			expect(humanDateDiffShort(d1, d2)).toBe("0s");
		});
		test("d1 > d2 small diff reports only seconds", () => {
			const d1 = "2018-04-20 13:35:22";
			const d2 = "2018-04-20 13:35:25";
			expect(humanDateDiffShort(d1, d2)).toBe("3s");
		});
		test("long timeframes show days as well", () => {
			const d1 = "2018-04-20 13:35:22";
			const d2 = "2018-02-10 09:15:00";
			expect(humanDateDiffShort(d1, d2)).toBe("69d4h20m");
		});
	});

	describe("parseNaturalLanguageDate", () => {
		beforeAll(() => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date(2022, 1, 1, 10, 0, 0));
		});
		afterAll(() => {
			vi.useRealTimers();
		});
		test("simple relative time", () => {
			const txt = "yesterday 11:20a";
			const tz = "America/New_York";
			expect(parseNaturalLanguageDate(txt, tz)).toBe("2022-01-31 16:20:00");
		});
		test("unparsable time throws", () => {
			const txt = "some garbage";
			const tz = "America/New_York";
			expect(() => parseNaturalLanguageDate(txt, tz)).toThrow(
				"Error parsing natural language time",
			);
		});
		test("absolute time", () => {
			const txt = "april 20, 2020 16:20pm";
			const tz = "America/New_York";
			expect(parseNaturalLanguageDate(txt, tz)).toBe("2020-04-20 20:20:00");
		});
		test("relative time", () => {
			const txt = "15 minutes ago";
			const tz = "America/New_York";
			expect(parseNaturalLanguageDate(txt, tz)).toBe("2022-02-01 09:45:00");
		});
		test("now", () => {
			const txt = "now";
			const tz = "America/New_York";
			expect(parseNaturalLanguageDate(txt, tz)).toBe("2022-02-01 10:00:00");
		});
		test("simple relative time UTC", () => {
			const txt = "yesterday 11:20a UTC";
			const tz = "America/New_York";
			expect(parseNaturalLanguageDate(txt, tz)).toBe("2022-01-31 11:20:00");
		});
		test("absolute time UTC", () => {
			const txt = "april 20, 2020 16:20pm UTC";
			const tz = "America/New_York";
			expect(parseNaturalLanguageDate(txt, tz)).toBe("2020-04-20 16:20:00");
		});
		test("simple relative time utc", () => {
			const txt = "yesterday 11:20a utc";
			const tz = "America/New_York";
			expect(parseNaturalLanguageDate(txt, tz)).toBe("2022-01-31 11:20:00");
		});
		test("absolute time utc", () => {
			const txt = "april 20, 2020 16:20pm utc";
			const tz = "America/New_York";
			expect(parseNaturalLanguageDate(txt, tz)).toBe("2020-04-20 16:20:00");
		});
		test("nick 'n nejc's case - 12 utc", () => {
			const txt = "12 UTC";
			const tz = "America/New_York";
			expect(parseNaturalLanguageDate(txt, tz)).toBe("2022-02-01 12:00:00");
		});
		test("am/pm time with a space and uppercase", () => {
			const txt = "11:34 PM";
			expect(parseNaturalLanguageDate(txt)).toBe("2022-02-01 23:34:00");
		});
		test("am/pm time with a space and lowercase", () => {
			const txt = "8:34 am";
			expect(parseNaturalLanguageDate(txt)).toBe("2022-02-01 08:34:00");
		});
		test("twenty-four hour time interpreted as today plus that time", () => {
			const txt = "23:34";
			expect(parseNaturalLanguageDate(txt)).toBe("2022-02-01 23:34:00");
		});
		test("mayank's case - 24 hr without colon", () => {
			const txt = "1035";
			expect(parseNaturalLanguageDate(txt)).toBe("2022-02-01 10:35:00");
		});
		test("twenty-four hour time with UTC", () => {
			const txt = "8:34 UTc";
			expect(parseNaturalLanguageDate(txt)).toBe("2022-02-01 08:34:00");
		});
		test("twenty-four hour time with UTC in the future", () => {
			const txt = "23:34 uTC";
			expect(parseNaturalLanguageDate(txt)).toBe("2022-02-01 23:34:00");
		});
		test("date only with UTC sets midnight correctly", () => {
			const txt = "October 14, 2022 UTC";
			const tz = "America/New_York";
			expect(parseNaturalLanguageDate(txt, tz)).toBe("2022-10-14 00:00:00");
		});
		test("date with iso8601 sets midnight correctly", () => {
			const txt = "2024-02-28T17:00Z";
			const tz = "America/Chicago";
			expect(parseNaturalLanguageDate(txt, tz)).toBe("2024-02-28 17:00:00");
		});
		test("date with partial iso8601 sets midnight correctly", () => {
			const txt = "2024-02-28T12:00";
			const tz = "America/Chicago";
			expect(parseNaturalLanguageDate(txt, tz)).toBe("2024-02-28 12:00:00");
		});
		test("hew's case!", () => {
			vi.setSystemTime(new Date(2024, 2, 21, 1, 0, 0));
			const txt = "6:52 pm";
			const tz = "America/New_York";
			expect(parseNaturalLanguageDate(txt, tz)).toBe("2024-03-20 22:52:00");
		});
	});

	describe("isDatetimeLeftGtRight", () => {
		test("true when utcLeft is greater than utcRight", () => {
			const result = isDatetimeLeftGtRight(
				"2023-01-02 00:00:00",
				"2023-01-01 23:59:59",
			);
			expect(result).toBe(true);
		});

		test("false when utcLeft is equal to utcRight", () => {
			const result = isDatetimeLeftGtRight(
				"2023-01-01 23:59:59",
				"2023-01-01 23:59:59",
			);
			expect(result).toBe(false);
		});

		test("false when utcLeft is less than utcRight", () => {
			const result = isDatetimeLeftGtRight(
				"2023-01-01 23:59:58",
				"2023-01-01 23:59:59",
			);
			expect(result).toBe(false);
		});
	});

	describe("isDatetimeInFuture", () => {
		beforeAll(() => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date(2024, 0, 20, 11, 0, 0));
		});

		afterAll(() => {
			vi.useRealTimers();
		});

		test("true when greater than now", () => {
			const result = isDatetimeInFuture("2024-01-20 11:00:01");
			expect(result).toBe(true);
		});

		test("false when equal to now", () => {
			const result = isDatetimeInFuture("2024-01-20 11:00:00");
			expect(result).toBe(false);
		});

		test("false when less than now", () => {
			const result = isDatetimeInFuture("2024-01-20 10:59:59");
			expect(result).toBe(false);
		});
	});

	describe("prettifyDate", () => {
		test("date string with a timezone suffix when a valid date is provided", () => {
			const validDate = "2023-01-01 12:00:00";
			const prettifiedDate = prettifyDate(validDate, "No date set");
			expect(prettifiedDate).toBe("2023-01-01 12:00 UTC");
		});

		test("fallback string when null is provided as the date", () => {
			const fallbackText = "No date set";
			const prettifiedDate = prettifyDate(null, fallbackText);
			expect(prettifiedDate).toBe(fallbackText);
		});
	});

	describe("iso9075ToUtcDatetimeShort", () => {
		test("Utc date short format string when a date is provided", () => {
			const datetimeIso9075 = "2024-01-25 05:52:55";
			expect(iso9075ToUtcDatetimeShort(datetimeIso9075)).toBe("Jan 25 05:52");
		});
	});

	describe("iso9075ToSlackDatetimeShort", () => {
		test("Slack date short format string when a date is provided", () => {
			const datetimeIso9075 = "2024-01-25 05:52:55";
			const expectedUnixTime = 1706161975;

			const slackDateShort = iso9075ToSlackDatetimeShort(datetimeIso9075);
			const expectedSlackDateShort = `<!date^${expectedUnixTime}^{date_short_pretty} {time}|${datetimeIso9075} +00:00 (UTC)>`;

			expect(slackDateShort).toBe(expectedSlackDateShort);
		});
	});

	describe("iso9075ToFriendlyShort", () => {
		test("Slack date short format string when a date is provided", () => {
			const friendly = iso9075ToFriendlyShort("2024-02-14 13:52:55");
			expect(friendly).toBe("Feb 14, 2024 13:52 +0000");
		});
	});

	describe("iso9075Toiso8601", () => {
		test("should convert an ISO 9075 datetime to ISO 8601 format", () => {
			const result = iso9075Toiso8601("2023-03-30 12:00:00");
			expect(result).toBe("2023-03-30T12:00:00.000+00:00");
		});

		test("null if the input is null", () => {
			const result = iso9075Toiso8601(null);
			expect(result).toBeNull();
		});

		test("null if the input is an empty string", () => {
			const result = iso9075Toiso8601("");
			expect(result).toBeNull();
		});
	});

	describe("isInsideTimeAgo", () => {
		beforeAll(() => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date(2023, 3, 1, 12, 0));
		});

		afterAll(() => {
			vi.useRealTimers();
		});

		test("true when datetime is inside the duration", () => {
			expect(isInsideTimeAgo("2023-04-01 10:00:01", 7200)).toBe(true);
		});

		test("true when datetime is equal to the current time minus the duration", () => {
			expect(isInsideTimeAgo("2023-04-01 10:00:00", 7200)).toBe(true);
		});

		test("false when datetime is outside the duration", () => {
			expect(isInsideTimeAgo("2023-04-01 09:59:59", 7200)).toBe(false);
		});

		test("false when datetime is in future", () => {
			expect(isInsideTimeAgo("2023-04-01 12:00:01", 7200)).toBe(false);
		});

		test("false when datetime is null", () => {
			expect(isInsideTimeAgo(null, 7200)).toBe(false);
		});

		test("false when datetime is undefined", () => {
			expect(isInsideTimeAgo(undefined, 7200)).toBe(false);
		});
	});

	describe("isOutsideTimeAgo", () => {
		beforeAll(() => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date(2023, 3, 1, 12, 0));
		});

		afterAll(() => {
			vi.useRealTimers();
		});

		test("true when datetime is outside than the duration", () => {
			expect(isOutsideTimeAgo("2023-04-01 09:59:00", 7200)).toBe(true);
		});

		test("false when datetime is equal to the current time minus the duration", () => {
			expect(isOutsideTimeAgo("2023-04-01 10:00:00", 7200)).toBe(false);
		});

		test("false when datetime is inside the duration", () => {
			expect(isOutsideTimeAgo("2023-04-01 10:00:01", 7200)).toBe(false);
		});

		test("false when datetime is in future", () => {
			expect(isOutsideTimeAgo("2023-04-01 12:00:01", 7200)).toBe(true);
		});

		test("false when datetime is null", () => {
			expect(isOutsideTimeAgo(null, 7200)).toBe(false);
		});

		test("false when datetime is undefined", () => {
			expect(isOutsideTimeAgo(undefined, 7200)).toBe(false);
		});
	});

	describe("isValidTime", () => {
		test("returns true for a valid time", () => {
			expect(isValidTime("23:45")).toBe(true);
			expect(isValidTime("00:00")).toBe(true);
			expect(isValidTime("12:30")).toBe(true);
			expect(isValidTime("01:01")).toBe(true);
			expect(isValidTime("1:50")).toBe(true);
		});

		test("returns false for an invalid time format", () => {
			expect(isValidTime("25:00")).toBe(false);
			expect(isValidTime("23:60")).toBe(false);
		});

		test("returns false for non-time strings", () => {
			expect(isValidTime("not a time")).toBe(false);
			expect(isValidTime("123456")).toBe(false);
			expect(isValidTime("time: 12:00")).toBe(false);
		});

		test("handles empty strings and strings with only spaces", () => {
			expect(isValidTime("")).toBe(false);
			expect(isValidTime(" ")).toBe(false);
			expect(isValidTime("      ")).toBe(false);
		});
	});

	describe("isValidHour", () => {
		test("returns true for valid hour numbers", () => {
			for (let hour = 0; hour <= 23; hour++) {
				expect(isValidHour(hour.toString())).toBe(true);
			}
		});

		test("returns false for numbers outside the valid hour range", () => {
			expect(isValidHour("-1")).toBe(false);
			expect(isValidHour("24")).toBe(false);
			expect(isValidHour("100")).toBe(false);
		});

		test("returns false for strings with spaces", () => {
			expect(isValidHour(" ")).toBe(false);
			expect(isValidHour("5 ")).toBe(false);
			expect(isValidHour("5 minutes ago")).toBe(false);
			expect(isValidHour("23 59")).toBe(false);
		});

		test("returns false for non-numeric strings", () => {
			expect(isValidHour("abc")).toBe(false);
			expect(isValidHour("12abc")).toBe(false);
			expect(isValidHour("twenty-three")).toBe(false);
		});
	});
});
