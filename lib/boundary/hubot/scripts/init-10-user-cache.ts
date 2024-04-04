// Description:
//   A hubot script to preload the user cache from durable storage into the bot
//
// Configuration:
//   None
//
// Commands:
//   None
//
// Author:
//   WPVIP

import { initUserCache } from "../../../data/user-cache.js";
import type { BreakingBot } from "../../../types/index.js";

// biome-ignore lint/style/noDefaultExport: hubot requires it
export default (robot: BreakingBot) => {
	robot.on("postgres.online", async () => {
		robot.users = await initUserCache(robot.db);
		robot.emit("userCache.online");
	});
};
