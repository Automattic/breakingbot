import { SocketModeClient } from "@slack/socket-mode";
import { LogLevel, WebClient } from "@slack/web-api";
import { Adapter, EnterMessage, LeaveMessage, TextMessage, User } from "hubot";
import {
	humanDateDiff,
	iso9075ToSlackDatetimeShort,
} from "../../../core/date.js";
import { core4String, getCore4 } from "../../../core/metrics.js";
import {
	isHighPriority,
	priorityDescription,
	priorityEmoji,
	priorityName,
} from "../../../core/priority.js";
import {
	isNonEmptyString,
	normalizeUserId,
	pluralize,
} from "../../../core/string.js";
import { isIncidentActive } from "../../../data/incident.js";
import { LogType } from "../../../data/schema/log-entry-schema.js";
import {
	affectedAddedBlocks,
	affectedBlocks,
	aiBlocks,
	blockerAddedBlocks,
	blockersBlocks,
	blockquoteBlock,
	breakingListBlocks,
	bulletList,
	componentsAddedBlocks,
	componentsBlocks,
	core4Block,
	divider,
	headerBlock,
	helpBlocks,
	historyBlocks,
	introNewIncidentBlocks,
	mitigatedBlocks,
	mrkdownBlock,
	newBreakingBlocks,
	notesBlocks,
	priorityBlocks,
	resolvedBlocks,
	richTextBlock,
	statusAllActiveBlocks,
	statusBlocks,
	summaryBlocks,
	summaryBodyBlock,
} from "./slack/blocks.js";
import {
	affected as affectedEmoji,
	allClear,
	announce,
	comms,
	component,
	factor,
	fiery,
	git,
	incidentCanceled,
	rip,
	siren,
	hiPriority,
	sob,
} from "./slack/emoji.js";
import {
	decodeHtmlEntities,
	fmtChannel,
	fmtIncidentTitleShort,
	fmtIncidentTopic,
	fmtUser,
} from "./slack/strings.js";

import type {
	AuthTestResponse,
	Block,
	CodedError,
	Logger as SlackLogger,
} from "@slack/web-api";
import type { Envelope, Robot } from "hubot";
import type { pino } from "pino";
import { config } from "../../../../config/index.js";
import type {
	AppConfig,
	PriorityConfig,
	SlackConfig,
} from "../../../../config/types.js";
import type { DatetimeIso9075 } from "../../../core/date.js";
import type { Blocker } from "../../../data/blocker.js";
import type { Incident, IncidentOverview } from "../../../data/incident.js";
import type { LogEntry } from "../../../data/log.js";
import type { ChatRoomUid, ChatUserId } from "../../../types/index.js";
import type { CommPlatform } from "../../comm-platform.js";
import type { IssueTracker } from "../../issue-tracker.js";

const HUBOT_ADAPTER_CONNECTED = "connected";
const HUBOT_CMD_DELIMITER = ".";
const HUBOT_ERROR = "error";
const MAX_BLOCKS_PER_MESSAGE = 50;
const MAX_CHANNEL_TOPIC_LENGTH = 250;
const RESERVED_KEYWORDS = ["channel", "group", "everyone", "here"];

export type SlackUidMap = Map<ChatUserId, string>;

export class Slack extends Adapter implements CommPlatform {
	name: string;
	self: AuthTestResponse | undefined;
	#config: SlackConfig;
	#socketClient: SocketModeClient;
	#webClient: WebClient;

	constructor(
		robot: Robot,
		socketClient: SocketModeClient,
		webClient: WebClient,
	) {
		super(robot);
		this.name = "Slack";
		this.#config = config.commPlatform;
		this.#socketClient = socketClient;
		this.#webClient = webClient;
	}

