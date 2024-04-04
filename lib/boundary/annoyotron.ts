import type * as jssm from "jssm";
import { isInsideTimeAgo, iso9075Now } from "../core/date.js";
import { Annoyotron, DONE, NAG, newAnnoyotronMachine } from "../core/fsm.js";
import { priorityNags } from "../core/priority.js";
import { pluralize } from "../core/string.js";
import { isIncidentActive } from "../data/incident.js";
import { getLogMostRecentCommUpdates } from "../data/log.js";

import type { DatetimeIso9075 } from "../core/date.js";
import type { Incident } from "../data/incident.js";
import type { BreakingBot, ChatRoomUid } from "../types/index.js";

export const LOOP_INTERVAL_SECONDS = 42;

export type NagState = {
	mostRecentCommUpdate: DatetimeIso9075 | null;
	lastNags: {
		noComms: DatetimeIso9075;
		noPoint: DatetimeIso9075;
		needCommUpdate: DatetimeIso9075;
	};
};

const nagMap = new Map<ChatRoomUid, NagState>();

const initNagState = () => {
	const now = iso9075Now();

	return {
		mostRecentCommUpdate: null,
		lastNags: {
			noComms: now,
			noPoint: now,
			needCommUpdate: now,
		},
	};
};

const isNaggable = (incident: Incident) => {
	return isIncidentActive(incident) && incident.mitigatedAt === null;
};

export const isInitialCommNaggable = (
	priority: number,
	createdAt: DatetimeIso9075,
	lastNeedCommUpdate: DatetimeIso9075 | null,
) => {
	const nagConfig = priorityNags(priority);
	const needInitial = nagConfig?.nagIntervalsSeconds.needInitialComm;

	if (!needInitial) {
		return false;
	}

	if (isInsideTimeAgo(lastNeedCommUpdate, needInitial)) {
		return false;
	}

	if (isInsideTimeAgo(createdAt, needInitial)) {
		return false;
	}

	return true;
};

const invokeNags = (
	robot: BreakingBot,
	incident: Incident,
	fsm: jssm.Machine<NagState>,
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: "simple as possible, but no simpler"
): Promise<unknown>[] => {
	const mainRoom = robot.config.breakingMainRoom;
	let lastTransition = true;

	const invoked: Promise<unknown>[] = [];

	while (lastTransition) {
		switch (fsm.state()) {
			case Annoyotron.Start: {
				lastTransition = fsm.action(NAG);

				if (!lastTransition) {
					invoked.push(robot.adapter.sendPointNag(incident, mainRoom));
					fsm.data().lastNags.noPoint = iso9075Now();
					lastTransition = fsm.action(NAG);
				}
				break;
			}
			case Annoyotron.PointNag: {
				lastTransition = fsm.action(NAG);

				if (!lastTransition) {
					invoked.push(robot.adapter.sendCommsNag(incident, mainRoom));
					fsm.data().lastNags.noComms = iso9075Now();
					lastTransition = fsm.action(DONE);
				}
				break;
			}
			case Annoyotron.CommsNag: {
				lastTransition = fsm.action(NAG);
				break;
			}
			case Annoyotron.InitialCommNag: {
				lastTransition = fsm.action(NAG);

				if (!lastTransition) {
					const { priority, createdAt } = incident;
					const lastNeedCommUpdate = fsm.data().lastNags.needCommUpdate;

					if (isInitialCommNaggable(priority, createdAt, lastNeedCommUpdate)) {
						invoked.push(robot.adapter.sendNeedInitialCommNag(incident));
						fsm.data().lastNags.needCommUpdate = iso9075Now();
					}

					lastTransition = fsm.action(DONE);
				}
				break;
			}
			case Annoyotron.CommUpdateNag: {
				lastTransition = fsm.action(DONE);

				if (!lastTransition) {
					invoked.push(robot.adapter.sendNeedCommUpdateNag(incident));
					fsm.data().lastNags.needCommUpdate = iso9075Now();
					lastTransition = fsm.action(DONE);
				}
				break;
			}
			default:
				lastTransition = false;
		}
	}

	return invoked;
};

const eventLoop = async (robot: BreakingBot): Promise<void> => {
	robot.logger.debug("Annoyotron event loop run started");

	const commUpdates = await getLogMostRecentCommUpdates(robot.db);
	const nags = [];

	// do nags
	for (const incidentMachine of Object.values(robot.incidents)) {
		const incident = incidentMachine.data();
		const nagConfig = priorityNags(incident.priority);
		const mostRecentCommUpdate = commUpdates[incident.id];

		if (!incident.chatRoomUid || !isNaggable(incident) || !nagConfig) {
			continue;
		}

		const previous = nagMap.get(incident.chatRoomUid) ?? initNagState();
		const updated = { ...previous, mostRecentCommUpdate };
		nagMap.set(incident.chatRoomUid, updated);

		const machine = newAnnoyotronMachine(incident, nagConfig, updated);
		const newNags = invokeNags(robot, incident, machine);

		nags.push(...newNags);
	}

	// prune nag map
	for (const [chatRoomUid, _] of nagMap) {
		if (!robot.incidents[chatRoomUid]) {
			nagMap.delete(chatRoomUid);
		}
	}

	robot.logger.debug(`Annoyotron sending ${pluralize(nags.length, "nag")}`);

	await Promise.allSettled(nags);

	robot.logger.debug("Annoyotron event loop run completed");
};

export const startAnnoyotron = (robot: BreakingBot): NodeJS.Timeout => {
	robot.logger.debug("Starting Annoyotron");
	return setInterval(() => eventLoop(robot), LOOP_INTERVAL_SECONDS * 1000);
};

export const stopAnnoyotron = (timeo: NodeJS.Timeout) => clearInterval(timeo);
