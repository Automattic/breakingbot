import { unEscUrl } from "../../../core/string.js";
import {
	addLogActionItemDb,
	addLogContributingFactorDb,
	addLogNoteDb,
	addLogPrDb,
} from "../../../data/log.js";

import type { BreakingBot } from "../../../types/index.js";

export const logAddActionItem = async (
	robot: BreakingBot,
	room: string,
	aiText: string,
	createdBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	let aiTrackerUid = undefined;
	let aiUrl = undefined;

	const chatPermalink = messageId
		? await robot.adapter.getPermalink(room, messageId)
		: undefined;

	if (robot.tracker) {
		[aiTrackerUid, aiUrl] = await robot.tracker.newActionItem(
			incident,
			aiText,
			createdBy,
			chatPermalink,
		);
	}

	const [logEntry] = await addLogActionItemDb(
		robot.db,
		incident.id,
		aiText,
		createdBy,
		aiUrl ?? chatPermalink,
	);

	if (!logEntry) {
		return robot.adapter.sendError(room, "DB write failed!", messageId);
	}

	return robot.adapter.sendAddedActionItem(
		room,
		logEntry,
		aiTrackerUid,
		incident.trackerUid,
		robot.tracker,
		messageId,
	);
};

export const logAddFactor = async (
	robot: BreakingBot,
	room: string,
	userInput: string,
	createdBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	let text = userInput;
	let contextUrl = undefined;

	try {
		contextUrl = new URL(unEscUrl(text)).toString();
		text = contextUrl;
	} catch (_e) {
		contextUrl = messageId
			? await robot.adapter.getPermalink(room, messageId)
			: undefined;
	}

	const [logEntry] = await addLogContributingFactorDb(
		robot.db,
		incident.id,
		text,
		createdBy,
		contextUrl,
	);

	if (!logEntry) {
		return robot.adapter.sendError(room, "DB write failed!", messageId);
	}

	return robot.adapter.sendAddedFactor(room, logEntry, messageId);
};

export const logAddPr = async (
	robot: BreakingBot,
	room: string,
	text: string,
	createdBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	let url = undefined;

	try {
		url = new URL(unEscUrl(text)).toString();
	} catch (_e) {
		return robot.adapter.reactToMessage(room, "exclamation", messageId);
	}

	const [logEntry] = await addLogPrDb(
		robot.db,
		incident.id,
		url,
		createdBy,
		url,
	);

	if (!logEntry) {
		return robot.adapter.sendError(room, "DB write failed!", messageId);
	}

	return robot.adapter.sendAddedPr(room, logEntry, messageId);
};

export const logAddNote = async (
	robot: BreakingBot,
	room: string,
	text: string,
	createdBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	const chatPermalink = messageId
		? await robot.adapter.getPermalink(room, messageId)
		: undefined;

	const [logEntry] = await addLogNoteDb(
		robot.db,
		incident.id,
		text,
		createdBy,
		chatPermalink,
	);

	if (!logEntry) {
		return robot.adapter.sendError(room, "DB write failed!", messageId);
	}

	return robot.adapter.replyToMessage(
		room,
		`Thanks. ${robot.adapter.fmtUser(createdBy)}! I have updated the notes.`,
		messageId,
	);
};
