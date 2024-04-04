import { LogType } from "../data/schema/log-entry-schema.js";
import type { UserCache, UserEntry } from "../data/user-cache.js";
import type { ChatUserId } from "../types/index.js";

export const stringSplitCommaToArray = (str: string): string[] => {
	return str
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part !== "");
};

export const titleCase = (str: string): string => {
	return str
		.toLowerCase()
		.split(" ")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
};

export const sortAryOfObjByStringAttribute = <
	T extends Record<K, string>,
	K extends keyof T,
>(
	aryOfObj: T[],
	key: K,
): T[] => {
	aryOfObj.sort((a, b) => {
		return a[key].localeCompare(b[key]);
	});

	return aryOfObj;
};

export const isString = (str: unknown): boolean => {
	return typeof str === "string";
};

export const isNonEmptyString = (str: unknown): boolean => {
	return typeof str === "string" && str.trim().length > 0;
};

export const pluralize = (count: number, noun: string): string => {
	return `${count} ${noun}${count !== 1 ? "s" : ""}`;
};

export const unEscUrl = (url: string): string => {
	if (url.startsWith("<") && url.endsWith(">")) {
		return url.slice(1, -1);
	}

	return url;
};

export const normalizeUserId = (
	userIdInput: string,
	regexPattern: RegExp = /^<@([A-Z0-9]{5,20})>$/,
): ChatUserId => {
	const matches = userIdInput.match(regexPattern);
	return matches?.[1] ?? userIdInput;
};

export const resolveChatUserIds = (
	strToScan: string,
	regex: RegExp,
	userCache: UserCache,
	fmtFn: (userMap: Map<ChatUserId, UserEntry>, match: string) => string,
): string => {
	return strToScan.replace(regex, (match) => fmtFn(userCache, match));
};

export const logTextPrefix = (logType: LogType): string => {
	let prefix: string;

	switch (logType) {
		case LogType.ActionItem: {
			prefix = "Action item: ";
			break;
		}
		case LogType.CommUpdate: {
			prefix = "Comm update: ";
			break;
		}
		case LogType.Note: {
			prefix = "Note: ";
			break;
		}
		case LogType.Summary: {
			prefix = "Summary: ";
			break;
		}
		case LogType.Blocker: {
			prefix = "Blocked on: ";
			break;
		}
		case LogType.Unblock: {
			prefix = "Unblocked: ";
			break;
		}
		default:
			prefix = "";
	}

	return prefix;
};
