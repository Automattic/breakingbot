import {
	sortAryOfObjByStringAttribute,
	stringSplitCommaToArray,
} from "../../../core/string.js";
import { addComponentDb, removeComponentDb } from "../../../data/component.js";

import type { Component } from "../../../data/component.js";
import type { BreakingBot } from "../../../types/index.js";

export const addComponent = async (
	robot: BreakingBot,
	room: string,
	componentsInput: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();
	const inputArray = stringSplitCommaToArray(componentsInput);

	let allowed: string[] = inputArray;
	let rejected: string[] = [];

	if (robot.tracker && robot.config.issueTrackerStrictComponents) {
		allowed = await robot.tracker.validComponentNames(inputArray);
		rejected = inputArray.filter((c) => !allowed.includes(c));
	}

	let addedComponents: Component[] = [];

	if (allowed.length > 0) {
		addedComponents = await addComponentDb(robot.db, incident.id, allowed);
		incident.components = [...incident.components, ...addedComponents];
		sortAryOfObjByStringAttribute(incident.components, "which");
	}

	const added = addedComponents.map((c) => c.which);
	const dupes = allowed.filter((c) => !added.includes(c));

	const tasks = [];

	if (robot.tracker && added.length > 0) {
		tasks.push(robot.tracker.syncComponents(incident));
	}

	if (rejected.length === 0) {
		tasks.push(robot.adapter.reactToMessage(room, "ok_hand", messageId));
	} else {
		tasks.push(robot.adapter.reactToMessage(room, "exclamation", messageId));

		tasks.push(
			robot.adapter.sendComponentsAdded(
				room,
				added,
				dupes,
				rejected,
				messageId,
			),
		);
	}

	return Promise.allSettled(tasks);
};

export const removeComponent = async (
	robot: BreakingBot,
	room: string,
	component: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	const removed = await removeComponentDb(robot.db, incident.id, component);

	if (!removed) {
		const t1 = robot.adapter.reactToMessage(room, "exclamation", messageId);
		const t2 = robot.adapter.replyToMessage(
			room,
			`Unable to remove \`${component}\`. Maybe see \`.components\`?`,
			messageId,
		);

		return Promise.allSettled([t1, t2]);
	}

	incident.components = incident.components.filter((c) => c.which !== removed);

	const tasks = [robot.adapter.reactToMessage(room, "ok_hand", messageId)];

	if (robot.tracker) {
		tasks.push(robot.tracker.syncComponents(incident));
	}

	return Promise.allSettled(tasks);
};
