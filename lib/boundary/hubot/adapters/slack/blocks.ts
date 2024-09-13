import { gifConfig } from "../../../../../config/gifs.js";
import {
	humanDateDiff,
	humanRelativeNow,
	iso9075Now,
	iso9075ToSlackDatetimeShort,
	iso9075ToUtcDatetimeShort,
} from "../../../../core/date.js";
import { core4String } from "../../../../core/metrics.js";
import {
	isHighPriority,
	isReviewRequiredForPriority,
	priorityEmoji,
	priorityName,
	priorityUrl,
} from "../../../../core/priority.js";
import { logTextPrefix } from "../../../../core/string.js";
import { incidentSortByPriority } from "../../../../data/incident.js";
import { LogType } from "../../../../data/schema/log-entry-schema.js";
import {
	ai,
	allClear,
	comms,
	engLead,
	factor,
	git,
	hiPriority,
	incidentActive,
	logEmoji,
	lowPriority,
	point,
	rip,
	siren,
	tracker,
	triage,
} from "./emoji.js";
import {
	fmtActionItem,
	fmtChannel,
	fmtIncidentTitle,
	fmtLeadsNoMention,
	fmtUrl,
	fmtUser,
	resolveUserIdsInline,
} from "./strings.js";

import type {
	Block,
	DividerBlock,
	HeaderBlock,
	ImageBlock,
	RichTextBlock,
	SectionBlock,
} from "@slack/web-api";
import type { AppConfig, PriorityConfig } from "../../../../../config/types.js";
import type { DatetimeIso9075 } from "../../../../core/date.js";
import type { Core4 } from "../../../../core/metrics.js";
import type { Blocker } from "../../../../data/blocker.js";
import type { Incident, IncidentOverview } from "../../../../data/incident.js";
import type { LogEntry } from "../../../../data/log.js";
import type { IssueTracker } from "../../../issue-tracker.js";
import type { SlackUidMap } from "../slack.js";

export const richTextBlock = (text: string): RichTextBlock => {
	return {
		type: "rich_text",
		elements: [
			{
				type: "rich_text_section",
				elements: [
					{
						type: "text",
						text,
					},
				],
			},
		],
	};
};

export const mrkdownBlock = (text: string): SectionBlock => {
	return {
		type: "section",
		text: { type: "mrkdwn", text },
	};
};

export const mrkdownWithImgBlock = (
	text: string,
	img: { url: string; alt: string },
): SectionBlock => {
	return {
		type: "section",
		text: {
			type: "mrkdwn",
			text,
		},
		accessory: imageBlock(img.url, img.alt),
	};
};

export const headerBlock = (text: string): HeaderBlock => {
	return {
		type: "header",
		text: {
			type: "plain_text",
			text,
			emoji: true,
		},
	};
};

export const imageBlock = (url: string, altText: string): ImageBlock => {
	return {
		type: "image",
		// biome-ignore lint/style/useNamingConvention: Slack defined
		image_url: url,
		// biome-ignore lint/style/useNamingConvention: Slack defined
		alt_text: altText,
	};
};

export const bulletList = (items: string[], listHeader?: string) => {
	const list: RichTextBlock = {
		type: "rich_text",
		elements: [],
	};

	if (listHeader) {
		list.elements.push({
			type: "rich_text_section",
			elements: [
				{
					type: "text",
					text: `${listHeader}`,
					style: { bold: true },
				},
			],
		});
	}

	list.elements.push({
		type: "rich_text_list",
		style: "bullet",
		elements: items.map((item) => {
			return {
				type: "rich_text_section",
				elements: [
					{
						type: "text",
						text: item,
					},
				],
			};
		}),
	});

	return list;
};

export const mrkdownList = (
	items: string[],
	bulletPoint = "•",
	listHeader?: string,
) => {
	const blocks = [];

	if (listHeader) {
		blocks.push(headerBlock(listHeader));
	}

	for (const item of items) {
		blocks.push(mrkdownBlock(`${bulletPoint} ${item}`));
	}

	return blocks;
};

