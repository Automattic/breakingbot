// Description:
//   A hubot script to load incident data from durable storage into the bot
//
// Configuration:
//   None
//
// Commands:
//   None
//
// Author:
//   WPVIP

import { newIncidentMachine } from "../../../core/fsm.js";
import { findIncidentsInProgressDb } from "../../../data/incident.js";
import type { BreakingBot, IncidentIndex } from "../../../types/index.js";

// biome-ignore lint/style/noDefaultExport: hubot requires it
export default async (robot: BreakingBot) => {
	robot.on("postgres.online", async () => {
		const incidents = await findIncidentsInProgressDb(robot.db);

		robot.incidents = incidents.reduce((acc: IncidentIndex, incident) => {
			if (!incident.chatRoomUid) {
				console.error(`Incident ${incident.id} is missing a chat room!`);
				process.exit(1);
			}

			acc[incident.chatRoomUid] = newIncidentMachine(incident);

			return acc;
		}, {});

		robot.emit("incidents.online");
	});
};
