// Description:
//   A hubot script to join all ongoing breaking rooms
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
import { incidentStatusMiddleware } from "../middleware/incident-status.js";
import { userIdentityMiddleware } from "../middleware/user-identity.js";

// biome-ignore lint/style/noDefaultExport: hubot requires it
export default (robot: BreakingBot) => {
	incidentStatusMiddleware(robot);
	userIdentityMiddleware(robot);
};
