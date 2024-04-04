// Description:
//   A hubot script to init the report platform
//
// Configuration:
//   WPCOM_API_TOKEN - WordPress.com account OAuth2 token
//
// Commands:
//   None
//
// Author:
//   WPVIP

import type { BreakingBot } from "../../../types/index.js";
import { Wpcom } from "../../report-platforms/wpcom.js";

// biome-ignore lint/style/noDefaultExport: hubot requires it
export default (robot: BreakingBot) => {
	robot.on("userCache.online", async () => {
		if (!robot.config.reporterPlatform) {
			robot.logger.info("No reporter configured. Skipping.");
			return;
		}

		switch (robot.config.reporterPlatform.type) {
			case "Wpcom": {
				robot.reporter = new Wpcom(
					robot.config.reporterPlatform,
					robot.logger,
					robot.users,
				);
				break;
			}
		}

		const result = await robot.reporter.init();

		if (!result) {
			robot.logger.error("Reporter init failed!");
			return process.exit(1);
		}

		robot.emit("reporter.online");
	});
};