export const newBreakingBlocks = (
	title: string,
	desc: string
) => {
	return [
		divider(),
		mrkdownBlock(title),
		mrkdownBlock(desc),
		divider(),
	];
};

export const newLowBreakingBlocks = (
	title: string,
	channel: string,
	createdBy: string,
) => {
	return [
		divider(),
		headerBlock(title.toUpperCase()),
		mrkdownBlock(
			`:${lowPriority()}: <#${channel}>: ${title.toUpperCase()} started by <@${createdBy}>`,
		),
		divider(),
	];
};

export const introNewIncidentBlocks = (
	chatRoomUid: string,
	createdBy: string,
	priority: number,
	title: string,
	config: AppConfig,
	formattedTrackerUid?: string,
) => {

	const mrkDown = `<#${chatRoomUid}> <!channel> started by <@${createdBy}>`;
	const blocks = isHighPriority(priority)
		? newBreakingBlocks(title, mrkDown)
		: newLowBreakingBlocks(title, chatRoomUid, createdBy);

	if (formattedTrackerUid) {
		blocks.push(
			mrkdownBlock(
				`> *Tracking*\n>\n> :${tracker()}: Issue created to track this incident: ${formattedTrackerUid}\n\n`,
			),
		);
	}

	if (config.onCallTips) {
		blocks.push(mrkdownBlock(`> *On-Call Tips*\n>\n${config.onCallTips}`));
	}

	blocks.push(
		mrkdownBlock(
			// biome-ignore lint/style/useTemplate: easier to read this one this way
			"> *Next Steps*\n>\n" +
				"> Please nominate someone to run `.point` and `.comms` *ASAP*.\n>\n" +
				`> *<${config.runbookRootUrl}|Breaking Incident Runbook>*\n>\n` +
				`> ${howToPoint(config)}\n` +
				`> ${howToComms(config)}\n` +
				`> ${howToTriage(config)}\n` +
				`> ${howToEng(config)}\n>\n` +
				"> See `.commands` for help on interacting with the bot.\n",
		),
	);

	return blocks;
};

export const componentsBlocks = (
	components: string[],
	componentList?: string,
) => {
	const blocks: Block[] = [];

	if (components.length > 0) {
		blocks.push(headerBlock("Components"));
		blocks.push(bulletList(components));
	} else {
		blocks.push(headerBlock("No components set"));
		blocks.push(richTextBlock("This incident has no components set"));
	}

	blocks.push(
		mrkdownBlock(
			"Add with `.component <name>` or remove with `.componentrm <name>`",
		),
	);

	if (componentList) {
		blocks.push(
			mrkdownBlock(`See ${componentList} for a list of existing components`),
		);
	}

	return blocks;
};

export const componentsAddedBlocks = (
	added: string[],
	dupes: string[],
	rejected: string[],
	componentList?: string,
) => {
	const addedPlusDupes = [...added, ...dupes].sort();
	const blocks: Block[] = [headerBlock("Components")];

	if (addedPlusDupes.length > 0) {
		blocks.push(bulletList(addedPlusDupes, "Added to the incident:"));
	} else {
		blocks.push(richTextBlock("Added to the incident:"));
		blocks.push(richTextBlock("No components added!"));
	}

	if (rejected.length > 0) {
		blocks.push(bulletList(rejected, "Skipped these unknown components:"));
	}

	if (rejected.length > 0 && componentList) {
		blocks.push(
			mrkdownBlock(
				`Check out ${fmtUrl(componentList, "known components")} and try again.`,
			),
		);
	}

	return blocks;
};

export const notesBlocks = (notes: LogEntry[]) => {
	const blocks: Block[] = [];

	blocks.push(headerBlock("Notes"));

	if (notes.length > 0) {
		blocks.push(bulletList(notes.map((n) => n.text)));
	} else {
		blocks.push(richTextBlock("This incident doesn't have any notes yet."));
	}

	blocks.push(mrkdownBlock("Add with `.note <text>`"));

	return blocks;
};

