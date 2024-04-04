import { priorityEmoji, priorityName } from "../../../../core/priority.js";
import { normalizeUserId } from "../../../../core/string.js";
import { isBlockerActive } from "../../../../data/blocker.js";
import {
	getStateOfInterest,
	isIncidentActive,
	isIncidentBlocked,
} from "../../../../data/incident.js";
import { allClear, blocked, fiery, incidentInactive } from "./emoji.js";

import type { Incident } from "../../../../data/incident.js";
import type { LogEntry } from "../../../../data/log.js";
import type { IssueTracker } from "../../../issue-tracker.js";
import type { SlackUidMap } from "../slack.js";

export const fmtIncidentTopic = (
	incident: Incident,
	formattedTrackerUid?: string,
): string => {
	const prefixes = [priorityName(incident.priority)];
	const incidentDetails = [];

	if (isIncidentBlocked(incident)) {
		incidentDetails.push(
			`Blocked on: ${incident.blockers
				.filter((b) => isBlockerActive(b))
				.map((b) => b.whomst)
				.join(",")}`,
		);

		prefixes.push("blocked");
	}

	if (incident.components.length > 0) {
		for (const component of incident.components) {
			prefixes.push(component.which);
		}
	}

	if (isIncidentActive(incident)) {
		const point = incident.point ? fmtUser(incident.point) : "_nobody_";
		const comms = incident.comms ? fmtUser(incident.comms) : "_nobody_";

		incidentDetails.push(`Point: ${point}`);
		incidentDetails.push(`Comms: ${comms}`);

		// only show triage if somebody picked it up
		if (incident.triage) {
			incidentDetails.push(`Triage: ${fmtUser(incident.triage)}`);
		}

		// only show engineering lead if somebody picked it up
		if (incident.engLead) {
			incidentDetails.push(`Eng: ${fmtUser(incident.engLead)}`);
		}
	}

	if (formattedTrackerUid) {
		incidentDetails.push(formattedTrackerUid);
	}

	const emoji = fmtTopicEmoji(incident);
	const prefix = fmtTopicPrefix(prefixes);
	const postfix = fmtTopicPostfix(incidentDetails);

	return `:${emoji}: ${prefix}*${incident.title.toUpperCase()}*${postfix}`;
};

export const fmtTopicEmoji = (incident: Incident): string => {
	if (isIncidentBlocked(incident)) {
		return blocked();
	}

	return isIncidentActive(incident)
		? priorityEmoji(incident.priority)
		: incidentInactive();
};

export const fmtTopicPrefix = (prefixes: string[]): string => {
	if (prefixes.length === 0) {
		return "";
	}

	return `${prefixes.map((x) => `[${x}]`).join("")} `;
};

export const fmtTopicPostfix = (details: string[]) => {
	if (details.length > 0) {
		return ` - ${details.join(", ")}`;
	}

	return "";
};

export const fmtIncidentTitle = (incident: Incident) => {
	const prefixes = [priorityName(incident.priority)];

	if (isIncidentBlocked(incident)) {
		prefixes.push("blocked");
	}

	if (incident.components.length > 0) {
		for (const component of incident.components) {
			prefixes.push(component.which);
		}
	}

	const prefix = fmtTopicPrefix(prefixes);

	return `${prefix}*${incident.title.toUpperCase()}*`;
};

export const fmtIncidentTitleShort = (
	incident: Incident,
	priorityName: string,
) => {
	const prefixes = [priorityName];
	const stateOfInterest = getStateOfInterest(incident);

	if (stateOfInterest) {
		prefixes.push(stateOfInterest.toLowerCase());
	}

	return fmtTopicPrefix(prefixes) + incident.title.toUpperCase();
};

export const fmtMainRoomTopic = (activeIncidents: Incident[]): string => {
	if (activeIncidents.length === 0) {
		return `${allClear()} All clear!`;
	}

	const fragments = activeIncidents
		.sort((a, b) => a.id - b.id)
		.map((incident) => {
			return `${fiery()} ${fmtChannel(incident.chatRoomUid)}`;
		});

	return `${fragments.join(" ")}     :point_right: \`.status\` for summary`;
};

export const fmtChannel = (channel: string | null): string => {
	return channel ? `<#${channel}>` : "";
};

export const fmtUser = (user: string | null): string => {
	return user ? `<@${user}>` : "";
};

export const fmtUrl = (url: string | null, linkText: string): string => {
	return url ? `<${url}|${encodeHtmlEntities(linkText)}>` : linkText;
};

export const fmtActionItem = (
	ai: LogEntry,
	tracker?: IssueTracker | null | undefined,
) => {
	return tracker && ai.contextUrl
		? `${tracker.fmtUrlForSlack(ai.contextUrl)}: ${ai.text}`
		: ai.text;
};

export const encodeHtmlEntities = (text: string): string => {
	return text
		.replace(/&/g, "&amp;")
		.replace(/>/g, "&gt;")
		.replace(/</g, "&lt;");
};

export const decodeHtmlEntities = (text: string): string => {
	return text
		.replace(/&gt;/g, ">")
		.replace(/&lt;/g, "<")
		.replace(/&amp;/g, "&");
};

export const fmtLeadsNoMention = (
	point: string | undefined,
	comms: string | undefined,
): string => {
	if (point && point === comms) {
		return `${insertDots(point)} on point and comms`;
	}

	const result = [];

	if (point) {
		result.push(`${insertDots(point)} on point`);
	}

	if (comms) {
		result.push(`${insertDots(comms)} on comms`);
	}

	return result.join(", ");
};

export const resolveUserIdsInline = (
	str: string,
	users: SlackUidMap,
): string => {
	const userIds = [...users.keys()];
	const possibleUserIds = [...userIds.map((u) => fmtUser(u)), ...userIds];
	const regex = new RegExp(possibleUserIds.join("|"), "g");

	const resolved = str.replace(regex, (id) => {
		return users.get(id) ?? users.get(normalizeUserId(id)) ?? id;
	});

	return resolved;
};

export const insertDots = (name: string): string => {
	const str = name.trim();

	if (str.length < 2) {
		return str;
	}

	if (str.length === 2) {
		return `${str.slice(0, 1)}.${str.slice(-1)}`;
	}

	if (str.includes(" ")) {
		return `${str.slice(0, 1)}.${str.slice(1, -1)}.${str.slice(-1)}`;
	}

	return `${str.slice(0, 1)}.${str.slice(1)}`;
};
