import type { AppConfig, SlackConfig, WpcomReporterConfig } from "./index.js";
import { priorityConfig } from "./priorities.js";

const testBreakingRoomPrefix = "unit-test-breaking-";

const testSlackConfig: SlackConfig = {
	type: "Slack",
	baseUrl: "https://unit-test.slack.local",
	userIdRegexPattern: /(<@[UW][A-Z0-9]{5,19}>)|\b([UW][A-Z0-9]{5,19})\b/g,
} as const;

export const testWpcomConfig: WpcomReporterConfig = {
	type: "Wpcom",
	site: "unit-test.local",
	postStatus: "draft",
	chatRoomUrl: `${testSlackConfig.baseUrl}/messages`,
	chatUserIdRegex: testSlackConfig.userIdRegexPattern,
	trackerBaseUrl: "https://jira.unit-test.local/browse",
} as const;

export const testConfig: AppConfig = {
	breakingInitialUsers: ["ryan", "nick", "sheri"],
	breakingMainRoom: "unit-test-breaking-main",
	breakingNotifyRoom: "unit-test-breaking-notify",
	breakingRoomPrefix: testBreakingRoomPrefix,
	commPlatform: testSlackConfig,
	priorities: priorityConfig,
	reporterPlatform: testWpcomConfig,
	runbookRootUrl: "https://automattic.com",
} as const;