export const affectedBlocks = (affected: string[]) => {
	const blocks: Block[] = [];

	if (affected.length > 0) {
		blocks.push(headerBlock("Affected"));
		blocks.push(bulletList(affected));
	} else {
		blocks.push(headerBlock("No affected set"));
		blocks.push(richTextBlock("This incident has no affected set"));
	}

	blocks.push(
		mrkdownBlock(
			"Add with `.affected <item>` or remove with `.affectedrm <item>`",
		),
	);

	return blocks;
};

export const affectedAddedBlocks = (added: string[], dupes: string[]) => {
	const blocks: Block[] = [headerBlock("Affected")];

	if (added.length > 0) {
		blocks.push(bulletList(added, "Added to the incident:"));
	} else {
		blocks.push(richTextBlock("Added to the incident:"));
		blocks.push(richTextBlock("No affected items added!"));
	}

	if (dupes.length > 0) {
		blocks.push(bulletList(dupes, "Already added to the incident:"));
	}

	return blocks;
};

export const blockersBlocks = (blockers: Blocker[]) => {
	const blocks: Block[] = [];

	if (blockers.length > 0) {
		const fmted = blockers.map(
			(b) => `\`${b.id}\`  *${b.whomst}*${b.reason ? `: _${b.reason}_` : ""}`,
		);

		blocks.push(headerBlock("Blockers"));
		blocks.push(mrkdownBlock(fmted.join("\n\n")));
	} else {
		blocks.push(headerBlock("No blockers"));
		blocks.push(richTextBlock("This incident is not blocked"));
	}

	blocks.push(
		mrkdownBlock(
			"Add with `.blocked <whomst> [=> <reason>]` or remove with `.unblocked <id>`",
		),
	);

	return blocks;
};

export const blockerAddedBlocks = (blocker: Blocker) => {
	const blocks: Block[] = [
		headerBlock("Blocker added"),
		mrkdownBlock(`This incident is now blocked on *${blocker.whomst}*.`),
	];

	if (blocker.reason) {
		blocks.push(blockquoteBlock(blocker.reason));
	}

	return blocks;
};

export const statusBlocks = (
	status: string,
	formattedTitle: string,
	core4: Core4,
	formattedTrackerUid?: string,
) => {
	const blocks: Block[] = [
		headerBlock(`This incident is ${status}`),
		mrkdownBlock(`\n${formattedTitle}`),
	];

	if (formattedTrackerUid) {
		blocks.push(mrkdownBlock(`Tracking: ${formattedTrackerUid}`));
	}

	blocks.push(core4Block(core4));

	return blocks;
};

export const statusAllActiveBlocks = (
	{ fiery, mitigated }: IncidentOverview,
	users: SlackUidMap,
	tracker?: IssueTracker,
) => {
	const blocks: Block[] = [];
	const numActive = fiery.length + mitigated.length;

	if (numActive === 0) {
		return [headerBlock(`All clear! :${allClear()}:`)];
	}

	incidentSortByPriority(fiery);
	incidentSortByPriority(mitigated);

	blocks.push(
		mrkdownBlock(
			`${
				numActive === 1
					? "There is *1 active incident*"
					: `There are *${numActive} active incidents*`
			} :${incidentActive()}:`,
		),
	);

	for (const incident of fiery) {
		const emoji = priorityEmoji(incident.priority);
		const title = fmtIncidentTitle(incident);
		const channel = fmtChannel(incident.chatRoomUid);
		const ago = humanRelativeNow(incident.createdAt);
		const headline = `:${emoji}: ${channel}: ${title}\n`;
		const point = incident.point ? users.get(incident.point) : undefined;
		const comms = incident.comms ? users.get(incident.comms) : undefined;
		const leads = fmtLeadsNoMention(point, comms);
		const byline = `\t\tstarted ${ago}${leads ? `, ${leads}` : ""}`;
		const tracking =
			tracker && incident.trackerUid
				? `, tracked in ${tracker.fmtUidForSlack(incident.trackerUid)}`
				: "";
		blocks.push(mrkdownBlock(headline + byline + tracking));
		blocks.push(divider());
	}

	for (const incident of mitigated) {
		const title = fmtIncidentTitle(incident);
		const channel = fmtChannel(incident.chatRoomUid);
		const ago = humanRelativeNow(incident.createdAt);
		blocks.push(
			mrkdownBlock(`${channel}: ${title} - mitigated, started ${ago}`),
		);
	}

	return blocks;
};

