import type { IncidentState } from "../core/fsm.js";
import type { Incident } from "../data/incident.js";
import type { LogEntry } from "../data/log.js";
import type { UserCache } from "../data/user-cache.js";

export interface IssueTracker {
	name: string;

	init(): Promise<boolean>;
	createIssue(incident: Incident): Promise<string>;
	sync(
		incident: Incident,
		state: IncidentState,
		log: LogEntry[],
	): Promise<unknown>;
	syncCommUpdate(incident: Incident, logEntry: LogEntry): Promise<unknown>;
	syncComponents(incident: Incident): Promise<unknown>;
	validComponentNames(components: string[]): Promise<string[]>;
	newActionItem(
		incident: Incident,
		text: string,
		trackerUserId?: string | null,
		contextUrl?: string | null,
	): Promise<[string, string] | [null, null]>;
	addInterestedParty(
		trackerUid: string,
		trackerUserId: string,
	): Promise<unknown>;
	isAlreadyInterestedParty(trackerUid: string, trackerUserId: string): boolean;
	resolveUserId(
		email: string | null | undefined,
		chatUserId?: string,
		userCache?: UserCache,
	): Promise<string | null>;
	fmtUser(trackerUid: string): string;
	fmtUidForSlack(trackerUid: string): string;
	fmtUrlForSlack(trackerUrl: string): string;
}
