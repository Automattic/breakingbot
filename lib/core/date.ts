import { DateTime, Interval } from "luxon";
// @ts-expect-error ts(2306)
import Sugar from "sugar-date";

export type DatetimeIso9075 = string;

/**
 * Get the current datetime in ISO9075 (MySQL) format
 */
export const iso9075Now = (): DatetimeIso9075 => {
	return DateTime.utc().toFormat("y-MM-dd HH:mm:ss");
};

/**
 * Convert ISO9075 (MySQL) format to Unix time
 */
export const iso9075ToUnixtime = (datetimeUtc: DatetimeIso9075): number => {
	return DateTime.fromSQL(datetimeUtc, { zone: "utc" }).toUnixInteger();
};

/**
 * Convert ISO9075 (MySQL) format to ISO8601
 */
export const iso9075Toiso8601 = (datetimeUtc: DatetimeIso9075 | null) => {
	return datetimeUtc ? DateTime.fromSQL(datetimeUtc).toISO() : null;
};

/**
 * Compute a human relative difference between two UTC datetimes
 */
export const humanDateDiff = (
	utcLeft: DatetimeIso9075,
	utcRight: DatetimeIso9075,
): string => {
	const d1 = DateTime.fromSQL(utcLeft);
	const d2 = DateTime.fromSQL(utcRight);

	const start = d1 < d2 ? d1 : d2;
	const end = d1 >= d2 ? d1 : d2;

	const interval = Interval.fromDateTimes(start, end);
	const duration = interval.toDuration(["days", "hours", "minutes", "seconds"]);

	const opts = { maximumFractionDigits: 0 };

	if (duration.days >= 1) {
		return interval.toDuration(["days", "hours", "minutes"]).toHuman(opts);
	}

	if (duration.hours >= 1) {
		return interval.toDuration(["hours", "minutes"]).toHuman(opts);
	}

	if (duration.minutes >= 1) {
		return interval.toDuration(["minutes"]).toHuman(opts);
	}

	return interval.toDuration(["seconds"]).toHuman(opts);
};

/**
 * Compute a human relative difference short format between two UTC datetimes
 */
export const humanDateDiffShort = (
	utcLeft: DatetimeIso9075,
	utcRight: DatetimeIso9075,
): string => {
	const d1 = DateTime.fromSQL(utcLeft);
	const d2 = DateTime.fromSQL(utcRight);

	const start = d1 < d2 ? d1 : d2;
	const end = d1 >= d2 ? d1 : d2;

	const interval = Interval.fromDateTimes(start, end);
	const duration = interval.toDuration(["days", "hours", "minutes", "seconds"]);

	if (duration.days >= 1) {
		return `${duration.days}d${duration.hours}h${duration.minutes}m`;
	}

	if (duration.hours >= 1) {
		return `${duration.hours}h${duration.minutes}m`;
	}

	if (duration.minutes >= 1) {
		return `${duration.minutes}m${duration.seconds}s`;
	}

	return `${duration.seconds}s`;
};

export const humanRelativeNow = (
	datetimeUtc: DatetimeIso9075,
): string | null => {
	return DateTime.fromSQL(datetimeUtc).toRelative();
};

/**
 * Parse a myriad of natural language datetime strings such as "yesterday",
 * "Jan 9 at 4 pm", "three hours ago", etc into a datetime
 *
 * @throws if Sugar Date parsing barfs
 */
export const parseNaturalLanguageDate = (
	timeNaturalLanguage: string,
	userTimezone = "utc",
): DatetimeIso9075 => {
	const natural = timeNaturalLanguage.toLowerCase().trim();

	if (natural === "now") {
		return iso9075Now();
	}

	let normalized = natural;

	// sugar date easily barfs on tz strings and doesn't use them well; strip this
	// as we already assume utc anyways
	if (natural.endsWith("utc")) {
		normalized = natural.slice(0, -3).trimEnd();
		normalized = maybeNormalizeRelativeTime(normalized);
	}
	// interpret naive hourly times as today + that time
	else {
		normalized = maybeNormalizeRelativeTime(normalized, userTimezone);
	}

	try {
		const iso8601 = DateTime.fromISO(normalized.toUpperCase());

		if (iso8601.isValid) {
			return iso8601.toFormat("y-MM-dd HH:mm:ss");
		}
	} catch {
		// {:ok, :continue}
	}

	// humanized date inference, an achievement+nightmare!
	const sugarParsedParams = {};
	const sugarDate = Sugar.Date.create(normalized, {
		past: true, // bias to past dates when ambiguous
		params: sugarParsedParams, // write parsed params here so we can inspect
	});

	// biome-ignore lint/suspicious/noGlobalIsNan: this janky sugar setup relies on the coercion
	if (isNaN(sugarDate)) {
		throw new Error("Error parsing natural language time");
	}

	// escape from sugar date asap!
	const datetimeNoTz = Sugar.Date(sugarDate).format("%Y-%m-%d %T").raw;

	// we explicitly specified in utc or relative like "5 minutes ago"
	if (natural.endsWith("utc") || isSugarParseRelative(sugarParsedParams)) {
		return datetimeNoTz;
	}

	// infer intent, assuming expressed in user's natural TZ perspective, convert to utc
	return DateTime.fromSQL(datetimeNoTz, { zone: userTimezone })
		.toUTC()
		.toFormat("y-MM-dd HH:mm:ss");
};

