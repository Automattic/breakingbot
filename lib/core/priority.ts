import { config } from "../../config/index.js";
import type { NagConfig, PriorityConfig } from "../../config/types.js";

export const priorityName = (
	priority: number,
	cfg = config.priorities,
): string => {
	const p = cfg.priorities[priority];
	return p ? p.name : "unknown";
};

export const priorityDescription = (
	priority: number,
	cfg = config.priorities,
): string => {
	const p = cfg.priorities[priority];
	return p ? p.description : "unknown";
};

export const priorityUrl = (
	priority: number,
	cfg = config.priorities,
): string | null => {
	const p = cfg.priorities[priority];
	return p?.url ?? null;
};

export const priorityEmoji = (
	priority: number,
	cfg = config.priorities,
): string => {
	const p = cfg.priorities[priority];
	return p ? p.emoji : "grey_question";
};

export const priorityNags = (
	priority: number,
	cfg = config.priorities,
): NagConfig | undefined => {
	const p = cfg.priorities[priority];
	return p ? p.nag : undefined;
};

export const isHighPriority = (
	priority: number,
	cfg = config.priorities,
): boolean => {
	const priorityConfig = cfg.priorities[priority];

	if (priorityConfig && priorityConfig.isHighPriority === true) {
		return true;
	}

	return false;
};

export const isReviewRequiredForPriority = (
	priority: number,
	cfg = config.priorities,
): boolean => {
	const p = cfg.priorities[priority];
	return p ? p.reviewRequired === true : false;
};

export const isReportRequiredForPriority = (
	priority: number,
	cfg = config.priorities,
): boolean => {
	const p = cfg.priorities[priority];
	return p ? p.reportRequired === true : false;
};

export const isValidPriority = (
	input: string | number,
): input is keyof PriorityConfig["priorities"] => {
	return input.toString() in config.priorities.priorities;
};
