import { BLOCK, UNBLOCK, ffwIncident } from "../../../core/fsm.js";
import {
	addBlockerDb,
	unblockAllBlockersDb,
	unblockBlockerDb,
} from "../../../data/blocker.js";
import { addLogBlockerDb, addLogUnblockedDb } from "../../../data/log.js";

import type { BreakingBot } from "../../../types/index.js";

export const addBlocker = async (
	robot: BreakingBot,
	room: string,
	whomst: string,
	reason: string,
	addedBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	const [blocker] = await addBlockerDb(robot.db, incident.id, whomst, reason);

	if (!blocker) {
		return robot.adapter.sendError(room, "DB write failed!", messageId);
	}

	incident.blockers.push(blocker);
	robot.incidents[room].action(BLOCK);

	const logText = reason ? `${whomst} => ${reason}` : whomst;
	const chatPermalink = messageId
		? await robot.adapter.getPermalink(room, messageId)
		: undefined;

	const tasks = [
		robot.adapter.sendBlockerAddedMessage(room, blocker, messageId),
		addLogBlockerDb(robot.db, incident.id, logText, addedBy, chatPermalink),
	];

	if (incident.blockers.length === 1) {
		tasks.push(robot.adapter.updateBreakingTopic(incident, robot.tracker));
	}

	return Promise.allSettled(tasks);
};

export const removeBlocker = async (
	robot: BreakingBot,
	room: string,
	blockerId: number,
	removedBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	const [removed] = await unblockBlockerDb(robot.db, incident.id, blockerId);

	if (!removed) {
		const errorMsg =
			"Unable to remove blocker with that id. Maybe it's not a `.blockers`?";
		return robot.adapter.sendError(room, errorMsg, messageId);
	}

	incident.blockers = incident.blockers.filter((b) => b.id !== removed.id);

	if (robot.incidents[room].action(UNBLOCK)) {
		ffwIncident(robot.incidents[room]);
	}

	const logText = removed.reason
		? `${removed.whomst} => ${removed.reason}`
		: removed.whomst;

	const chatPermalink = messageId
		? await robot.adapter.getPermalink(room, messageId)
		: undefined;

	const tasks = [
		robot.adapter.reactToMessage(room, "ok_hand", messageId),
		addLogUnblockedDb(robot.db, incident.id, logText, removedBy, chatPermalink),
	];

	if (incident.blockers.length === 0) {
		tasks.push(robot.adapter.updateBreakingTopic(incident, robot.tracker));
	}

	return Promise.allSettled(tasks);
};

export const removeAllBlockers = async (
	robot: BreakingBot,
	room: string,
	removedBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	const removed = await unblockAllBlockersDb(robot.db, incident.id);

	incident.blockers = [];

	robot.incidents[room].action(UNBLOCK);
	ffwIncident(robot.incidents[room]);

	const logText = removed.map((r) => r.whomst).join(", ");
	const chatPermalink = messageId
		? await robot.adapter.getPermalink(room, messageId)
		: undefined;

	const tasks = [
		robot.adapter.reactToMessage(room, "ok_hand", messageId),
		robot.adapter.updateBreakingTopic(incident, robot.tracker),
		addLogUnblockedDb(robot.db, incident.id, logText, removedBy, chatPermalink),
	];

	return Promise.allSettled(tasks);
};
