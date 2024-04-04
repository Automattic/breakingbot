import { type DatetimeIso9075, iso9075Now } from "../core/date.js";
import type { IncidentState } from "../core/fsm.js";
import { pluralize } from "../core/string.js";
import { type Incident, getSyncsToDo } from "../data/incident.js";
import type { LogEntry } from "../data/log.js";
import type { BreakingBot } from "../types/index.js";
import type { IssueTracker } from "./issue-tracker.js";

const JITTER_IN_SECONDS = 60;
export const LOOP_INTERVAL_SECONDS = 64;

let lastDbRunAt: DatetimeIso9075;

const sleep = (seconds: number) => {
	return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
};

const invokeSync = async (
	tracker: IssueTracker,
	incident: Incident,
	state: IncidentState,
	log: LogEntry[],
) => {
	const jitter = Math.floor(Math.random() * JITTER_IN_SECONDS);
	await sleep(jitter);
	return tracker.sync(incident, state, log);
};

const eventLoop = async (robot: BreakingBot): Promise<void> => {
	if (!robot.tracker) {
		throw new Error("Syntrax: started without tracker!");
	}

	robot.logger.debug("Syntrax event loop run started");

	const syncsToDo = await getSyncsToDo(robot.db, lastDbRunAt);
	lastDbRunAt = iso9075Now();

	const syncs = [];

	robot.logger.debug(
		`Syntrax syncing ${pluralize(Object.keys(syncsToDo).length, "incident")}`,
	);

	for (const key of Object.keys(syncsToDo)) {
		if (!robot.incidents[key]) {
			robot.logger.error(new Error("Syntrax: missing incident!"));
			continue;
		}

		syncs.push(
			invokeSync(
				robot.tracker,
				robot.incidents[key].data(),
				robot.incidents[key].state() as IncidentState,
				syncsToDo[key],
			),
		);
	}

	await Promise.allSettled(syncs);

	robot.logger.debug("Syntrax event loop run completed");
};

export const startSyntrax = (robot: BreakingBot): NodeJS.Timeout => {
	lastDbRunAt = iso9075Now();
	robot.logger.debug("Starting Syntrax");
	return setInterval(() => eventLoop(robot), LOOP_INTERVAL_SECONDS * 1000);
};

export const stopSyntrax = (timeout: NodeJS.Timeout | undefined) => {
	if (!timeout) {
		return;
	}

	clearInterval(timeout);
};