export const historyBlocks = (
	incident: Incident,
	log: LogEntry[],
	users: SlackUidMap,
	formattedTrackerUid: string | null,
) => {
	const channel = fmtChannel(incident.chatRoomUid);
	const preBreakingBlocks: Block[] = [];

	if (incident.genesisAt) {
		const genesisAt = iso9075ToUtcDatetimeShort(incident.genesisAt);
		const incidentEmoji = priorityEmoji(incident.priority);
		preBreakingBlocks.push(
			mrkdownBlock(`:${incidentEmoji}: \`${genesisAt}\` Incident started`),
		);
	}

	if (incident.detectedAt) {
		const detectedAt = iso9075ToUtcDatetimeShort(incident.detectedAt);
		preBreakingBlocks.push(
			mrkdownBlock(`:eyes: \`${detectedAt}\` Incident detected`),
		);
	}

	const createdAt = iso9075ToUtcDatetimeShort(incident.createdAt);
	const trackingBlurb = formattedTrackerUid
		? ` This history is also recorded in ${formattedTrackerUid}.`
		: "";

	const logBlocks = log.map((l) => {
		const emoji = logEmoji(l.type);
		const entryAt = iso9075ToUtcDatetimeShort(l.createdAt);
		const text = resolveUserIdsInline(l.text, users);
		const formattedText = fmtUrl(l.contextUrl, logTextPrefix(l.type) + text);
		return mrkdownBlock(`:${emoji}: \`${entryAt}\` ${formattedText}`);
	});

	return [
		mrkdownBlock(
			`Here is the full timeline of events in ${channel} to date.${trackingBlurb}`,
		),
		headerBlock("Timeline (UTC)"),
		...preBreakingBlocks,
		mrkdownBlock(`:rotating_light: \`${createdAt}\` Breaking channel started`),
		...logBlocks,
	];
};

const howToPoint = ({ runbookRootUrl, runbookPointUrl }: AppConfig) => {
	return `:${point()}: <${runbookPointUrl ?? runbookRootUrl}|How to run point>`;
};

const howToComms = ({ runbookRootUrl, runbookCommsUrl }: AppConfig) => {
	return `:${comms()}: <${runbookCommsUrl ?? runbookRootUrl}|How to run comms>`;
};

const howToTriage = ({ runbookRootUrl, runbookTriageUrl }: AppConfig) => {
	const url = runbookTriageUrl ?? runbookRootUrl;
	return `:${triage()}: <${url}|How to run triage>`;
};

const howToEng = ({ runbookRootUrl, runbookEngLeadUrl }: AppConfig) => {
	const url = runbookEngLeadUrl ?? runbookRootUrl;
	return `:${engLead()}: <${url}|How to run eng>`;
};

export const helpBlocks = (config: AppConfig) => {
	return [
		mrkdownBlock(`*<${config.runbookRootUrl}|Breaking Incident Runbook>*`),
		mrkdownBlock(
			`To start a new incident, head over to ${fmtChannel(
				config.breakingMainRoom,
			)} and \`.start <incident title>\``,
		),
		mrkdownBlock(howToPoint(config)),
		mrkdownBlock(howToComms(config)),
		mrkdownBlock(howToTriage(config)),
		mrkdownBlock(howToEng(config)),
		mrkdownBlock(
			"See `.commands` for a comprehensive list of supported commands.",
		),
	];
};

