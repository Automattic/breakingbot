import { IncidentState } from "../lib/core/fsm.js";

export type AppConfig = {
	breakingInitialUsers: string[];
	breakingMainRoom: string;
	breakingNotifyRoom?: string;
	breakingRoomPrefix: string;
	commPlatform: CommPlatformConfig;
	componentListUrl?: string;
	issueTracker?: IssueTrackerConfig;
	issueTrackerStrictComponents?: boolean;
	onCallTips?: string;
	priorities: PriorityConfig;
	reporterPlatform?: ReporterConfig;
	runbookCommsUrl?: string;
	runbookEngLeadUrl?: string;
	runbookRootUrl: string;
	runbookPointUrl?: string;
	runbookTriageUrl?: string;
	skipDbSslCertCheck?: boolean;
};

export type CommPlatformConfig = SlackConfig;

export type SlackConfig = {
	type: "Slack";
	baseUrl: string;
	botEngSubteamId?: string;
	emoji?: {
		fiery?: string;
		smokey?: string;
		mitigated?: string;
		allclear?: string;
		siren?: string;
		rip?: string;
		sob?: string;
		git?: string;
		launch?: string;
		announce?: string;
		incidentActive?: string;
		incidentMitigated?: string;
		incidentInactive?: string;
		incidentCanceled?: string;
		point?: string;
		comms?: string;
		triage?: string;
		engLead?: string;
		tracker?: string;
		actionItem?: string;
		contributingFactor?: string;
		hiPriority?: string;
		lowPriority?: string;
		blocked?: string;
		unblocked?: string;
		event?: string;
		note?: string;
		affected?: string;
		component?: string;
	};
	userIdRegexPattern: RegExp;
};

type IssueTrackerConfig = GitHubConfig | JiraConfig | P2Config;

export type JiraConfig = {
	type: "JIRA";
	host: string;
	fields: {
		platform: string;
		epicName: string;
		breakingPriority: string;
		genesis: string;
		detected: string;
		acknowledged: string;
		mitigated: string;
		resolved: string;
		incidentReview: string;
		chatRoomUid: string;
		incidentPointPerson: string;
		incidentCommsPerson: string;
	};
	trackingIssue: {
		projectKey: string;
		labels: string[];
	};
	actionItems: {
		projectKey: string;
		labels: string[];
	};
	transitions: {
		[IncidentState.Started]: number;
		[IncidentState.Acknowledged]: number;
		[IncidentState.Mitigated]: number;
		[IncidentState.Blocked]: number;
		[IncidentState.Resolved]: number;
		[IncidentState.ReadyForReview]: number;
		[IncidentState.Completed]: number;
		[IncidentState.Archived]: number;
		[IncidentState.Canceled]: number;
	};
	botAccount: {
		id: string;
		jiraId: string;
	};
	breakingRoomPrefix: string;
	chatRoomUrl: string;
	chatUserIdRegex: RegExp;
};

type GitHubConfig = { type: "GitHub" };
type P2Config = { type: "P2" };

export type ReporterConfig = WpcomReporterConfig;

export type WpcomReporterConfig = {
	type: "Wpcom";
	site: string;
	postStatus: "draft" | "publish";
	chatRoomUrl?: string;
	chatUserIdRegex: RegExp;
	trackerBaseUrl?: string;
};

export type PriorityConfig = {
	documentationUrl?: string;
	default: number;
	defaultLow?: number;
	priorities: {
		[key: number]: {
			name: string;
			url?: string;
			emoji: string;
			description: string;
			aliases: string[];
			nag?: NagConfig;
			reportRequired?: boolean;
			reviewRequired?: boolean;
		};
	};
};

export type NagConfig = {
	nagIntervalsSeconds: {
		noComms: number;
		noPoint: number;
		needCommUpdate?: number;
		needInitialComm: number;
	};
	workingHours24hrTimeUtc?: { start: number; end: number };
};
