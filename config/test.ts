import { priorityConfig } from "./priorities.js";
import type { AppConfig, SlackConfig } from "./types.js";

const testSlackConfig: SlackConfig = {
	type: "Slack",
	baseUrl: "https://unit-test.slack.local",
	userIdRegexPattern: /(<@[UW][A-Z0-9]{5,19}>)|\b([UW][A-Z0-9]{5,19})\b/g,
} as const;

export const testConfig: AppConfig = {
	breakingInitialUsers: ["ryan", "nick", "sheri"],
	breakingMainRoom: "unit-test-breaking-main",
	breakingNotifyRoom: "unit-test-breaking-notify",
	breakingRoomPrefix: "unit-test-breaking-",
	commPlatform: testSlackConfig,
	priorities: priorityConfig,
	runbookRootUrl: "https://automattic.com",
} as const;
