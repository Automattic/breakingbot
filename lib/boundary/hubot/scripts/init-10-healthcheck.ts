// Description:
//   A hubot script to attach a runtime config to the bot
//
// Configuration:
//   PORT=<port>
//
// Commands:
//   None
//
// Author:
//   WPVIP

import http from "node:http";
import { sql } from "drizzle-orm";
import type { BreakingBot } from "../../../types/index.js";

// biome-ignore lint/style/noDefaultExport: hubot requires it
export default async (robot: BreakingBot) => {
	robot.on("postgres.online", async () => {
		const server = http.createServer((req, res) => {
			res.setHeader("Content-Type", "application/json");

			if (req.url === "/healthcheck") {
				robot.db
					.execute(sql`SELECT 1`)
					.then((_queryResult) => {
						// Database query succeeded
						res.statusCode = 200;
						res.end(
							JSON.stringify({
								status: "UP",
								uptime: Math.floor(process.uptime()),
								checks: {
									postgres: "UP",
								},
							}),
						);
					})
					.catch((_err) => {
						// Database query failed
						res.statusCode = 500;
						res.end(
							JSON.stringify({
								status: "DOWN",
								checks: {
									postgres: "DOWN",
								},
							}),
						);
					});
			} else {
				res.statusCode = 404;
				res.end("Not Found");
			}
		});

		const port = Number(process.env.PORT) || 3000;

		server.listen(port, () => {
			robot.logger.info(`node:http server running on ${port}`);
		});

		robot.emit("healthcheck.online");
	});
};
