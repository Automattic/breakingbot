import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as jssm from "jssm";
import type { AppConfig } from "../../config/index.js";
import type { CommPlatform } from "../boundary/comm-platform.js";
import type { IssueTracker } from "../boundary/issue-tracker.js";
import type { ReportPlatform } from "../boundary/report-platform.js";
import type { Incident } from "../data/incident.js";
import type { schema } from "../data/schema/index.js";
import type { UserCache } from "../data/user-cache.js";
import type * as Hubot from "./hubot.js";

export type BreakingBotDb = NodePgDatabase<typeof schema>;
export type ChatRoomUid = string;
export type ChatUserId = string;
export type IncidentIndex = {
	[chatRoomUid: ChatRoomUid]: jssm.Machine<Incident>;
};

interface BreakingBotProperties {
	adapter: Hubot.Adapter & CommPlatform;
	archivist: NodeJS.Timeout;
	annoyotron: NodeJS.Timeout;
	config: AppConfig;
	db: BreakingBotDb;
	incidents: IncidentIndex;
	reporter?: ReportPlatform;
	tracker?: IssueTracker;
	syntrax?: NodeJS.Timeout;
	users: UserCache;
}

export type BreakingBot = Hubot.Robot & BreakingBotProperties;
