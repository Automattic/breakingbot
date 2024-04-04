// Description:
//   A hubot script to init the tracker platform
//
// Configuration:
//   JIRA_EMAIL - JIRA email for the bot user
//   JIRA_API_TOKEN - JIRA api token
//
// Commands:
//   None
//
// Author:
//   WPVIP

import type { BreakingBot } from "../../../types/index.js";
import { Jira } from "../../issue-trackers/jira.js";

// biome-ignore lint/style/noDefaultExport: hubot requires it
export default (robot: BreakingBot) => {
	robot.on("userCache.online", async () => {
		if (!robot.config.issueTracker) {
			robot.logger.info("No tracker configured. Skipping.");
			return;
		}

		switch (robot.config.issueTracker.type) {
			case "GitHub": {
				console.error("Error: GitHub tracker not yet implemented");
				return process.exit(1);
			}
			case "JIRA": {
				robot.tracker = new Jira(
					robot.config.issueTracker,
					robot.logger,
					robot.users,
				);
				break;
			}
			case "P2": {
				console.error("Error: P2 tracker not yet implemented");
				return process.exit(1);
			}
		}

		const result = await robot.tracker.init();

		if (!result) {
			robot.logger.error("Tracker init failed!");
			return process.exit(1);
		}

		robot.emit("tracker.online");
	});
};