	async createIncidentRoom(channelName: string, initialUserIds: string[]) {
		this.robot.logger.info(
			`SLACK: creating #${channelName} with users ${initialUserIds.join(",")}`,
		);

		const response = await this.#webClient.conversations.create({
			name: channelName,
		});

		const { channel } = response;

		if (!channel || !channel.id || !channel.name) {
			this.robot.logger.error(`SLACK: failed create channel ${channelName}`);
			return {};
		}

		this.robot.logger.debug(`SLACK: created channel ${channelName}`);

		if (initialUserIds.length > 0) {
			this.#webClient.conversations.invite({
				channel: channel.id,
				users: initialUserIds.join(","),
			});
		}

		return { roomId: channel.id, roomName: channel.name };
	}

	notifyNewIncident(
		{ title, chatRoomUid, createdBy, priority }: Incident,
		mainChannel: string,
		notifyChannel?: string,
	) {
		if (!chatRoomUid) {
			return this.#failFast("notifyNewIncident: Missing chat room!");
		}

		console.log('>>> High');
		

		const emoji = priorityEmoji(priority);
		
		const fmtRoom = this.fmtRoom(chatRoomUid);
		const fmtUser = this.fmtUser(createdBy);
		const text = `:${emoji}: ${fmtRoom}: *${title.toUpperCase()}* started by ${fmtUser}`;
		const desc = `${fmtRoom} <!channel> started by ${fmtUser}`;
		const header = `:${hiPriority()}: :${emoji}: *Breaking Incident Started:*\n\n${title}`;

		const blocks = newBreakingBlocks(header, desc);



		console.log(emoji);
		console.log(blocks);
		console.log(text);

		const tasks = [this.#sendToChannel(mainChannel, blocks, text)];

		if (notifyChannel) {
			tasks.push(this.#sendToChannel(notifyChannel, blocks, text));
		}

		return Promise.allSettled(tasks);
	}

	notifyNewLowIncident(
		{ title, chatRoomUid, createdBy, priority }: Incident,
		mainChannel: string,
	) {
		if (!chatRoomUid) {
			return this.#failFast("notifyNewIncident: Missing chat room!");
		}

		console.log('>>>> Low');

		const emoji = priorityEmoji(priority);
		const fmtRoom = this.fmtRoom(chatRoomUid);
		const fmtUser = this.fmtUser(createdBy);
		const text = `:${emoji}: ${fmtRoom}: *${title.toUpperCase()}* started by ${fmtUser}`;

		return this.#sendToChannel(mainChannel, [mrkdownBlock(text)], text);
	}

	async introNewIncident(
		incident: Incident,
		config: AppConfig,
		formattedTrackerUid?: string,
	) {
		const { chatRoomUid, createdBy, priority, title } = incident;

		if (!chatRoomUid) {
			return this.#failFast("introNewIncident: Missing chat room!");
		}

		await this.#webClient.conversations.setTopic({
			channel: chatRoomUid,
			topic: fmtIncidentTopic(incident, formattedTrackerUid),
		});

		return this.#sendToChannel(
			chatRoomUid,
			introNewIncidentBlocks( 
				chatRoomUid,
				createdBy,
				priority,
				title,
				config,
				formattedTrackerUid,
			),
			`Tracking ${incident.title.toUpperCase()} in ${formattedTrackerUid}`,
		);
	}

	sendComponentsList(
		channel: string,
		components: string[],
		componentList: string,
		timestamp: string,
	) {
		return this.#replyThreaded(
			channel,
			componentsBlocks(components, componentList),
			`Components: ${components.join(", ")}`,
			timestamp,
		);
	}

	sendComponentsAdded(
		channel: string,
		added: string[],
		dupes: string[],
		rejected: string[],
		timestamp: string,
	) {
		return this.#replyThreaded(
			channel,
			componentsAddedBlocks(added, dupes, rejected),
			`Components added: ${added.join(", ")}; dupes: ${dupes.join(
				", ",
			)}; rejected: ${rejected.join(", ")}`,
			timestamp,
		);
	}

	sendNotesList(channel: string, notes: LogEntry[], timestamp: string) {
		return this.#replyThreaded(
			channel,
			notesBlocks(notes),
			`Notes: ${notes.length}`,
			timestamp,
		);
	}

	sendAffectedList(channel: string, affected: string[], timestamp: string) {
		return this.#replyThreaded(
			channel,
			affectedBlocks(affected),
			`Affected: ${affected.join(", ")}`,
			timestamp,
		);
	}

	sendAffectedAddedMessage(
		channel: string,
		added: string[],
		dupes: string[],
		timestamp: string,
	) {
		return this.#replyThreaded(
			channel,
			affectedAddedBlocks(added, dupes),
			`Affected added: ${added.join(", ")}`,
			timestamp,
		);
	}

	sendBlockersList(
		channel: string,
		blockers: Blocker[],
		timestamp: string,
	): Promise<unknown> {
		return this.#replyThreaded(
			channel,
			blockersBlocks(blockers),
			`Blockers: ${blockers.length}`,
			timestamp,
		);
	}

	sendBlockerAddedMessage(
		channel: string,
		blocker: Blocker,
		timestamp: string,
	): Promise<unknown> {
		return this.#replyThreaded(
			channel,
			blockerAddedBlocks(blocker),
			`Blocker added: ${blocker.whomst}${
				blocker.reason ? ` (${blocker.reason})` : ""
			}`,
			timestamp,
		);
	}

	sendSummary(channel: string, summary: string | null, timestamp: string) {
		return this.#replyThreaded(
			channel,
			summaryBlocks(summary),
			summary ?? "Use `.summary <incident summary>` to set",
			timestamp,
		);
	}

	sendSummaryUpdated(
		channel: string,
		summary: string,
		user: string,
		timestamp: string,
	) {
		return this.#replyThreaded(
			channel,
			[
				mrkdownBlock(`Thanks, ${fmtUser(user)}! I have updated the summary:`),
				blockquoteBlock(summary),
			],
			`Thanks, <@${user}>! I have updated the summary: "${summary}"`,
			timestamp,
		);
	}

	sendPointTakeover(
		channel: string,
		point: string,
		runbookUrl: string,
		timestamp: string,
	) {
		return this.#replyThreaded(
			channel,
			[
				headerBlock("Point Takeover"),
				mrkdownBlock(`Congrats <@${point}>, you are point!`),
				mrkdownBlock(`<${runbookUrl}|Breaking Incident Runbook> :closed_book:`),
				mrkdownBlock(
					"Please take a moment to ensure the `.summary` is up to date and be sure to add contributing `.factor`(s) as they are identified. Thanks!",
				),
			],
			`Congrats <@${point}>, you are point!`,
			timestamp,
		);
	}

	sendCommsTakeover(
		channel: string,
		comms: string,
		runbookUrl: string,
		timestamp: string,
	) {
		return this.#replyThreaded(
			channel,
			[
				headerBlock("Comms Takeover"),
				mrkdownBlock(`Congrats <@${comms}>, you are comms!`),
				mrkdownBlock(`<${runbookUrl}|Breaking Incident Runbook> :closed_book:`),
				mrkdownBlock(
					"Please take a moment to fill out the initial `.summary`, set one or more `.components`, and provide timely updates with `.notify`. Thanks!",
				),
			],
			`Congrats <@${comms}>, you are comms!`,
			timestamp,
		);
	}

	sendTriageTakeover(
		channel: string,
		triage: string,
		runbookUrl: string,
		timestamp: string,
	) {
		return this.#replyThreaded(
			channel,
			[
				headerBlock("Triage Takeover"),
				mrkdownBlock(`Congrats <@${triage}>, you are triage!`),
				mrkdownBlock(`<${runbookUrl}|Breaking Incident Runbook> :closed_book:`),
				mrkdownBlock(
					`Please make sure to tag all related tickets with a <#${channel}> tag. Thanks!`,
				),
			],
			`Congrats <@${triage}>, you are triage!`,
			timestamp,
		);
	}

	sendEngLeadTakeover(
		channel: string,
		engLead: string,
		runbookUrl: string,
		timestamp: string,
	) {
		return this.#replyThreaded(
			channel,
			[
				headerBlock("Engineer Lead Takeover"),
				mrkdownBlock(`Congrats <@${engLead}>, you are eng!`),
				mrkdownBlock(`<${runbookUrl}|Breaking Incident Runbook> :closed_book:`),
				mrkdownBlock(
					"Please dig thoroughly to help us understand all contributing factors. Thanks!",
				),
			],
			`Congrats <@${engLead}>, you are eng!`,
			timestamp,
		);
	}

	sendCommUpdate(
		channel: string,
		incident: Incident,
		text: string,
		createdBy: string,
	): Promise<unknown> {
		const formattedChannel = this.fmtRoom(incident.chatRoomUid);
		const formattedUser = this.fmtUser(createdBy);
		const formattedTitle = fmtIncidentTitleShort(
			incident,
			priorityName(incident.priority),
		);
		const update = `> :${announce()}:*${formattedChannel}: ${formattedTitle}*\n> ${text} —${formattedUser}`;
		return this.#sendToChannel(channel, [mrkdownBlock(update)], text);
	}

	sendMessageToRoom(channel: string, text: string) {
		return this.#sendToChannel(channel, [mrkdownBlock(text)], text);
	}

	replyToMessage(channel: string, text: string, timestamp?: string) {
		return this.#webClient.chat.postMessage({
			channel,
			blocks: [mrkdownBlock(text)],
			text,
			// biome-ignore lint/style/useNamingConvention: Slack defined
			thread_ts: timestamp,
		});
	}

	reactToMessage(channel: string, emoji: string, timestamp: string) {
		return this.#webClient.reactions.add({
			channel,
			name: emoji,
			timestamp,
		});
	}

	sendStatus(
		channel: string,
		incident: Incident,
		formattedTrackerUid?: string,
		_timestamp?: string,
	) {
		const status = isIncidentActive(incident) ? "active" : "inactive";
		const formattedTitle = fmtIncidentTitleShort(
			incident,
			priorityName(incident.priority),
		);

		return this.#sendToChannel(
			channel,
			statusBlocks(
				status,
				formattedTitle,
				getCore4(incident),
				formattedTrackerUid,
			),
			`${formattedTitle} is ${status}`,
		);
	}

	async sendStatusAllActive(
		channel: string,
		incidentOverview: IncidentOverview,
		tracker?: IssueTracker,
		_timestamp?: string,
	) {
		const { fiery, mitigated, inactive } = incidentOverview;

		const activeCount = fiery.length + mitigated.length;
		const text = `Breakings: ${activeCount} active, ${inactive.length} inactive`;
		const users = await this.#resolveUserRealNames(
			[...fiery, ...mitigated]
				.flatMap((i) => [i.point, i.comms])
				.filter((u): u is string => u !== null),
		);

		return this.#sendToChannel(
			channel,
			statusAllActiveBlocks(incidentOverview, users, tracker),
			text,
		);
	}

	sendErrorListToRoom(channel: string, errors: string[], title?: string) {
		const blocks = [];

		if (title) {
			blocks.push(headerBlock(title));
		}

		blocks.push(bulletList(errors));

		return this.#sendToChannel(
			channel,
			blocks,
			title ?? `Errors: ${errors.length}`,
		);
	}

	sendError(channel: string, errorMsg: string, timestamp: string) {
		const t1 = this.reactToMessage(channel, "exclamation", timestamp);
		const t2 = this.replyToMessage(channel, errorMsg, timestamp);
		return Promise.allSettled([t1, t2]);
	}

	sendGenesisUpdated(
		channel: string,
		genesisAt: DatetimeIso9075,
		userTimezone: string,
		timestamp: string,
	) {
		const localized = iso9075ToSlackDatetimeShort(genesisAt);

		return this.#replyThreaded(
			channel,
			[
				headerBlock("Incident Genesis Updated"),
				mrkdownBlock("This incident genesis is now set at:"),
				blockquoteBlock(`${genesisAt} +00:00 (UTC)`),
				mrkdownBlock(`(${localized} in \`${userTimezone}\`)`),
			],
			`This incident genesis is now set at: ${genesisAt} +00:00 (UTC)`,
			timestamp,
		);
	}

	sendDetectedUpdated(
		channel: string,
		detectedAt: DatetimeIso9075,
		userTimezone: string,
		timestamp: string,
	) {
		const localized = iso9075ToSlackDatetimeShort(detectedAt);

		return this.#replyThreaded(
			channel,
			[
				headerBlock("Incident Detected Updated"),
				mrkdownBlock("This incident detected is now set at:"),
				blockquoteBlock(`${detectedAt} +00:00 (UTC)`),
				mrkdownBlock(`(${localized} in \`${userTimezone}\`)`),
			],
			`This incident detected is now set at: ${detectedAt} +00:00 (UTC)`,
			timestamp,
		);
	}

	sendMitigated(
		channel: string,
		mitigatedAt: DatetimeIso9075,
		userTimezone: string | null,
		comms: string | null,
		messageUserId: string,
		timestamp: string,
	) {
		return this.#replyThreaded(
			channel,
			mitigatedBlocks(mitigatedAt, userTimezone, comms, messageUserId),
			`This incident is marked mitigated at: ${mitigatedAt} +00:00 (UTC)`,
			timestamp,
		);
	}

	sendResolved(
		incident: Incident,
		log: LogEntry[],
		tracker: IssueTracker | undefined,
		_timestamp: string,
	) {
		if (!incident.chatRoomUid) {
			return this.#failFast("sendResolved: missing chatRoomUid!");
		}

		return this.#sendToChannel(
			incident.chatRoomUid,
			resolvedBlocks(incident, log, tracker),
			`All clear! for incident ${incident.title.toUpperCase()}`,
		);
	}

	notifyResolvedIncident(
		{ title, chatRoomUid, priority, createdAt, resolvedAt }: Incident,
		mainChannel: string,
		notifyChannel?: string,
	) {
		if (!chatRoomUid || !resolvedAt) {
			return this.#failFast("notifyResolvedIncident: Bad input!");
		}

		const duration = humanDateDiff(createdAt, resolvedAt);
		const fmtChatRoom = this.fmtRoom(chatRoomUid);
		const fmtPriority = priorityName(priority);

		const blocks = [
			divider(),
			headerBlock(`ALL CLEAR! :${allClear()}:`),
			mrkdownBlock(
				`${fmtChatRoom}: [${fmtPriority}] *${title.toUpperCase()}* resolved after ${duration} :${rip()}:`,
			),
			divider(),
		];

		const text = `:${allClear()}: ${fmtChatRoom}: [${fmtPriority}] *${title.toUpperCase()}* resolved after ${duration} :${rip()}:`;
		const tasks = [this.#sendToChannel(mainChannel, blocks, text)];

		if (notifyChannel) {
			tasks.push(this.#sendToChannel(notifyChannel, blocks, text));
		}

		return Promise.allSettled(tasks);
	}

	notifyResolvedLowIncident(
		{ title, chatRoomUid, priority, createdAt, resolvedAt }: Incident,
		mainChannel: string,
	) {
		if (!chatRoomUid || !resolvedAt) {
			return this.#failFast("notifyResolvedLowIncident: Bad input!");
		}

		const duration = humanDateDiff(createdAt, resolvedAt);
		const fmtChatRoom = this.fmtRoom(chatRoomUid);
		const fmtPriority = priorityName(priority);
		const text = `:${allClear()}: ${fmtChatRoom}: [${fmtPriority}] *${title.toUpperCase()}* resolved after ${duration} :${rip()}:`;

		return this.#sendToChannel(mainChannel, [mrkdownBlock(text)], text);
	}

	sendCompleted(incident: Incident): Promise<unknown> {
		if (!incident.chatRoomUid) {
			return this.#failFast("sendCompleted: missing chatRoomUid!");
		}

		const blocks: Block[] = [
			divider(),
			headerBlock("Incident Complete"),
			mrkdownBlock("This channel will be archived shortly."),
			divider(),
		];

		const text = `Incident ${incident.title.toUpperCase()} marked completed`;

		return this.#sendToChannel(incident.chatRoomUid, blocks, text);
	}

	notifyCanceled(
		{ title: incidentTitle, priority: incidentPriority, chatRoomUid }: Incident,
		mainChannel: string,
		notifyChannel?: string,
	): Promise<unknown> {
		if (!chatRoomUid) {
			return this.#failFast("notifyCanceled: missing chatRoomUid!");
		}

		const channel = this.fmtRoom(chatRoomUid);
		const priority = priorityName(incidentPriority);
		const title = incidentTitle.toUpperCase();
		const text = `:${incidentCanceled()}: CANCELED: ~${channel}: [${priority}] ${title}~`;

		const tasks = [
			this.#sendToChannel(
				chatRoomUid,
				[
					divider(),
					headerBlock(`CANCELED :${incidentCanceled()}:`),
					mrkdownBlock(`~${channel}: ${title}~`),
					mrkdownBlock("This channel will be archived shortly."),
					divider(),
				],
				text,
			),
		];

		tasks.push(this.#sendToChannel(mainChannel, [mrkdownBlock(text)], text));

		if (notifyChannel && isHighPriority(incidentPriority)) {
			tasks.push(
				this.#sendToChannel(notifyChannel, [mrkdownBlock(text)], text),
			);
		}

		return Promise.allSettled(tasks);
	}

	notifyRestarted(
		{ chatRoomUid, priority: incidentPriority, title: incidentTitle }: Incident,
		mainChannel: string,
		notifyChannel?: string,
	) {
		if (!chatRoomUid) {
			return this.#failFast("notifyRestarted: missing chatRoomUid!");
		}

		const fmtChannel = this.fmtRoom(chatRoomUid);
		const emoji = priorityEmoji(incidentPriority);
		const priority = priorityName(incidentPriority);
		const title = incidentTitle.toUpperCase();
		const text = `:${emoji}: RESTARTED: ${fmtChannel}: [${priority}] *${title}*`;

		const tasks = [
			this.#sendToChannel(
				chatRoomUid,
				[
					headerBlock(`RESTARTED! :${fiery()}:`),
					mrkdownBlock(
						`${fmtChannel}: *${title}* <!channel> is restarted :${sob()}:`,
					),
				],
				text,
			),
		];

		tasks.push(this.#sendToChannel(mainChannel, [mrkdownBlock(text)], text));

		if (notifyChannel && isHighPriority(incidentPriority)) {
			tasks.push(
				this.#sendToChannel(notifyChannel, [mrkdownBlock(text)], text),
			);
		}

		return Promise.allSettled(tasks);
	}

	sendTimeParseError(
		channel: string,
		userInput: string,
		userTimezone: string,
		suggestion: string,
		timestamp: string,
	) {
		const t1 = this.reactToMessage(channel, "exclamation", timestamp);
		const t2 = this.#replyThreaded(
			channel,
			[
				headerBlock("Error parsing detection time"),
				mrkdownBlock(
					`Hmm, I couldn't understand \`${userInput}\` as a time (in \`${userTimezone}\`).`,
				),
				mrkdownBlock(suggestion),
			],
			`Error parsing \`${userInput}\` as a time (in \`${userTimezone}\``,
			timestamp,
		);

		return Promise.allSettled([t1, t2]);
	}

	sendRoomEnterWelcome(incident: Incident, user: string) {
		if (!incident.chatRoomUid) {
			return this.#failFast("sendRoomEnterWelcome: missing chatRoomUid!");
		}

		const channel = incident.chatRoomUid;

		return this.#webClient.chat.postEphemeral({
			channel,
			user,
			blocks: [
				mrkdownBlock(`Hi, <@${user}>! Welcome to <#${channel}>.\n\n`),
				headerBlock(incident.title.toUpperCase()),
				divider(),
				mrkdownBlock("*Summary:*"),
				summaryBodyBlock(incident.summary),
				divider(),
				core4Block(getCore4(incident)),
			],
			text: `Hi, <@${user}>! Welcome to <#${channel}>.`,
		});
	}

	sendAddedActionItem(
		channel: string,
		logEntry: LogEntry,
		aiTrackerUid: string | undefined | null,
		incidentTrackerUid: string | undefined | null,
		tracker: IssueTracker | undefined | null,
		timestamp: string,
	) {
		let body = "I've added an action item ";

		if (tracker && aiTrackerUid) {
			body += `${tracker.fmtUidForSlack(aiTrackerUid)} for `;
		}

		const escapedText = logEntry.text.replace(/`/g, "");

		body += `\`${escapedText}\``;

		if (tracker && incidentTrackerUid) {
			body += ` and linked it to parent ${tracker.fmtUidForSlack(
				incidentTrackerUid,
			)}.`;
		}

		return this.#replyThreaded(
			channel,
			[
				headerBlock("Added Action Item"),
				mrkdownBlock(body),
				mrkdownBlock("You can see all action items with `.ais`."),
			],
			`Added action item \`${escapedText}\``,
			timestamp,
		);
	}

	sendAiList(
		channel: string,
		ais: LogEntry[],
		tracker: IssueTracker | undefined | null,
		timestamp: string,
	) {
		return this.#replyThreaded(
			channel,
			aiBlocks(ais, tracker),
			`Action Items: ${ais.length}`,
			timestamp,
		);
	}

	sendBreakingList(
		channel: string,
		{
			fiery,
			mitigated,
			inactive,
		}: {
			fiery: Incident[];
			mitigated: Incident[];
			inactive: Incident[];
		},
		tracker: IssueTracker | undefined | null,
		timestamp: string,
	) {
		const activeCount = fiery.length + mitigated.length;
		const text = `Breakings: ${activeCount} active, ${inactive.length} inactive`;

		return this.#replyThreaded(
			channel,
			breakingListBlocks(fiery, mitigated, inactive, tracker),
			text,
			timestamp,
		);
	}

	sendAddedFactor(channel: string, logEntry: LogEntry, timestamp: string) {
		return this.#replyThreaded(
			channel,
			[
				headerBlock("Added Contributing Factor"),
				mrkdownBlock(
					`I've added \`${logEntry.text}\` as a contributing factor¹.`,
				),
				mrkdownBlock("You can see other identified factors with `.factors`."),
				mrkdownBlock(
					"_¹ <https://how.complexsystems.fail/#7|Why not root cause?>_",
				),
			],
			`Added contributing factor \`${logEntry.text}\``,
			timestamp,
		);
	}

	sendContributingFactorList(
		channel: string,
		factors: LogEntry[],
		timestamp: string,
	) {
		const defaultBlocks = [
			richTextBlock("None identified so far"),
			mrkdownBlock("Use `.factor <factor>` to add"),
		];

		const factorBlocks =
			factors.length > 0
				? factors.map((f) => mrkdownBlock(`:${factor()}: ${f.text}`))
				: null;

		return this.#replyThreaded(
			channel,
			[headerBlock("Contributing Factors"), ...(factorBlocks ?? defaultBlocks)],
			`Contributing Factors: ${factors.length}`,
			timestamp,
		);
	}

	sendPriorities(
		channel: string,
		config: PriorityConfig,
		timestamp: string,
	): Promise<unknown> {
		const keys = Object.keys(config.priorities).sort((a, b) => +a - +b);

		return this.#replyThreaded(
			channel,
			priorityBlocks(config),
			`Priorities: ${keys.map((k) => config.priorities[+k].name).join(", ")}`,
			timestamp,
		);
	}

	sendPriorityUpdated(
		channel: string,
		newPriority: number,
		timestamp: string,
	): Promise<unknown> {
		const pName = priorityName(newPriority);
		const emoji = priorityEmoji(newPriority);

		return this.#replyThreaded(
			channel,
			[
				headerBlock(`Incident is now ${pName} :${emoji}:`),
				mrkdownBlock(`I've set the priority to ${pName}.`),
			],
			`Priority set to ${pName}`,
			timestamp,
		);
	}

	sendAddedPr(
		channel: string,
		pr: LogEntry,
		timestamp: string,
	): Promise<unknown> {
		return this.#replyThreaded(
			channel,
			[
				headerBlock("Added PR"),
				mrkdownBlock(
					`I've added ${pr.text} to the list of code changes for this incident.`,
				),
			],
			`Added PR: ${pr.text}`,
			timestamp,
		);
	}

	sendPrsList(
		channel: string,
		prs: LogEntry[],
		timestamp: string,
	): Promise<unknown> {
		const verb = prs.length === 1 ? "is" : "are";
		const dobj = prs.length === 1 ? "PR" : "PRs";

		return this.#replyThreaded(
			channel,
			[
				headerBlock("Change Summary"),
				mrkdownBlock(
					`There ${verb} ${prs.length} ${dobj} attached to this incident.`,
				),
				...prs.map((pr) => mrkdownBlock(`:${git()}: ${pr.text}`)),
				mrkdownBlock("Use `.pr <url>` to add one."),
			],
			`PRs: ${prs.length}`,
			timestamp,
		);
	}

	/**
	 * Ready For Review
	 *
	 * Discrete sends to Slack to facilitate a threading per section UX
	 * on the receiving end.
	 */
	async sendBeginReview(incident: Incident, log: LogEntry[]): Promise<unknown> {
		if (!incident.chatRoomUid) {
			return this.#failFast("sendBeginReview: missing chatRoomUid!");
		}

		const { chatRoomUid, priority, title, affected, components } = incident;
		const titlePrefix = incident.trackerUid ? `${incident.trackerUid}: ` : "";

		await this.#sendToChannel(
			chatRoomUid,
			[
				headerBlock("<BEGIN INCIDENT REVIEW>"),
				mrkdownBlock(`*${titlePrefix}${incident.title.toUpperCase()}*`),
				mrkdownBlock(
					"_Please invite any relevant PR authors, team channels, etc to the review._",
				),
				mrkdownBlock(`> *Summary:*\n> \`\`\`${incident.summary}\`\`\``),
			],
			`*${titlePrefix}${title.toLocaleUpperCase()}* is ready for review`,
		);

		const factors = log
			.filter((l) => l.type === LogType.ContributingFactor)
			.map((l) => `> :${factor()}: ${l.text}`)
			.join("\n");

		await this.#sendToChannel(
			chatRoomUid,
			[
				mrkdownBlock(
					`> *Contributing Factors:*\n${factors}\n> Use \`.factor <factor>\` to add`,
				),
			],
			`Contributing Factors: ${factors.length}`,
		);

		await this.#sendToChannel(
			chatRoomUid,
			[
				mrkdownBlock(
					`> *Priority:* ${priorityName(priority)}\n> ${priorityDescription(
						priority,
					)}\n> Use \`.p1\` | \`.p2\` | \`.p3\` | \`.p4\` | \`p5\` to update`,
				),
			],
			`Priority: ${priorityName(priority)}`,
		);

		const core4 = getCore4(incident);

		await this.#sendToChannel(
			chatRoomUid,
			[mrkdownBlock(`> *Duration:*\n> ${core4String(core4)}`)],
			`Duration: ${core4.ttr}`,
		);

		const affcted = affected
			.map((a) => `> :${affectedEmoji()}: ${a.what}`)
			.join("\n");

		await this.#sendToChannel(
			chatRoomUid,
			[
				mrkdownBlock(
					`> *Affected:*\n${affcted}\n> Use \`.affected <item>\` to add`,
				),
			],
			`Affected: ${affcted.length}`,
		);

		const compnents = components
			.map((c) => `> :${component()}: ${c.which}`)
			.join("\n");

		await this.#sendToChannel(
			chatRoomUid,
			[
				mrkdownBlock(
					`> *Components:*\n${compnents}\n> Use \`.component <component>\` to add`,
				),
			],
			`Components: ${compnents.length}`,
		);

		return this.#sendToChannel(
			chatRoomUid,
			[
				mrkdownBlock(
					`<!channel> *${titlePrefix}${title.toUpperCase()} is in review*`,
				),
				bulletList(
					[
						"Read the emerging incident report above",
						"Create a thread anywhere you have questions, comments, or concerns",
						"Focus on areas that would reduce the likelihood of the incident recurring or improve our response to a similar incient",
						"Follow the suggested commands to edit or improve the report",
						"Allow one day to pass to make space for crowdsourced wisdom",
					],
					"Review Instructions",
				),
			],
			`${titlePrefix}${title.toUpperCase()} - read the emerging incident report in Slack`,
		);
	}

	async sendHistory(
		channel: string,
		incident: Incident,
		log: LogEntry[],
		timestamp: string,
		tracker?: IssueTracker,
	): Promise<unknown> {
		const trackerUid =
			tracker && incident.trackerUid
				? tracker.fmtUidForSlack(incident.trackerUid)
				: null;

		const slackUids = log
			.flatMap((l) => l.text.match(this.#config.userIdRegexPattern))
			.filter((t): t is string => t != null);

		const users = await this.#resolveUserRealNames([...new Set(slackUids)]);

		return this.#replyThreaded(
			channel,
			historyBlocks(incident, log, users, trackerUid),
			`Log: ${pluralize(log.length, "item")}`,
			timestamp,
		);
	}

	sendTrackingIssue(
		channel: string,
		incident: Incident,
		tracker: IssueTracker,
		timestamp: string,
	): Promise<unknown> {
		if (!incident.trackerUid) {
			return this.#replyThreaded(
				channel,
				[mrkdownBlock("No tracking issue found")],
				"No tracking issue found",
				timestamp,
			);
		}

		const formattedTrackerUid = tracker.fmtUidForSlack(incident.trackerUid);

		return this.#replyThreaded(
			channel,
			[mrkdownBlock(`This incident is tracked in ${formattedTrackerUid}`)],
			`Tracking issue: ${formattedTrackerUid}`,
			timestamp,
		);
	}

	sendHelpMessage(
		channel: string,
		config: AppConfig,
		timestamp: string,
	): Promise<unknown> {
		return this.#replyThreaded(
			channel,
			helpBlocks(config),
			`Help: ${config.runbookRootUrl}`,
			timestamp,
		);
	}

	sendCommandsMessage(
		channel: string,
		commands: string[],
		timestamp: string,
	): Promise<unknown> {
		return this.#replyThreaded(
			channel,
			commands.map((c) => mrkdownBlock(c)),
			`Commands: ${commands.length}`,
			timestamp,
		);
	}

	sendTutorialStep(
		channel: string,
		title: string,
		body: string,
	): Promise<unknown> {
		return this.#sendToChannel(
			channel,
			[mrkdownBlock(`*${title}*`), mrkdownBlock(body)],
			title,
		);
	}

	sendSocialTemplates(
		channel: string,
		templates: { title: string; text: string }[],
		timestamp: string,
	): Promise<unknown> {
		return this.#replyThreaded(
			channel,
			templates.flatMap((t) => [headerBlock(t.title), mrkdownBlock(t.text)]),
			"Social templates",
			timestamp,
		);
	}

	sendPointNag(incident: Incident, mainRoom: string): Promise<unknown> {
		if (!incident.chatRoomUid) {
			return this.#failFast("sendPointNag: missing chatRoomUid!");
		}

		const formattedRoom = this.fmtRoom(incident.chatRoomUid);
		const incidentRoomAlert = `> :${siren()}: *No .point set!*\n> Hey <!here>, nobody has grabbed point yet! Can somebody take it with \`.point\`?`;
		const mainRoomAlert = `> :${siren()}: *No .point set for ${incident.title.toUpperCase()}*\n> Can somebody take point in ${formattedRoom}?`;

		const t1 = this.#sendToChannel(
			incident.chatRoomUid,
			[mrkdownBlock(incidentRoomAlert)],
			"Nobody has grabbed point yet! Can somebody take it with `.point`?",
		);

		const t2 = this.#sendToChannel(
			mainRoom,
			[mrkdownBlock(mainRoomAlert)],
			"Nobody has grabbed point yet! Can somebody take it with `.point`?",
		);

		return Promise.allSettled([t1, t2]);
	}

	sendCommsNag(incident: Incident, mainRoom: string): Promise<unknown> {
		if (!incident.chatRoomUid) {
			return this.#failFast("sendCommsNag: missing chatRoomUid!");
		}

		const formattedRoom = this.fmtRoom(incident.chatRoomUid);
		const incidentRoomAlert = `> :${siren()}: *No .comms set!*\n> Hey <!here>, nobody has grabbed comms yet! Can somebody take it with \`.comms\`?`;
		const mainRoomAlert = `> :${siren()}: *No .comms set for ${incident.title.toUpperCase()}*\n> Can somebody take comms in ${formattedRoom}?`;

		const t1 = this.#sendToChannel(
			incident.chatRoomUid,
			[mrkdownBlock(incidentRoomAlert)],
			"Nobody has grabbed comms yet! Can somebody take it with `.comms`?",
		);

		const t2 = this.#sendToChannel(
			mainRoom,
			[mrkdownBlock(mainRoomAlert)],
			"Nobody has grabbed comms yet! Can somebody take it with `.comms`?",
		);

		return Promise.allSettled([t1, t2]);
	}

	sendNeedInitialCommNag(incident: Incident): Promise<unknown> {
		if (!incident.chatRoomUid) {
			return this.#failFast("sendNeedInitialCommNag: missing chatRoomUid!");
		}

		const mention = incident.comms ? this.fmtUser(incident.comms) : "<!here>";
		const alert = `> :${comms()}: *Need initial comm update!*\n> Hey ${mention}, we need a \`.summary\` of what we know so far for this incident.`;

		return this.#sendToChannel(
			incident.chatRoomUid,
			[mrkdownBlock(alert)],
			`Hey ${mention}, we need a \`.summary\` of what we know so far for this incident.`,
		);
	}

	sendNeedCommUpdateNag(incident: Incident): Promise<unknown> {
		if (!incident.chatRoomUid) {
			return this.#failFast("sendNeedInitialCommNag: missing chatRoomUid!");
		}

		const mention = incident.comms ? this.fmtUser(incident.comms) : "<!here>";
		const alert = `> :${comms()}: *Need comm update*\n> Hey ${mention}, please provide a comm update with \`.notify\`! :pigeon: :envelope:`;

		return this.#sendToChannel(
			incident.chatRoomUid,
			[mrkdownBlock(alert)],
			`Hey ${mention}, please provide a comm update with \`.notify\`!`,
		);
	}

	sendMaintenanceAlert(
		config: SlackConfig,
		channel?: string,
		message?: string,
	): Promise<unknown> {
		if (!channel) {
			return Promise.resolve();
		}

		const mention = config.botEngSubteamId
			? `Hey <!subteam^${config.botEngSubteamId}>, `
			: "";

		const msg = message
			? `:boom: ${mention}${message}`
			: `:boom: ${mention}SoMEthInG wENt wRonG!`;

		return this.#sendToChannel(channel, [mrkdownBlock(msg)], msg);
	}

	inviteUsers(channel: string, users: string): Promise<unknown> {
		return this.#webClient.conversations.invite({ channel, users });
	}

	async validateUser(userId: string): Promise<boolean> {
		try {
			const { user } = await this.#webClient.users.info({ user: userId });
			return user && !user.is_bot ? true : false;
		} catch {
			return false;
		}
	}

	async resolveUser(
		userId: string,
	): Promise<{ name: string | null; email?: string }> {
		try {
			const { user } = await this.#webClient.users.info({ user: userId });
			const name = user?.name ?? "Not Sure";

			if (!user?.profile) {
				return { name };
			}

			const {
				display_name: displayName,
				real_name: realName,
				email,
			} = user.profile;

			const vDisplayName = isNonEmptyString(displayName) ? displayName : null;
			const vRealName = isNonEmptyString(realName) ? realName : null;

			return { name: vDisplayName ?? vRealName ?? name, email };
		} catch {
			return { name: null };
		}
	}

	async resolveText(text: string): Promise<string> {
		return decodeHtmlEntities(await this.#resolveLinks(text, this.#webClient));
	}

	updateBreakingTopic(incident: Incident, tracker?: IssueTracker) {
		if (!incident.chatRoomUid) {
			return this.#failFast("updateBreakingTopic: missing chatRoomUid!");
		}

		const channel = incident.chatRoomUid;
		const formattedTrackerUid =
			tracker && incident.trackerUid
				? tracker.fmtUidForSlack(incident.trackerUid)
				: undefined;

		let topic = fmtIncidentTopic(incident, formattedTrackerUid);

		if (topic.length > MAX_CHANNEL_TOPIC_LENGTH) {
			// https://api.slack.com/methods/conversations.setTopic
			// truncate to MAX_TOPIC_LENGTH chars so we can always post
			topic = `${topic.substring(0, MAX_CHANNEL_TOPIC_LENGTH - 3)}...`;
		}

		return this.#webClient.conversations.setTopic({ channel, topic });
	}

	async getAlreadyInRooms(): Promise<{ [room: string]: boolean }> {
		const { channels } = await this.#webClient.users.conversations({
			// biome-ignore lint/style/useNamingConvention: Slack defined
			exclude_archived: true,
			limit: 800,
		});

		if (!channels) {
			return {};
		}

		return channels.reduce((acc: { [room: string]: boolean }, channel) => {
			if (!channel.id) {
				return acc;
			}

			acc[channel.id] = true;

			return acc;
		}, {});
	}

	joinRoom(channel: string) {
		return this.#webClient.conversations.join({ channel });
	}

	leaveRoom(channel: string) {
		return this.#webClient.conversations.leave({ channel });
	}

	archiveRoom(channel: string) {
		return this.#webClient.conversations.archive({ channel });
	}

	fmtRoom(channel: string | null): string {
		return fmtChannel(channel);
	}

	fmtUser(user: string): string {
		return fmtUser(user);
	}

	normalizeUserIdInput(user: string): string {
		return normalizeUserId(user);
	}

	async getPermalink(
		channel: string,
		timestamp: string,
	): Promise<string | undefined> {
		const result = await this.#webClient.chat.getPermalink({
			channel,
			// biome-ignore lint/style/useNamingConvention: Slack defined
			message_ts: timestamp,
		});
		return result.ok ? result.permalink : undefined;
	}

	async getUserTimezone(user: string): Promise<string> {
		const response = await this.#webClient.users.info({ user });
		return response.user?.tz || "UTC";
	}

	send(envelope: Envelope, text: string) {
		return this.sendMessageToRoom(envelope.room, text);
	}

	async run() {
		this.self = await this.#webClient.auth.test({});

		this.robot.logger.debug(this.self);
		this.robot.logger.info(
			`Logged in as @${this.self.user} in workspace ${this.self.team}`,
		);

		this.#socketClient.on("connected", this.#socketConnected.bind(this));
		this.#socketClient.on("error", this.#error.bind(this));
		this.#socketClient.on("message", async ({ event, ack }) => {
			await ack();

			if (!event.user || !event.channel || !event.text || !event.ts) {
				return;
			}

			if (event.user === this.self?.user_id) {
				this.robot.logger.debug("Ignoring message from self");
				return;
			}

			const user = new User(event.user, { room: event.channel });
			const text = event.text.startsWith(HUBOT_CMD_DELIMITER)
				? await this.resolveText(event.text)
				: event.text;

			this.robot.receive(new TextMessage(user, text, event.ts));
		});

		this.#socketClient.on("member_joined_channel", async ({ event, ack }) => {
			await ack();

			if (event.user === this.self?.user_id) {
				this.robot.logger.debug("Ignoring channel join by self");
				return;
			}

			const user = new User(event.user, { room: event.channel });
			this.robot.receive(new EnterMessage(user, null, event.ts));
		});

		this.#socketClient.on("member_left_channel", async ({ event, ack }) => {
			await ack();

			if (event.user === this.self?.user_id) {
				this.robot.logger.debug("Ignoring channel leave by self");
				return;
			}

			const user = new User(event.user, { room: event.channel });
			this.robot.receive(new LeaveMessage(user, null, event.ts));
		});

		await this.#socketClient.start();
	}

	async close() {
		await this.#socketClient.disconnect();
		super.close();
	}

	#socketConnected() {
		this.emit(HUBOT_ADAPTER_CONNECTED);
	}

	async #sendToChannel(channel: string, blocks: Block[], text: string) {
		if (blocks.length > MAX_BLOCKS_PER_MESSAGE) {
			for (let i = 0; i < blocks.length; i += MAX_BLOCKS_PER_MESSAGE) {
				const chunk = blocks.slice(i, i + MAX_BLOCKS_PER_MESSAGE);

				await this.#webClient.chat.postMessage({
					channel,
					blocks: chunk,
					text: `[chunked message] ${text}`,
					// biome-ignore lint/style/useNamingConvention: Slack defined
					unfurl_links: false,
				});
			}

			return;
		}

		return this.#webClient.chat.postMessage({
			channel,
			blocks,
			text,
			// biome-ignore lint/style/useNamingConvention: Slack defined
			unfurl_links: false,
		});
	}

	async #replyThreaded(
		channel: string,
		blocks: Block[],
		text: string,
		// biome-ignore lint/style/useNamingConvention: Slack defined
		thread_ts: string,
	) {
		if (blocks.length > MAX_BLOCKS_PER_MESSAGE) {
			for (let i = 0; i < blocks.length; i += MAX_BLOCKS_PER_MESSAGE) {
				const chunk = blocks.slice(i, i + MAX_BLOCKS_PER_MESSAGE);

				await this.#webClient.chat.postMessage({
					channel,
					blocks: chunk,
					text: `[chunked message] ${text}`,
					thread_ts,
					// biome-ignore lint/style/useNamingConvention: Slack defined
					unfurl_links: false,
				});
			}

			return;
		}

		return this.#webClient.chat.postMessage({
			channel,
			blocks,
			text,
			thread_ts,
			// biome-ignore lint/style/useNamingConvention: Slack defined
			unfurl_links: false,
		});
	}

	async #resolveUserRealNames(userIds: string[]) {
		const tasks = [];
		const users: SlackUidMap = new Map();

		for (const user of [...new Set(userIds)]) {
			tasks.push(this.#webClient.users.info({ user }));
		}

		const results = await Promise.allSettled(tasks);

		for (const result of results) {
			if (
				result.status === "fulfilled" &&
				result.value.user &&
				result.value.user.id !== undefined
			) {
				if (result.value.user.profile?.display_name) {
					users.set(
						result.value.user.id,
						result.value.user.profile.display_name,
					);
				} else if (result.value.user.profile?.real_name) {
					users.set(result.value.user.id, result.value.user.profile.real_name);
				} else if (result.value.user.name) {
					users.set(result.value.user.id, result.value.user.name);
				} else {
					users.set(result.value.user.id, "Not Sure");
				}
			}
		}

		return users;
	}

	/**
	 * Parse and, in parallel, resolve Slack link details
	 *
	 * Props ye ole Hubot adapter:
	 * https://github.com/slackapi/hubot-slack/blob/b95707490356e2ce3ac7131796904d08b48201f6/src/message.coffee#L157
	 */
	async #resolveLinks(text: string, client: WebClient): Promise<string> {
		const regex = /<([@#!])?([^>|]+)(?:\|([^>]+))?>/g;

		regex.lastIndex = 0;
		let cursor = 0;
		const parts = [];

		let match = regex.exec(text);

		while (match !== null) {
			const [fullMatch, type, link, label] = match;

			parts.push(text.slice(cursor, match.index));

			if (label) {
				parts.push(this.#resolveWithLabel(type, link, label));
			} else {
				parts.push(this.#resolveWithoutLabel(fullMatch, type, link, client));
			}

			cursor = regex.lastIndex;
			if (match[0].length === 0) {
				regex.lastIndex++;
			}

			match = regex.exec(text);
		}

		parts.push(text.slice(cursor));

		return Promise.all(parts).then((resolvedParts) => resolvedParts.join(""));
	}

	#resolveWithLabel(type: string, link: string, label: string): string {
		if (type === "@") {
			return `<@${link}>`;
		}

		if (type === "#") {
			return `\#${label}`;
		}

		if (type === "!") {
			return label;
		}

		const normLink = link.replace(/^mailto:/, "");
		return label.includes(normLink) ? label : `${label} (${normLink})`;
	}

	#resolveWithoutLabel(
		fullMatch: string,
		type: string,
		link: string,
		client: WebClient,
	) {
		if (type === "@") {
			return `<@${link}>`;
		}

		if (type === "#") {
			return this.#resolveConversation(link, client);
		}

		if (type === "!" && RESERVED_KEYWORDS.includes(link)) {
			return `@${link}`;
		}

		if (type === "!") {
			return fullMatch;
		}

		return link.replace(/^mailto:/, "");
	}

	async #resolveConversation(
		id: ChatRoomUid,
		client: WebClient,
	): Promise<string> {
		try {
			const { channel } = await client.conversations.info({ channel: id });
			return channel ? `\#${channel.name}` : `<\#${id}>`;
		} catch (err) {
			this.robot.logger.error(err, `#resolveConversation: failed to get ${id}`);
			return `<\#${id}>`;
		}
	}

	#error(error: CodedError) {
		// this.robot.logger.error(error, "Slack error");
		this.robot.emit(HUBOT_ERROR, error);
	}

	#failFast(reason: string) {
		this.robot.logger.error(reason);
		process.exit(1); // process.exit() is discouraged but Hubot uses it for shutting down
		return Promise.resolve(); // unreachable, but makes TS happier elsewhere
	}
}

