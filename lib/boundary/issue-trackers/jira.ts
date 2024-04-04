import fs from "node:fs";
import Handlebars from "handlebars";
import { Version2Client, Version3Client } from "jira.js";
import { iso9075ToFriendlyShort, iso9075Toiso8601 } from "../../core/date.js";
import { priorityName } from "../../core/priority.js";
import {
	logTextPrefix,
	normalizeUserId,
	resolveChatUserIds,
	titleCase,
} from "../../core/string.js";
import { isBlockerActive } from "../../data/blocker.js";
import { isIncidentActive } from "../../data/incident.js";
import { LogType } from "../../data/schema/log-entry-schema.js";
import { userCacheGet } from "../../data/user-cache.js";

import type {
	ProjectComponent,
	User,
} from "jira.js/out/version3/models/index.js";
import type pino from "pino";
import type { JiraConfig } from "../../../config/index.js";
import type { IncidentState } from "../../core/fsm.js";
import type { Incident } from "../../data/incident.js";
import type { LogEntry } from "../../data/log.js";
import type { UserCache } from "../../data/user-cache.js";
import type { IssueTracker } from "../issue-tracker.js";

const incidentDescriptionWikiTemplate = Handlebars.compile(
	fs.readFileSync("templates/jira/incident_description.handlebars", "utf8"),
	{ strict: true },
);

const actionItemDescriptionWikiTemplate = Handlebars.compile(
	fs.readFileSync("templates/jira/action_item_description.handlebars", "utf8"),
	{ strict: true },
);

type IssueTransitionMap = Map<string, IncidentState>;
type IssueWatcherMap = Map<string, boolean>;

const authentication = {
	basic: {
		email: process.env.JIRA_EMAIL ?? "",
		apiToken: process.env.JIRA_API_TOKEN ?? "",
	},
};

export class Jira implements IssueTracker {
	name: string;
	self: User | undefined;
	#config: JiraConfig;
	#issueTransitions: IssueTransitionMap;
	#issueWatchers: IssueWatcherMap;
	#logger: pino.Logger<never>;
	#userCache: UserCache;
	#webClient2: Version2Client;
	#webClient3: Version3Client;

	constructor(
		config: JiraConfig,
		logger: pino.Logger,
		userCache: UserCache,
		webClient2?: Version2Client,
		webClient3?: Version3Client,
	) {
		if (config.type !== "JIRA") {
			throw new Error("Not a JIRA config!");
		}

		this.name = "JIRA";
		this.#config = config;
		this.#issueTransitions = new Map();
		this.#issueWatchers = new Map();
		this.#logger = logger;
		this.#userCache = userCache;
		const host = `https://${this.#config.host}`;

		this.#webClient2 =
			webClient2 ?? new Version2Client({ host, authentication });
		this.#webClient3 =
			webClient3 ?? new Version3Client({ host, authentication });
	}

	async init() {
		this.#logger.debug(`JIRA: testing connection to ${this.#config.host}`);

		try {
			this.self = await this.#webClient3.myself.getCurrentUser();
		} catch (err) {
			this.#logger.error(`JIRA: http init failed! Err: ${JSON.stringify(err)}`);
		}

		if (!this.self) {
			this.#logger.error(`JIRA: connection to ${this.#config.host} failed!`);
			return false;
		}

		this.#logger.debug(this.self);
		this.#logger.info(
			`JIRA: Logged in as ${this.self.accountId} (${this.self.displayName}) at ${this.#config.host}`,
		);

