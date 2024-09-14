import type {
	AppConfig,
	CommPlatformConfig,
	PriorityConfig,
} from "../../config/types.js";
import type { DatetimeIso9075 } from "../core/date.js";
import type { Blocker } from "../data/blocker.js";
import type { Incident, IncidentOverview } from "../data/incident.js";
import type { LogEntry } from "../data/log.js";
import type { IssueTracker } from "./issue-tracker.js";

export interface CommPlatform {
	createIncidentRoom(
		room: string,
		initialUserIds: string[],
	): Promise<CreateIncidentResponse>;
	notifyNewIncident(
		incident: Incident,
		mainRoom: string,
		notifyRoom?: string,
	): Promise<unknown>;
	notifyIncidentPriorityUpgrade(
		incident: Incident,
		mainRoom: string,
		notifyRoom?: string,
	): Promise<unknown>;
	notifyNewLowIncident(incident: Incident, mainRoom: string): Promise<unknown>;
	introNewIncident(
		incident: Incident,
		config: AppConfig,
		formattedTrackerUid?: string,
	): Promise<unknown>;
	sendComponentsList(
		room: string,
		components: string[],
		componentList?: string,
		messageId?: string,
	): Promise<unknown>;
	sendComponentsAdded(
		room: string,
		added: string[],
		dupes: string[],
		rejected: string[],
		messageId?: string,
	): Promise<unknown>;
	sendRoomEnterWelcome(incident: Incident, userId: string): Promise<unknown>;
	sendSummary(
		room: string,
		summary: string | null,
		messageId?: string,
	): Promise<unknown>;
	sendSummaryUpdated(
		room: string,
		summary: string,
		user: string,
		messageId?: string,
	): Promise<unknown>;
	sendNotesList(
		room: string,
		notes: LogEntry[],
		messageId?: string,
	): Promise<unknown>;
	sendAffectedList(
		room: string,
		affected: string[],
		messageId?: string,
	): Promise<unknown>;
	sendAffectedAddedMessage(
		room: string,
		added: string[],
		dupes: string[],
		messageId?: string,
	): Promise<unknown>;
	sendBlockersList(
		room: string,
		blockers: Blocker[],
		messageId?: string,
	): Promise<unknown>;
	sendBlockerAddedMessage(
		room: string,
		blocker: Blocker,
		messageId?: string,
	): Promise<unknown>;
	sendPointTakeover(
		room: string,
		point: string,
		runbookUrl: string,
		messageId?: string,
	): Promise<unknown>;
	sendCommsTakeover(
		room: string,
		comms: string,
		runbookUrl: string,
		messageId?: string,
	): Promise<unknown>;
	sendTriageTakeover(
		room: string,
		triage: string,
		runbookUrl: string,
		messageId?: string,
	): Promise<unknown>;
	sendEngLeadTakeover(
		room: string,
		engLead: string,
		runbookUrl: string,
		messageId?: string,
	): Promise<unknown>;
	sendCommUpdate(
		room: string,
		incident: Incident,
		text: string,
		createdBy: string,
	): Promise<unknown>;
	updateBreakingTopic(
		incident: Incident,
		tracker?: IssueTracker,
	): Promise<unknown>;
	sendMessageToRoom(room: string, text: string): Promise<unknown>;
	replyToMessage(
		room: string,
		text: string,
		messageId?: string,
	): Promise<unknown>;
	reactToMessage(
		room: string,
		emoji: string,
		messageId?: string,
	): Promise<unknown>;
	sendGenesisUpdated(
		room: string,
		genesisAt: DatetimeIso9075,
		userTimezone: string,
		messageId?: string,
	): Promise<unknown>;
	sendDetectedUpdated(
		room: string,
		detectedAt: DatetimeIso9075,
		userTimezone: string,
		messageId?: string,
	): Promise<unknown>;
	sendMitigated(
		room: string,
		mitigatedAt: DatetimeIso9075,
		userTimezone: string | null,
		comms: string | null,
		messageUserId: string,
		messageId?: string,
	): Promise<unknown>;
	sendResolved(
		incident: Incident,
		log: LogEntry[],
		tracker?: IssueTracker,
		messageId?: string,
	): Promise<unknown>;
	notifyResolvedIncident(
		incident: Incident,
		mainRoom: string,
		notifyRoom?: string,
	): Promise<unknown>;
	notifyResolvedLowIncident(
		incident: Incident,
		mainRoom: string,
		notifyRoom?: string,
	): Promise<unknown>;
	sendCompleted(incident: Incident, messageId?: string): Promise<unknown>;
	notifyRestarted(incident: Incident, messageId?: string): Promise<unknown>;
	notifyRestarted(
		incident: Incident,
		mainRoom: string,
		notifyRoom?: string,
		messageId?: string,
	): Promise<unknown>;
	notifyCanceled(
		incident: Incident,
		mainRoom: string,
		notifyRoom?: string,
		messageId?: string,
	): Promise<unknown>;
	sendError(
		room: string,
		errorMsg: string,
		messageId?: string,
	): Promise<unknown>;
	sendErrorListToRoom(
		room: string,
		errors: string[],
		title?: string,
	): Promise<unknown>;
	sendTimeParseError(
		room: string,
		userInput: string,
		userTimezone: string,
		suggestion: string,
		messageId?: string,
	): Promise<unknown>;
	sendAddedActionItem(
		room: string,
		logEntry: LogEntry,
		aiTrackerUid?: string | null,
		incidentTrackerUid?: string | null,
		tracker?: IssueTracker,
		messageId?: string,
	): Promise<unknown>;
	sendAiList(
		room: string,
		ais: LogEntry[],
		tracker?: IssueTracker,
		messageId?: string,
	): Promise<unknown>;
	sendBreakingList(
		room: string,
		incidentOverview: {
			fiery: Incident[];
			mitigated: Incident[];
			inactive: Incident[];
		},
		tracker?: IssueTracker,
		messageId?: string,
	): Promise<unknown>;
	sendAddedFactor(
		room: string,
		factor: LogEntry,
		messageId?: string,
	): Promise<unknown>;
	sendContributingFactorList(
		room: string,
		factors: LogEntry[],
		messageId?: string,
	): Promise<unknown>;
	sendPriorities(
		room: string,
		config: PriorityConfig,
		messageId?: string,
	): Promise<unknown>;
	sendPriorityUpdated(
		room: string,
		priority: number,
		messageId?: string,
	): Promise<unknown>;
	sendAddedPr(room: string, pr: LogEntry, messageId?: string): Promise<unknown>;
	sendPrsList(
		room: string,
		prs: LogEntry[],
		messageId?: string,
	): Promise<unknown>;
	sendBeginReview(
		incident: Incident,
		log: LogEntry[],
		messageId?: string,
	): Promise<unknown>;
	sendHistory(
		room: string,
		incident: Incident,
		log: LogEntry[],
		messageId?: string,
		tracker?: IssueTracker,
	): Promise<unknown>;
	sendTrackingIssue(
		room: string,
		incident: Incident,
		tracker: IssueTracker,
		messageId?: string,
	): Promise<unknown>;
	sendStatus(
		room: string,
		incident: Incident,
		formattedTrackerUid?: string,
		messageId?: string,
	): Promise<unknown>;
	sendStatusAllActive(
		room: string,
		incidentOverview: IncidentOverview,
		tracker?: IssueTracker,
		messageId?: string,
	): Promise<unknown>;
	sendHelpMessage(
		room: string,
		config: AppConfig,
		messageId?: string,
	): Promise<unknown>;
	sendCommandsMessage(
		room: string,
		commands: string[],
		messageId?: string,
	): Promise<unknown>;
	sendTutorialStep(room: string, title: string, body: string): Promise<unknown>;
	sendSocialTemplates(
		room: string,
		templates: { title: string; text: string }[],
		messageId?: string,
	): Promise<unknown>;
	sendPointNag(incident: Incident, mainRoom: string): Promise<unknown>;
	sendCommsNag(incident: Incident, mainRoom: string): Promise<unknown>;
	sendNeedInitialCommNag(incident: Incident): Promise<unknown>;
	sendNeedCommUpdateNag(incident: Incident): Promise<unknown>;
	sendMaintenanceAlert(
		config: CommPlatformConfig,
		room?: string,
		message?: string,
	): Promise<unknown>;
	inviteUsers(room: string, users: string): Promise<unknown>;
	validateUser(userId: string): Promise<boolean>;
	resolveUser(
		userId: string,
	): Promise<{ name: string | null; email?: string | null }>;
	fmtRoom(room: string): string;
	fmtUser(user: string): string;
	normalizeUserIdInput(user: string): string;
	getPermalink(room: string, messageId: string): Promise<string | undefined>;
	getUserTimezone(user: string): Promise<string>;
	getAlreadyInRooms(): Promise<{ [room: string]: boolean }>;
	joinRoom(room: string): Promise<unknown>;
	leaveRoom(room: string): Promise<unknown>;
	archiveRoom(room: string): Promise<unknown>;
}

export interface CreateIncidentResponse {
	roomId?: string;
	roomName?: string;
}
