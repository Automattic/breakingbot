import type { AppConfig, SlackConfig } from "./index.js";
import { priorityConfig } from "./priorities.js";

const devSlackConfig: SlackConfig = {
	type: "Slack",
	baseUrl: "https://<YOUR_INSTANCE>.slack.com",
	userIdRegexPattern: /(<@[UW][A-Z0-9]{5,19}>)|\b([UW][A-Z0-9]{5,19})\b/g,
} as const;

export const devConfig: AppConfig = {
	breakingInitialUsers: [],
	breakingMainRoom: "breaking",
	breakingRoomPrefix: "breaking-dev-",
	commPlatform: devSlackConfig,
	priorities: priorityConfig,
	runbookRootUrl: "https://automattic.com",
} as const;
