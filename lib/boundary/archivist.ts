import { ARCHIVE, IncidentState } from "../core/fsm.js";
import { pluralize } from "../core/string.js";
import { archiveIncidentDb } from "../data/incident.js";
import type { BreakingBot } from "../types/index.js";

export const LOOP_INTERVAL_MINUTES = 42;

const eventLoop = async (robot: BreakingBot): Promise<void> => {
	robot.logger.debug("Archivist event loop run started");

	const tasks = [];

	for (const incident of Object.values(robot.incidents)) {
		const { id, chatRoomUid } = incident.data();

		if (!chatRoomUid) {
			robot.logger.error(new Error("Archivist: no chatRoomUid!"));
			continue;
		}

		// This isn't ever expected since we delete below. But we should account for it.
		if (incident.state() === IncidentState.Archived) {
			delete robot.incidents[chatRoomUid];
			continue;
		}

		if (incident.action(ARCHIVE)) {
			const archivedAt = await archiveIncidentDb(robot.db, id);

			if (!archivedAt) {
				const err = new Error(`Archivist: db fail to archive incident ${id}!`);
				robot.logger.error(err);
				continue;
			}

			delete robot.incidents[chatRoomUid];
			tasks.push(robot.adapter.archiveRoom(chatRoomUid));
		}
	}

	robot.logger.debug(
		`Archivist archiving ${pluralize(tasks.length, "incident")}`,
	);

	await Promise.allSettled(tasks);

	robot.logger.debug("Archivist event loop run completed");
};

export const startArchivist = (robot: BreakingBot): NodeJS.Timeout => {
	robot.logger.debug("Starting Archivist");
	return setInterval(() => eventLoop(robot), LOOP_INTERVAL_MINUTES * 60 * 1000);
};

export const stopArchivist = (timeo: NodeJS.Timeout) => clearInterval(timeo);
