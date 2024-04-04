// Description:
//   A hubot script to start ancillary processing event loops
//
// Configuration:
//   None
//
// Commands:
//   None
//
// Author:
//   WPVIP

import type { BreakingBot } from "../../../types/index.js";
import { startAnnoyotron } from "../../annoyotron.js";
import { startArchivist } from "../../archivist.js";
import { startSyntrax } from "../../syntrax.js";

// biome-ignore lint/style/noDefaultExport: hubot requires it
export default async (robot: BreakingBot) => {
	robot.on("rooms.online", () => {
		robot.archivist = startArchivist(robot);
		robot.emit("archivist.online");

		robot.annoyotron = startAnnoyotron(robot);
		robot.emit("annoyotron.online");
	});

	robot.on("tracker.online", () => {
		robot.syntrax = startSyntrax(robot);
		robot.emit("syntrax.online");
	});
};