export const core4Block = (core4: Core4) => mrkdownBlock(core4String(core4));

export const divider = (): DividerBlock => {
	return {
		type: "divider",
	};
};

export const blockquoteBlock = (text: string) => {
	return {
		type: "rich_text",
		elements: [
			{
				type: "rich_text_quote",
				elements: [
					{
						type: "text",
						text,
					},
				],
			},
		],
	};
};

export const summaryBlocks = (summary: string | null) => {
	const blocks: Block[] = [headerBlock("Summary")];

	if (summary) {
		blocks.push(blockquoteBlock(summary));
	} else {
		blocks.push(richTextBlock("This incident has no summary so far"));
	}

	blocks.push(mrkdownBlock("Use `.summary <incident summary>` to update"));

	return blocks;
};

export const summaryBodyBlock = (summary: string | null) => {
	return summary
		? blockquoteBlock(summary)
		: mrkdownBlock("use `.summary <incident summary>` to set");
};

export const mitigatedBlocks = (
	mitigatedAt: DatetimeIso9075,
	userTimezone: string | null,
	comms: string | null,
	messageUserId: string,
) => {
	const blocks: Block[] = [
		headerBlock("Incident Mitigated"),
		mrkdownBlock("This incident is marked mitigated at:"),
		blockquoteBlock(`${mitigatedAt} +00:00 (UTC)`),
	];

	const who = [...new Set([comms, messageUserId])]
		.filter((u): u is string => u != null)
		.map((u) => `${fmtUser(u)}`)
		.join(" or ");

	if (userTimezone) {
		const localized = iso9075ToSlackDatetimeShort(mitigatedAt);
		blocks.push(mrkdownBlock(`(${localized} in \`${userTimezone}\`)`));
	} else {
		blocks.push(mrkdownBlock("Use `.mitigated <when>` if you need adjust."));
	}

	blocks.push(
		mrkdownBlock(
			`${who}, make sure to \`.notify\` to let people know how the issue was mitigated. Further comms updates aren't required, but _are_ appreciated!`,
		),
	);

	return blocks;
};

export const resolvedBlocks = (
	incident: Incident,
	log: LogEntry[],
	tracker: IssueTracker | undefined | null,
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: yeeup. I'll allow it. For now.
) => {
	const channel = incident.chatRoomUid;
	const title = incident.title.toUpperCase();
	const duration = humanDateDiff(incident.createdAt, iso9075Now());
	const gif = {
		url: gifConfig.fun[Math.floor(Math.random() * gifConfig.fun.length)],
		altText: "Random gif denoting relief incident is resolved",
	};

	const blocks = [
		divider(),
		headerBlock(`ALL CLEAR! :${allClear()}:`),
		mrkdownBlock(
			`<#${channel}>: ${title} is resolved after ${duration} :${rip()}:`,
		),
		imageBlock(gif.url, gif.altText),
	];

	const ais = log.filter((l) => l.type === LogType.ActionItem);

	if (ais.length > 0) {
		const numAis = ais.length;
		const fmtdAis = ais
			.map((a) => `:${ai()}: ${fmtActionItem(a, tracker)}`)
			.join("\n>");

		blocks.push(
			mrkdownBlock(
				`> *Action Items*\n>${
					numAis === 1
						? "There is 1 action item "
						: `There are ${numAis} action items `
				}attached to this incident.\n>${fmtdAis}`,
			),
		);
	}

	const prs = log.filter((l) => l.type === LogType.Pr);

	if (prs.length > 0) {
		const numPrs = prs.length;
		const fmtdPrs = prs.map((p) => `:${git()}: ${p.contextUrl}`).join("\n>");

		blocks.push(
			mrkdownBlock(
				`> *Change Summary*\n>${
					numPrs === 1 ? "There is 1 PR " : `There are ${numPrs} PRs `
				}attached to this incident.\n>${fmtdPrs}`,
			),
		);
	}

	const factors = log.filter((l) => l.type === LogType.ContributingFactor);

	if (factors.length > 0) {
		const numFac = factors.length;
		const fmtdFac = factors.map((f) => `:${factor()}: ${f.text}`).join("\n>");

		blocks.push(
			mrkdownBlock(
				`> *Contributing Factors*\n>${
					numFac === 1
						? "There is 1 contributing factor "
						: `There are ${numFac} contributing factors `
				}identified in this incident so far.\n>${fmtdFac}`,
			),
		);
	}

	const who: string[] = [];

	if (incident.point !== null) {
		who.push(fmtUser(incident.point));
	}
	if (incident.comms !== null && incident.comms !== incident.point) {
		who.push(fmtUser(incident.comms));
	}
	if (incident.point === null && incident.comms === null) {
		who.push("Someone");
	}

	const whoString = who.join(" or ");
	const priority = incident.priority;
	const pUrl = priorityUrl(priority);
	const pName = priorityName(priority);
	const fmtdPriority = pUrl ? `<${pUrl}|${pName}>` : pName;

	const nextSteps = isReviewRequiredForPriority(priority)
		? `> *Next Steps*\n>${whoString} should immediately \`.assign\` this incident to the owner of the affected component(s) whomst shall complete the report within one business day. If unsure, assign up to the relevant lead for triage.\n>\n>Use \`.next\` at anytime for guidance.`
		: `> *Next Steps*\n>${whoString} should verify our current *${fmtdPriority}* priority is accurate for this incident. If that still fits, the incident can be set \`.complete\` now!\n>\n>Otherwise, please adjust the priority appropriately and, if necessary, make ready for review. Use \`.next\` at anytime for guidance.`;

	blocks.push(mrkdownBlock(nextSteps));
	blocks.push(divider());

	return blocks;
};