const maybeNormalizeRelativeTime = (
	time: string,
	userTimezone = "utc",
): string => {
	const normalizedTime = maybeNormalize24hrTime(time);
	const now = DateTime.now().setZone(userTimezone).toFormat("y-MM-dd");

	if (isValidTime(normalizedTime)) {
		return `${now} ${normalizedTime}`;
	}

	if (isValidHour(normalizedTime)) {
		return `${now} ${normalizedTime}:00`;
	}

	return time;
};

const maybeNormalize24hrTime = (time: string) => {
	if (time.includes(":")) {
		return time;
	}

	let normalizedTime = time;

	if (time.length === 3) {
		normalizedTime = `0${time.slice(0, 1)}:${time.slice(1)}`;
	} else if (time.length === 4) {
		normalizedTime = `${time.slice(0, 2)}:${time.slice(2)}`;
	}

	return normalizedTime;
};

// when parsing a relative time, like '5 min ago', sugar will use something like
// { num: 5, unit: 2, sign: -1, minute: -5, specificity: 2 }
// This signals we should interpret the timezone as UTC, not userTimezone
// Specifically, num means "unitless number hanging around after parsing the other bits",
// which we use as a signal to do relative time parsing
const isSugarParseRelative = (sugarParsedParams: { num?: number }): boolean => {
	return sugarParsedParams.num ? sugarParsedParams.num > 0 : false;
};

/**
 * Compare two ISO9075 dates and determine if given left > right
 */
export const isDatetimeLeftGtRight = (
	utcLeft: DatetimeIso9075,
	utcRight: DatetimeIso9075,
): boolean => {
	return DateTime.fromSQL(utcLeft) > DateTime.fromSQL(utcRight);
};

/**
 * Checks if given ISO9075 datetime is in the future
 */
export const isDatetimeInFuture = (datetimeUtc: DatetimeIso9075): boolean => {
	return DateTime.fromSQL(datetimeUtc) > DateTime.now();
};

/**
 * Format date in year month day hour minute TZ
 * eg: 2024-02-16 21:38 UTC
 *
 * (Kinda weird utility for Core4 display. Maybe refactor sometime?)
 */
export const prettifyDate = (
	datetime: DatetimeIso9075 | null,
	fallback: string,
): string => {
	return datetime
		? DateTime.fromSQL(datetime).toFormat("y-MM-dd T ZZZZ")
		: fallback;
};

/*
 * Formats a UTC datetime into a human short month day time format
 * Eg: Feb 8 13:15
 */
export const iso9075ToUtcDatetimeShort = (datetimeUtc: DatetimeIso9075) => {
	return DateTime.fromSQL(datetimeUtc).toFormat("MMM d T");
};

/*
 * Formats a UTC datetime into a Slack locale aware date string
 * @see https://api.slack.com/docs/message-formatting#formatting_dates
 */
export const iso9075ToSlackDatetimeShort = (datetimeUtc: DatetimeIso9075) => {
	const timestamp = iso9075ToUnixtime(datetimeUtc);
	const utcFallback = `${datetimeUtc} +00:00 (UTC)`;

	return `<!date^${timestamp}^{date_short_pretty} {time}|${utcFallback}>`;
};

export const isInsideTimeAgo = (
	datetimeUtc: DatetimeIso9075 | null | undefined,
	durationInSeconds: number,
): boolean => {
	if (!datetimeUtc) {
		return false;
	}

	const dt = DateTime.fromSQL(datetimeUtc);
	const now = DateTime.now();

	if (dt > now) {
		return false;
	}

	return dt >= now.minus({ seconds: durationInSeconds });
};

export const isOutsideTimeAgo = (
	datetimeUtc: DatetimeIso9075 | null | undefined,
	durationInSeconds: number,
): boolean => {
	if (!datetimeUtc) {
		return false;
	}

	const dt = DateTime.fromSQL(datetimeUtc);
	const now = DateTime.now();

	if (dt > now) {
		return true;
	}

	return dt < now.minus({ seconds: durationInSeconds });
};

/**
 * Formats a UTC datetime into a human short month day year time format
 * Eg: Feb 16, 2024 18:36 +0000
 */
export const iso9075ToFriendlyShort = (
	datetimeUtc: DatetimeIso9075,
): string => {
	return DateTime.fromSQL(datetimeUtc).toFormat("DD HH:mm ZZZ");
};

export const isValidTime = (time: string): boolean => {
	try {
		const dt1 = DateTime.fromFormat(time, "T");

		if (dt1.isValid) {
			return true;
		}
	} catch (_e) {
		// {:ok, :continue}
	}

	try {
		const dt2 = DateTime.fromFormat(time, "t");

		if (dt2.isValid) {
			return true;
		}
	} catch (_e) {
		// {:ok, :continue}
	}

	return false;
};

export const isValidHour = (time: string): boolean => {
	return /^([1]?[0-9]|2[0-3])$/.test(time);
};
