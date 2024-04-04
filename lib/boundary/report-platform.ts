import type { Incident } from "../data/incident.js";
import type { LogEntry } from "../data/log.js";

export interface ReportPlatform {
	name: string;

	init(): Promise<boolean>;

	draft(
		incident: Incident,
		log: LogEntry[],
		draftedBy: string,
	): Promise<string>;

	resolveUserId(
		email: string | null | undefined,
		chatUserId?: string,
	): Promise<string | null>;
}
