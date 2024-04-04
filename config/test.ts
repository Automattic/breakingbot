import { IncidentState } from "../lib/core/fsm.js";
import type {
	AppConfig,
	JiraConfig,
	SlackConfig,
	WpcomReporterConfig,
} from "./index.js";
import { priorityConfig } from "./priorities.js";

const testBreakingRoomPrefix = "unit-test-breaking-";

const testSlackConfig: SlackConfig = {
	type: "Slack",
	baseUrl: "https://unit-test.slack.local",
	userIdRegexPattern: /(<@[UW][A-Z0-9]{5,19}>)|\b([UW][A-Z0-9]{5,19})\b/g,
} as const;

export const testJiraConfig: JiraConfig = {
	type: "JIRA",
	host: "unit-test.jira.local",
	fields: {
		platform: "customfield_10023",
		epicName: "customfield_10100",
		breakingPriority: "customfield_10101",
		genesis: "customfield_10070",
		detected: "customfield_10080",
		acknowledged: "customfield_10119",
		mitigated: "customfield_10001",
		resolved: "customfield_10014",
		incidentReview: "customfield_10084",
		chatRoomUid: "customfield_10074",
		incidentPointPerson: "customfield_10044",
		incidentCommsPerson: "customfield_10045",
	},
	trackingIssue: {
		projectKey: "BREAKINGT",
		labels: ["unit-test-breaking"],
	},
	actionItems: {
		projectKey: "BREAKINGT",
		labels: ["unit-test-breaking-actionitem"],
	},
	transitions: {
		[IncidentState.Started]: 1,
		[IncidentState.Acknowledged]: 2,
		[IncidentState.Mitigated]: 3,
		[IncidentState.Blocked]: 4,
		[IncidentState.Resolved]: 5,
		[IncidentState.ReadyForReview]: 6,
		[IncidentState.Completed]: 7,
		[IncidentState.Archived]: 8,
		[IncidentState.Canceled]: 9,
	},
	botAccount: {
		id: "breakingbot",
		jiraId: "339l9dunnaont93ndimoak",
	},
	breakingRoomPrefix: testBreakingRoomPrefix,
	chatRoomUrl: `${testSlackConfig.baseUrl}/messages`,
	chatUserIdRegex: testSlackConfig.userIdRegexPattern,
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
	issueTracker: testJiraConfig,
	reporterPlatform: testWpcomConfig,
	runbookRootUrl: "https://automattic.com",
} as const;