export const aiBlocks = (
	ais: LogEntry[],
	tracker?: IssueTracker | undefined | null,
) => {
	const blocks: Block[] = [];

	if (ais.length > 0) {
		const items = ais.map((a) => fmtActionItem(a, tracker));
		blocks.push(...mrkdownList(items, `:${ai()}:`, "Action Items"));
	} else {
		blocks.push(headerBlock("No action items set"));
		blocks.push(richTextBlock("This incident has no action items"));
	}

	blocks.push(mrkdownBlock("Add with `.ai <title> [=> summary]`"));

	return blocks;
};

export const breakingListBlocks = (
	fieree: Incident[],
	mitigated: Incident[],
	inactive: Incident[],
	// biome-ignore lint/correctness/noUnusedVariables: @TODO: wire tracker issues here
	tracker: IssueTracker | undefined | null,
) => {
	const blocks: Block[] = [];

	incidentSortByPriority(fieree);
	incidentSortByPriority(mitigated);

	for (const incident of fieree) {
		const emoji = priorityEmoji(incident.priority);
		const channel = fmtChannel(incident.chatRoomUid);
		const title = fmtIncidentTitle(incident);
		blocks.push(mrkdownBlock(`:${emoji}: ${channel}: ${title}`));
	}

	for (const incident of mitigated) {
		const channel = fmtChannel(incident.chatRoomUid);
		const title = fmtIncidentTitle(incident);
		blocks.push(mrkdownBlock(`${channel}: ${title} - mitigated`));
	}

	for (const incident of inactive) {
		const channel = fmtChannel(incident.chatRoomUid);
		blocks.push(mrkdownBlock(`${channel}: All clear!`));
	}

	return blocks;
};

export const priorityBlocks = (config: PriorityConfig) => {
	const blocks: Block[] = [];

	const keys = Object.keys(config.priorities).sort((a, b) => +a - +b);

	for (const key of keys) {
		const name = config.priorities[+key].name;
		const emoji = config.priorities[+key].emoji;
		const isDefault = config.default === +key;
		blocks.push(
			headerBlock(`:${emoji}: ${name}${isDefault ? " [default]" : ""}`),
		);
		blocks.push(mrkdownBlock(config.priorities[+key].description));
	}

	return blocks;
};
