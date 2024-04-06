// Description:
//   A hubot script to attach a database pool to the bot
//
// Configuration:
//   DATABASE_URL postgres://user:pass@host/breakingbot
//
// Commands:
//   None
//
// Author:
//   WPVIP

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { schema } from "../../../data/schema/index.js";
import type { BreakingBot } from "../../../types/index.js";
import { stopAnnoyotron } from "../../annoyotron.js";
import { stopArchivist } from "../../archivist.js";
import { stopSyntrax } from "../../syntrax.js";

// biome-ignore lint/style/noDefaultExport: hubot requires it
export default async (robot: BreakingBot) => {
	if (typeof process.env.DATABASE_URL !== "string") {
		console.error("Error: Invalid DATABASE_URL");
		process.exit(1);
	}

	const clientConfig: pg.ClientConfig = {
		connectionString: process.env.DATABASE_URL,
	};

	if (robot.config.skipDbSslCertCheck) {
		clientConfig.ssl = { rejectUnauthorized: false };
	}

	const client = new pg.Client(clientConfig);
	await client.connect();

	robot.db = drizzle(client, { schema });

	const handleExit = async (signal: string) => {
		robot.logger.info(`Received ${signal}. Shutting down.`);
		stopAnnoyotron(robot.annoyotron);
		stopArchivist(robot.archivist);
		stopSyntrax(robot.syntrax);
		robot.shutdown();
		await client.end();
		robot.logger.info("Shutdown complete.");
		process.exitCode = 0;
	};

	process.on("SIGINT", handleExit);
	process.on("SIGTERM", handleExit);

	robot.emit("postgres.online");
};
