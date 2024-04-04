// Description:
//   A hubot script to attach a runtime config to the bot
//
// Configuration:
//   APP_ENV=<prod|staging|dev>
//   SLACK_APP_TOKEN="xapp-xxx"
//   SLACK_BOT_TOKEN="xoxb-xxx"
//
// Commands:
//   None
//
// Author:
//   WPVIP

import { config } from "../../../../config/index.js";
import type { BreakingBot } from "../../../types/index.js";

// biome-ignore lint/style/noDefaultExport: hubot requires it
export default (robot: BreakingBot) => {
	robot.config = config;

	// register a generic error handler
	robot.error(async (err, res) => {
		const cmd = res?.match?.[0]
			? res.match[0].split(" ")[0]
			: "defaultErrorHandler";

		robot.logger.error(`[${cmd}] error: ${JSON.stringify(err)}`);

		await robot.adapter.sendMaintenanceAlert(
			robot.config.commPlatform,
			res?.message?.room,
		);
	});

	robot.emit("config.online");
};
