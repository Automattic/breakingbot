import type pino from "pino";
import type { WpcomReporterConfig } from "../../../config/index.js";
import type { Incident } from "../../data/incident.js";
import type { LogEntry } from "../../data/log.js";
import type { UserCache } from "../../data/user-cache.js";
import type { ReportPlatform } from "../report-platform.js";

/**
 * WordPress.com reporter
 */
export class Wpcom implements ReportPlatform {
	name: string;
	#config: WpcomReporterConfig;
	#logger: pino.Logger<never>;
	#userCache: UserCache;

	constructor(
		config: WpcomReporterConfig,
		logger: pino.Logger,
		userCache: UserCache,
	) {
		if (config.type !== "Wpcom") {
			throw new Error("Not a Wpcom config!");
		}

		this.name = "WordPress.com";
		this.#config = config;
		this.#logger = logger;
		this.#userCache = userCache;
	}

	// biome-ignore lint/suspicious/useAwait: stub
	async init() {
		return false;
	}

	// biome-ignore lint/suspicious/useAwait: stub
	async draft(_incident: Incident, _log: LogEntry[], _draftedBy: string) {
		return "Not implemented";
	}

	// biome-ignore lint/suspicious/useAwait: stub
	async resolveUserId(
		_email: string | null | undefined,
		_chatUserId: string,
	): Promise<string | null> {
		return null;
	}

	fmtUser(reporterUserId: string): string {
		return `@${reporterUserId}`;
	}
}