		return true;
	}

	async createIssue(incident: Incident) {
		const description = await this.#renderDescription(incident, []);

		const { key } = await this.#webClient2.issues.createIssue({
			fields: {
				project: { key: this.#config.trackingIssue.projectKey },
				issuetype: { name: "Epic" },
				summary: incident.title,
				labels: this.#config.trackingIssue.labels,
				assignee: { id: this.self?.accountId },
				description,
				[this.#config.fields.epicName]: titleCase(incident.title),
				[this.#config.fields.breakingPriority]: {
					value: priorityName(incident.priority),
				},
				[this.#config.fields.chatRoomUid]: incident.chatRoomUid,
			},
		});

		this.#logger.info(`JIRA: created ${key} for ${incident.id}`);

		return key;
	}

	async sync(incident: Incident, state: IncidentState, log: LogEntry[]) {
		if (!incident.trackerUid) {
			return this.#warn("JIRA: missing issue key!");
		}

		const {
			priority,
			genesisAt,
			detectedAt,
			acknowledgedAt,
			mitigatedAt,
			resolvedAt,
		} = incident;

		const [description, point, comms] = await Promise.all([
			this.#renderDescription(incident, log),
			this.#point(incident.point),
			this.#comms(incident.comms),
		]);

		const tasks = [
			this.#webClient2.issues.editIssue({
				issueIdOrKey: incident.trackerUid,
				fields: {
					summary: incident.title,
					description,
					[this.#config.fields.genesis]: iso9075Toiso8601(genesisAt),
					[this.#config.fields.detected]: iso9075Toiso8601(detectedAt),
					[this.#config.fields.acknowledged]: iso9075Toiso8601(acknowledgedAt),
					[this.#config.fields.mitigated]: iso9075Toiso8601(mitigatedAt),
					[this.#config.fields.resolved]: iso9075Toiso8601(resolvedAt),
					[this.#config.fields.breakingPriority]: {
						value: priorityName(priority),
					},
					...point,
					...comms,
				},
			}),
		];

		if (this.#issueTransitions.get(incident.trackerUid) !== state) {
			tasks.push(
				this.#webClient3.issues.doTransition({
					issueIdOrKey: incident.trackerUid,
					transition: { id: this.#config.transitions[state].toString() },
				}),
			);

			this.#issueTransitions.set(incident.trackerUid, state);
		}

		Promise.allSettled(tasks).then((results) => {
			results.forEach((result, index) => {
				if (result.status === "rejected") {
					const req = index === 0 ? "editIssue" : "doTransition";
					this.#logger.error(`JIRA: ${req} failed! Reason: `, result.reason);
				}
			});
		});
	}

	async syncCommUpdate(
		{ trackerUid: issueIdOrKey }: Incident,
		{ text, createdBy }: LogEntry,
	) {
		if (!issueIdOrKey) {
			return this.#warn("JIRA: missing issue key!");
		}

		const accountId = await this.resolveUserId(null, createdBy);
		const fmttedUserId = accountId ? ` from ${this.fmtUser(accountId)}` : "";
		const fmttedText = this.#resolveChatUserIds(text);
		const comment = `Comm update${fmttedUserId}:\n\n${fmttedText}`;

		return this.#webClient2.issueComments.addComment({ issueIdOrKey, comment });
	}

	async syncComponents({ trackerUid, components }: Incident): Promise<unknown> {
		if (!trackerUid) {
			return this.#warn("JIRA: missing issue key!");
		}

		const componentsToAdd = components.map((c) => c.which.toLowerCase());
		const valid = await this.#getProjectComponents(
			this.#config.trackingIssue.projectKey,
		);

		const jiraComponents = valid.filter((c) => {
			return c.name && componentsToAdd.includes(c.name.toLowerCase());
		});

		if (componentsToAdd.length !== jiraComponents.length) {
			const diff = Math.abs(componentsToAdd.length - jiraComponents.length);
			this.#logger.warn(
				`JIRA: failed to sync ${diff} components to ${trackerUid}`,
			);
		}

		return this.#webClient3.issues.editIssue({
			issueIdOrKey: trackerUid,
			fields: { components: jiraComponents.map((j) => ({ id: j.id })) },
		});
	}

	async validComponentNames(components: string[]): Promise<string[]> {
		const valid = await this.#getProjectComponents(
			this.#config.trackingIssue.projectKey,
		);

		const validNames = valid.map((c) => c.name?.toLowerCase());

		return components.filter((c) => validNames.includes(c.toLowerCase()));
	}

	async newActionItem(
		{ id: incidentId, trackerUid: issueKey }: Incident,
		text: string,
		chatUserId = "Not Sure",
		contextUrl?: string | null,
	): Promise<[string, string] | [null, null]> {
		if (!issueKey) {
			return [null, null];
		}

		const aiSplit = text.split("=>");
		const summary = aiSplit[0].substring(0, 155); // summary can not be more than 155 characters
		const description = aiSplit[1] ?? summary;
		const accountId = this.#fmtUserCacheGet(this.#userCache, chatUserId);
		const data = { description, accountId, issueKey, contextUrl };

		const { key } = await this.#webClient2.issues.createIssue({
			fields: {
				project: { key: this.#config.actionItems.projectKey },
				issuetype: { name: "Task" },
				summary,
				labels: this.#config.actionItems.labels,
				description: actionItemDescriptionWikiTemplate({ data }),
				parent: { key: issueKey },
			},
		});

		this.#logger.info(`JIRA: created action item ${key} for ${incidentId}`);

		return [key, this.#issueKeyToUrl(key)];
	}

	addInterestedParty(issueKey: string, accountId: string): Promise<unknown> {
		this.#issueWatchers.set(issueKey + accountId, true);

		return this.#webClient3.issueWatchers.addWatcher({
			issueIdOrKey: issueKey,
			accountId,
		});
	}

	isAlreadyInterestedParty(issueKey: string, accountId: string): boolean {
		return this.#issueWatchers.has(issueKey + accountId);
	}

	async resolveUserId(
		query: string | null | undefined,
		chatUserId = "",
		userCache?: UserCache,
	) {
		const cache = userCache ?? this.#userCache;
		const userEntry = userCacheGet(cache, chatUserId);

		if (userEntry?.trackerUserId) {
			return userEntry.trackerUserId;
		}

		if (!query) {
			return null;
		}

		let result: User;

		try {
			[result] = await this.#webClient3.userSearch.findUsers({
				query,
				maxResults: 1,
			});
		} catch {
			this.#logger.error("JIRA: userSearch.findUsers failed!");
			return null;
		}

		if (!result?.accountId) {
			return null;
		}

		return result.accountId;
	}

	fmtUser(accountId: string): string {
		return `[~accountid:${accountId}]`;
	}

	fmtUidForSlack(issueKey: string): string {
		return `<${this.#issueKeyToUrl(issueKey)}|${issueKey}>`;
	}

	fmtUrlForSlack(issueUrl: string): string {
		return `<${issueUrl}|${this.#issueKeyFromUrl(issueUrl)}>`;
	}

	#issueKeyFromUrl(issueUrl: string): string {
		return issueUrl.split("/").pop() ?? "malformed!";
	}

	#issueKeyToUrl(issueKey: string): string {
		return `https://${this.#config.host}/browse/${issueKey}`;
	}

	#getProjectComponents(projectIdOrKey: string): Promise<ProjectComponent[]> {
		return this.#webClient3.projectComponents.getProjectComponents({
			projectIdOrKey,
		});
	}

	#resolveChatUserIds(text: string): string {
		return resolveChatUserIds(
			text,
			this.#config.chatUserIdRegex,
			this.#userCache,
			this.#fmtUserCacheGet,
		);
	}

	#fmtUserCacheGet = (userCache: UserCache, chatUserId: string): string => {
		const entry = userCacheGet(userCache, normalizeUserId(chatUserId));

		return entry?.trackerUserId
			? this.fmtUser(entry.trackerUserId)
			: chatUserId;
	};

	#renderDescription(incident: Incident, log: LogEntry[]): string {
		const data = this.#fmtDescriptionData(incident, log);
		return incidentDescriptionWikiTemplate({ data });
	}

	#fmtDescriptionData(incident: Incident, log: LogEntry[]) {
		return {
			createdBy: this.#fmtUserCacheGet(this.#userCache, incident.createdBy),
			createdAt: iso9075ToFriendlyShort(incident.createdAt),
			genesisAt: incident.genesisAt
				? iso9075ToFriendlyShort(incident.genesisAt)
				: null,
			detectedAt: incident.detectedAt
				? iso9075ToFriendlyShort(incident.detectedAt)
				: null,
			resolvedAt: incident.resolvedAt
				? iso9075ToFriendlyShort(incident.resolvedAt)
				: null,
			chatRoomName: this.#config.breakingRoomPrefix + incident.id,
			chatRoomUrl: this.#config.chatRoomUrl,
			chatRoomUid: incident.chatRoomUid,
			title: incident.title,
			summary: incident.summary,
			affected: incident.affected.map((a) => a.what),
			blockers: incident.blockers
				.filter((b) => isBlockerActive(b))
				.map((b) => b.whomst),
			factors: log
				.filter((l) => l.type === LogType.ContributingFactor)
				.map((l) => l.text),
			notes: [],
			timeline: log.map((l) => ({
				...l,
				text: logTextPrefix(l.type) + this.#resolveChatUserIds(l.text),
				createdAt: iso9075ToFriendlyShort(l.createdAt),
				createdBy: this.#fmtUserCacheGet(this.#userCache, l.createdBy),
			})),
			isIncidentActive: isIncidentActive(incident),
		};
	}

	async #point(point: string | null) {
		if (!point) {
			return {};
		}

		const accountId = await this.resolveUserId(null, point);

		if (!accountId) {
			return {};
		}

		return { [this.#config.fields.incidentPointPerson]: { accountId } };
	}

	async #comms(comms: string | null) {
		if (!comms) {
			return {};
		}

		const accountId = await this.resolveUserId(null, comms);

		if (!accountId) {
			return {};
		}

		return { [this.#config.fields.incidentCommsPerson]: { accountId } };
	}

	#warn(msg: string) {
		this.#logger.warn(msg);
		return Promise.resolve(msg);
	}
}