class PinoLogger implements SlackLogger {
	#pinoLogger: pino.Logger;
	#pinoToSlackLogLevels: { [key: string]: LogLevel } = {
		trace: LogLevel.DEBUG,
		debug: LogLevel.DEBUG,
		info: LogLevel.INFO,
		warn: LogLevel.WARN,
		error: LogLevel.ERROR,
		fatal: LogLevel.ERROR,
	};

	constructor(pinoLogger: pino.Logger) {
		this.#pinoLogger = pinoLogger;
	}

	debug(...msgs: unknown[]) {
		this.#pinoLogger.debug(msgs);
	}

	error(...msgs: unknown[]) {
		this.#pinoLogger.error(msgs);
	}

	info(...msgs: unknown[]) {
		this.#pinoLogger.info(msgs);
	}

	warn(...msgs: unknown[]) {
		this.#pinoLogger.warn(msgs);
	}

	getLevel(): LogLevel {
		const pinoLevel = this.#pinoLogger.level;

		if (!this.#pinoToSlackLogLevels[pinoLevel]) {
			return LogLevel.INFO;
		}

		return this.#pinoToSlackLogLevels[pinoLevel];
	}

	setLevel(logLevel: LogLevel) {
		this.#pinoLogger.level = logLevel;
	}

	// biome-ignore lint/suspicious/noEmptyBlockStatements: Slack defined, but unneeded
	setName() {}
}

// biome-ignore lint/style/noDefaultExport: loaded dynamically by hubot
export default {
	use(robot: Robot) {
		const appToken = process.env.SLACK_APP_TOKEN || "";
		const logger = new PinoLogger(robot.logger);

		return new Slack(
			robot,
			new SocketModeClient({ appToken, logger }),
			new WebClient(process.env.SLACK_BOT_TOKEN, { logger }),
		);
	},
};
