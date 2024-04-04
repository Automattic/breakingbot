import {
	sortAryOfObjByStringAttribute,
	stringSplitCommaToArray,
} from "../../../core/string.js";
import { addAffectedDb, removeAffectedDb } from "../../../data/affected.js";
import type { BreakingBot } from "../../../types/index.js";

export const addAffected = async (
	robot: BreakingBot,
	room: string,
	affectedInput: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();
	const newAffected = stringSplitCommaToArray(affectedInput);

	const addedAffected = await addAffectedDb(robot.db, incident.id, newAffected);
	incident.affected = [...incident.affected, ...addedAffected];
	sortAryOfObjByStringAttribute(incident.affected, "what");

	const added = addedAffected.map((a) => a.what);
	const dupes = newAffected.filter((a) => !added.includes(a));

	const tasks = [
		robot.adapter.reactToMessage(room, "ok_hand", messageId),
		robot.adapter.sendAffectedAddedMessage(room, added, dupes, messageId),
	];

	return Promise.allSettled(tasks);
};

export const removeAffected = async (
	robot: BreakingBot,
	room: string,
	affected: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	const removed = await removeAffectedDb(robot.db, incident.id, affected);

	if (!removed) {
		const errMsg = `Unable to remove ${affected}. Maybe it's not \`.affected\`?`;
		return robot.adapter.sendError(room, errMsg, messageId);
	}

	incident.affected = incident.affected.filter((a) => a.what !== affected);

	return robot.adapter.reactToMessage(room, "ok_hand", messageId);
};
