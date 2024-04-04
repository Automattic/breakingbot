import {
	type NagConfig,
	type PriorityConfig,
	priorityConfig,
} from "../../config/priorities.js";

export const priorityName = (
	priority: number,
	cfg = priorityConfig,
): string => {
	const p = cfg.priorities[priority];
	return p ? p.name : "unknown";
};

export const priorityDescription = (
	priority: number,
	cfg = priorityConfig,
): string => {
	const p = cfg.priorities[priority];
	return p ? p.description : "unknown";
};

export const priorityUrl = (priority: number, cfg = priorityConfig): string => {
	const p = cfg.priorities[priority];
	return p ? p.url : "#";
};

export const priorityEmoji = (
	priority: number,
	cfg = priorityConfig,
): string => {
	const p = cfg.priorities[priority];
	return p ? p.emoji : "grey_question";
};

export const priorityNags = (
	priority: number,
	cfg = priorityConfig,
): NagConfig | undefined => {
	const p = cfg.priorities[priority];
	return p ? p.nag : undefined;
};

export const isHighPriority = (
	priority: number,
	cfg = priorityConfig,
): boolean => {
	return !cfg.defaultLow || priority < cfg.defaultLow;
};

export const isReviewRequiredForPriority = (
	priority: number,
	cfg = priorityConfig,
): boolean => {
	const p = cfg.priorities[priority];
	return p ? p.reviewRequired === true : false;
};

export const isReportRequiredForPriority = (
	priority: number,
	cfg = priorityConfig,
): boolean => {
	const p = cfg.priorities[priority];
	return p ? p.reportRequired === true : false;
};

export const isValidPriority = (
	input: string | number,
): input is keyof PriorityConfig["priorities"] => {
	return input.toString() in priorityConfig.priorities;
};
