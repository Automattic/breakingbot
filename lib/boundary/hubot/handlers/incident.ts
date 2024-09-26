import { eq } from "drizzle-orm";
import {
	isDatetimeInFuture,
	isDatetimeLeftGtRight,
	iso9075Now,
	parseNaturalLanguageDate,
} from "../../../core/date.js";
import {
	ACK,
	CANCEL,
	COMPLETE,
	IncidentState,
	MITIGATE,
	RESOLVE,
	RESTART,
	RFR,
	TutorialState,
	UNRESOLVE,
	ffwIncident,
	ffwTutorial,
	newIncidentMachine,
} from "../../../core/fsm.js";
import {
	isHighPriority,
	isReportRequiredForPriority,
	isReviewRequiredForPriority,
	isValidPriority,
} from "../../../core/priority.js";
import {
	ackIncidentDb,
	ackMitigateIncidentDb,
	ackMitigateResolveIncidentDb,
	cancelIncidentDb,
	completeIncidentDb,
	detectedIncidentDb,
	genesisIncidentDb,
	incidentOverview,
	isIncidentActive,
	isIncidentBlocked,
	isIncidentUpdatable,
	mitigateIncidentDb,
	mitigateResolveIncidentDb,
	resolveIncidentDb,
	restartIncidentDb,
	rfrAnalysis,
	rfrIncidentDb,
	setIncidentAssignedDb,
	setIncidentCommsDb,
	setIncidentEngLeadDb,
	setIncidentPointDb,
	setIncidentPriorityDb,
	setIncidentSummaryDb,
	setIncidentTitleDb,
	setIncidentTriageDb,
	uncancelIncidentDb,
	unresolveIncidentDb,
} from "../../../data/incident.js";
import {
	addLogCommsUpdateDb,
	addLogEventDb,
	addLogPriorityDb,
	addLogSummaryUpdateDb,
	getLogAllDb,
} from "../../../data/log.js";
import { incidents } from "../../../data/schema/incident-schema.js";
import { userCacheGet } from "../../../data/user-cache.js";

import type { DatetimeIso9075 } from "../../../core/date.js";
import type { Incident } from "../../../data/incident.js";
import type { LogEntry } from "../../../data/log.js";
import type { BreakingBot } from "../../../types/index.js";
import type { CommPlatform } from "../../comm-platform.js";

export const incidentStart = async (
	robot: BreakingBot,
	title: string,
	createdBy: string,
	priority?: number,
) => {
	const { config } = robot;

	const result = await robot.db.transaction(async (tx) => {
		const now = iso9075Now();

		const [{ incidentId }] = await tx
			.insert(incidents)
			.values({
				title,
				priority: priority ?? config.priorities.default,
				createdBy,
				createdAt: now,
				updatedAt: now,
			})
			.returning({ incidentId: incidents.id });

		if (!incidentId) {
			robot.logger.error("Unable to save incident record!");
			tx.rollback();
			return;
		}

		const { roomId } = await robot.adapter.createIncidentRoom(
			config.breakingRoomPrefix + incidentId,
			[...new Set([...config.breakingInitialUsers, createdBy])],
		);

		if (!roomId) {
			robot.logger.error("Unable to create incident room!");
			tx.rollback();
			return;
		}

		const updateResult = await tx
			.update(incidents)
			.set({ chatRoomUid: roomId })
			.where(eq(incidents.id, incidentId))
			.returning();

		if (!updateResult || !updateResult[0].chatRoomUid) {
			robot.logger.error("Malformed incident record after room update!");
			tx.rollback();
			return;
		}

		return updateResult[0];
	});

	if (!result) {
		robot.logger.error("Incident start failure!");
		return;
	}

	const incident: Incident = {
		...result,
		affected: [],
		blockers: [],
		components: [],
	};

	// this should *never* actually happen as tx is suppose to roll back and
	// we graceful error return on the db result above
	if (!incident.chatRoomUid) {
		robot.logger.error("incidentStart: detected malformed incident record!");
		process.exit(1);
	}

	let fmtdUid: string | undefined;

	if (robot.tracker) {
		incident.trackerUid = await robot.tracker.createIssue(incident);

		if (incident.trackerUid) {
			await robot.db
				.update(incidents)
				.set({ trackerUid: incident.trackerUid, updatedAt: iso9075Now() })
				.where(eq(incidents.id, incident.id));

			fmtdUid = robot.tracker.fmtUidForSlack(incident.trackerUid);
		} else {
			robot.logger.error(`Unable to create tracker! incident: ${incident.id}`);
		}
	}

	robot.incidents[incident.chatRoomUid] = newIncidentMachine(incident);

	const tasks = [robot.adapter.introNewIncident(incident, config, fmtdUid)];

	if (isHighPriority(incident.priority)) {
		tasks.push(
			robot.adapter.notifyNewIncident(
				incident,
				config.breakingMainRoom,
				config.breakingNotifyRoom,
			),
		);
	} else {
		tasks.push(
			robot.adapter.notifyNewLowIncident(incident, config.breakingMainRoom),
		);
	}

	return Promise.allSettled(tasks);
};

export const incidentResolve = async (
	robot: BreakingBot,
	room: string,
	createdBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();
	const resolved = robot.incidents[room].action(RESOLVE);

	if (!resolved && isIncidentBlocked(incident)) {
		return robot.adapter.sendError(
			room,
			"Unable to resolve an incident with `.blockers`. Please `.unblock` them and then try again.",
			messageId,
		);
	}

	if (!resolved) {
		const errorMsg = "Unable to resolve an inactive incident.";
		return robot.adapter.sendError(room, errorMsg, messageId);
	}

	if (incident.acknowledgedAt && incident.mitigatedAt) {
		incident.resolvedAt = await resolveIncidentDb(robot.db, incident.id);
	} else if (incident.acknowledgedAt) {
		const [mitigated, resolved] = await mitigateResolveIncidentDb(
			robot.db,
			incident.id,
		);

		incident.mitigatedAt = mitigated;
		incident.resolvedAt = resolved;
	} else {
		const [acked, mitigated, resolved] = await ackMitigateResolveIncidentDb(
			robot.db,
			incident.id,
		);

		incident.acknowledgedAt = acked;
		incident.mitigatedAt = mitigated;
		incident.resolvedAt = resolved;
	}

	if (!incident.resolvedAt) {
		robot.incidents[room] = newIncidentMachine(incident);
		return robot.adapter.sendError(room, "DB update failed!", messageId);
	}

	let log: LogEntry[] = [];
	let url = undefined;

	try {
		[log, url] = await Promise.all([
			getLogAllDb(robot.db, incident.id),
			permalink(robot.adapter, room, messageId),
		]);
	} catch (error) {
		robot.logger.error(`Incident resolve error! ${JSON.stringify(error)}`);
	}

	const tasks = [
		robot.adapter.updateBreakingTopic(incident, robot.tracker),
		robot.adapter.sendResolved(incident, log, robot.tracker, messageId),
		addLogEventDb(robot.db, incident.id, "Incident resolved", createdBy, url),
	];

	if (isHighPriority(incident.priority)) {
		tasks.push(
			robot.adapter.notifyResolvedIncident(
				incident,
				robot.config.breakingMainRoom,
				robot.config.breakingNotifyRoom,
			),
		);
	} else {
		tasks.push(
			robot.adapter.notifyResolvedLowIncident(
				incident,
				robot.config.breakingMainRoom,
			),
		);
	}

	return Promise.allSettled(tasks);
};

export const incidentUnresolve = async (
	robot: BreakingBot,
	room: string,
	createdBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	if (!robot.incidents[room].action(UNRESOLVE)) {
		const errorMsg = "Unable to unresolve incident. Maybe `.start` a new one?";
		return robot.adapter.sendError(room, errorMsg, messageId);
	}

	const isStillResolved = await unresolveIncidentDb(robot.db, incident.id);

	if (isStillResolved) {
		robot.incidents[room] = newIncidentMachine(incident);
		return robot.adapter.sendError(room, "DB update failed!", messageId);
	}

	incident.resolvedAt = null;

	const url = await permalink(robot.adapter, room, messageId);
	const tasks = [
		robot.adapter.updateBreakingTopic(incident, robot.tracker),
		robot.adapter.replyToMessage(room, "Unresolved incident!", messageId),
		addLogEventDb(
			robot.db,
			incident.id,
			"Incident unresolved!",
			createdBy,
			url,
		),
	];

	return Promise.allSettled(tasks);
};

export const incidentRestart = async (
	robot: BreakingBot,
	room: string,
	createdBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	if (!robot.incidents[room].action(RESTART)) {
		const errorMsg = isIncidentActive(incident)
			? "Unable to restart an active incident!"
			: "Unable to restart incident. Maybe `.start` a new one?";

		return robot.adapter.sendError(room, errorMsg, messageId);
	}

	const restartedIncident = await restartIncidentDb(robot.db, incident.id);

	if (!restartedIncident) {
		robot.incidents[room] = newIncidentMachine(incident);
		return robot.adapter.sendError(room, "DB update failed!", messageId);
	}

	// reload the fsm
	robot.incidents[room] = newIncidentMachine(restartedIncident);

	const url = await permalink(robot.adapter, room, messageId);
	const tasks = [
		robot.adapter.updateBreakingTopic(restartedIncident, robot.tracker),
		robot.adapter.notifyRestarted(
			restartedIncident,
			robot.config.breakingMainRoom,
			robot.config.breakingNotifyRoom,
		),
		addLogEventDb(robot.db, incident.id, "Incident restarted!", createdBy, url),
	];

	return Promise.allSettled(tasks);
};

export const incidentCancel = async (
	robot: BreakingBot,
	room: string,
	createdBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	if (!robot.incidents[room].action(CANCEL)) {
		return robot.adapter.sendError(
			room,
			"Unable to cancel incident. Maybe `.next` will get you home?`",
			messageId,
		);
	}

	const canceledAt = await cancelIncidentDb(robot.db, incident.id);

	if (!canceledAt) {
		robot.incidents[room] = newIncidentMachine(incident);
		return robot.adapter.sendError(room, "DB update failed!", messageId);
	}

	incident.canceledAt = canceledAt;

	const url = await permalink(robot.adapter, room, messageId);
	const tasks = [
		robot.adapter.updateBreakingTopic(incident, robot.tracker),
		robot.adapter.notifyCanceled(
			incident,
			robot.config.breakingMainRoom,
			robot.config.breakingNotifyRoom,
		),
		addLogEventDb(robot.db, incident.id, "Incident canceled", createdBy, url),
	];

	return Promise.allSettled(tasks);
};

export const incidentUncancel = async (
	robot: BreakingBot,
	room: string,
	createdBy: string,
	messageId?: string,
) => {
	let incident = robot.incidents[room].data();

	if (robot.incidents[room].state() !== IncidentState.Canceled) {
		const errorMsg = "Unable to uncancel incident. Maybe `.start` a new one?";
		return robot.adapter.sendError(room, errorMsg, messageId);
	}

	const isStillCanceled = await uncancelIncidentDb(robot.db, incident.id);

	if (isStillCanceled) {
		robot.incidents[room] = newIncidentMachine(incident);
		return robot.adapter.sendError(room, "DB update failed!", messageId);
	}

	// reload the fsm
	robot.incidents[room] = newIncidentMachine({ ...incident, canceledAt: null });
	incident = robot.incidents[room].data();

	const url = await permalink(robot.adapter, room, messageId);
	const tasks = [
		robot.adapter.replyToMessage(room, "Uncanceled incident!", messageId),
		robot.adapter.updateBreakingTopic(incident, robot.tracker),
		addLogEventDb(
			robot.db,
			incident.id,
			"Incident uncanceled!",
			createdBy,
			url,
		),
	];

	return Promise.allSettled(tasks);
};

export const incidentSetSummary = async (
	robot: BreakingBot,
	room: string,
	summary: string,
	createdBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	const [result] = await setIncidentSummaryDb(robot.db, incident.id, summary);

	if (result?.summary !== summary) {
		return robot.adapter.sendError(room, "Failed to set summary!", messageId);
	}

	incident.summary = summary;

	const url = await permalink(robot.adapter, room, messageId);
	const tasks = [
		robot.adapter.sendSummaryUpdated(room, summary, createdBy, messageId),
		addLogSummaryUpdateDb(robot.db, incident.id, summary, createdBy, url),
	];

	return Promise.allSettled(tasks);
};

export const incidentSetPoint = async (
	robot: BreakingBot,
	room: string,
	point: string,
	createdBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	if (point === incident.point) {
		return robot.adapter.reactToMessage(room, "ok_hand", messageId);
	}

	const entry = userCacheGet(robot.users, point);
	const isValid = entry ? true : await robot.adapter.validateUser(point);

	if (!isValid) {
		return robot.adapter.reactToMessage(room, "exclamation", messageId);
	}

	const { runbookPointUrl, runbookRootUrl } = robot.config;
	const runbookUrl = runbookPointUrl ?? runbookRootUrl;

	const [result] = await setIncidentPointDb(robot.db, incident.id, point);

	if (result?.point !== point) {
		return robot.adapter.sendError(room, "Failed to set point!", messageId);
	}

	incident.point = point;

	const url = await permalink(robot.adapter, room, messageId);
	const tasks = [
		robot.adapter.updateBreakingTopic(incident, robot.tracker),
		robot.adapter.sendPointTakeover(room, point, runbookUrl, messageId),
		addLogEventDb(
			robot.db,
			incident.id,
			`${point} is now on point`,
			createdBy,
			url,
		),
	];

	if (robot.incidents[room].action(ACK)) {
		tasks.push(incidentAcknowledge(robot, room, createdBy, messageId, url));
	}

	return Promise.allSettled(tasks);
};

export const incidentSetComms = async (
	robot: BreakingBot,
	room: string,
	comms: string,
	createdBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	if (comms === incident.comms) {
		return robot.adapter.reactToMessage(room, "ok_hand", messageId);
	}

	const entry = userCacheGet(robot.users, comms);
	const isValid = entry ? true : await robot.adapter.validateUser(comms);

	if (!isValid) {
		return robot.adapter.reactToMessage(room, "exclamation", messageId);
	}

	const { runbookCommsUrl, runbookRootUrl } = robot.config;
	const runbookUrl = runbookCommsUrl ?? runbookRootUrl;

	const [result] = await setIncidentCommsDb(robot.db, incident.id, comms);

	if (result?.comms !== comms) {
		return robot.adapter.sendError(room, "Failed to set comms!", messageId);
	}

	incident.comms = comms;

	const url = await permalink(robot.adapter, room, messageId);
	const tasks = [
		robot.adapter.sendCommsTakeover(room, comms, runbookUrl, messageId),
		robot.adapter.updateBreakingTopic(incident, robot.tracker),
		addLogEventDb(
			robot.db,
			incident.id,
			`${comms} is now on comms`,
			createdBy,
			url,
		),
	];

	if (robot.incidents[room].action(ACK)) {
		tasks.push(incidentAcknowledge(robot, room, createdBy, messageId, url));
	}

	return Promise.allSettled(tasks);
};

export const incidentSetTriage = async (
	robot: BreakingBot,
	room: string,
	triage: string,
	createdBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	if (triage === incident.triage) {
		return robot.adapter.reactToMessage(room, "ok_hand", messageId);
	}

	const entry = userCacheGet(robot.users, triage);
	const isValid = entry ? true : await robot.adapter.validateUser(triage);

	if (!isValid) {
		return robot.adapter.reactToMessage(room, "exclamation", messageId);
	}

	const { runbookTriageUrl, runbookRootUrl } = robot.config;
	const runbookUrl = runbookTriageUrl ?? runbookRootUrl;

	const [result] = await setIncidentTriageDb(robot.db, incident.id, triage);

	if (result?.triage !== triage) {
		return robot.adapter.sendError(room, "Failed to set triage!", messageId);
	}

	incident.triage = triage;

	const url = await permalink(robot.adapter, room, messageId);
	const tasks = [
		robot.adapter.sendTriageTakeover(room, triage, runbookUrl, messageId),
		robot.adapter.updateBreakingTopic(incident, robot.tracker),
		addLogEventDb(
			robot.db,
			incident.id,
			`${triage} is now on triage`,
			createdBy,
			url,
		),
	];

	return Promise.allSettled(tasks);
};

export const incidentSetEngLead = async (
	robot: BreakingBot,
	room: string,
	engLead: string,
	createdBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	if (engLead === incident.engLead) {
		return robot.adapter.reactToMessage(room, "ok_hand", messageId);
	}

	const entry = userCacheGet(robot.users, engLead);
	const isValid = entry ? true : await robot.adapter.validateUser(engLead);

	if (!isValid) {
		return robot.adapter.reactToMessage(room, "exclamation", messageId);
	}

	const { runbookEngLeadUrl, runbookRootUrl } = robot.config;
	const runbookUrl = runbookEngLeadUrl ?? runbookRootUrl;

	const [result] = await setIncidentEngLeadDb(robot.db, incident.id, engLead);

	if (result?.engLead !== engLead) {
		return robot.adapter.sendError(room, "Failed to set eng!", messageId);
	}

	incident.engLead = engLead;

	const url = await permalink(robot.adapter, room, messageId);
	const tasks = [
		robot.adapter.sendEngLeadTakeover(room, engLead, runbookUrl, messageId),
		robot.adapter.updateBreakingTopic(incident, robot.tracker),
		addLogEventDb(
			robot.db,
			incident.id,
			`${engLead} is now on eng`,
			createdBy,
			url,
		),
	];

	return Promise.allSettled(tasks);
};

export const incidentSetTitle = async (
	robot: BreakingBot,
	room: string,
	newTitle: string,
	createdBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	const [result] = await setIncidentTitleDb(robot.db, incident.id, newTitle);

	if (result?.title !== newTitle) {
		return robot.adapter.sendError(room, "Failed to set new title!", messageId);
	}

	const oldTitle = incident.title;
	incident.title = newTitle;

	const url = await permalink(robot.adapter, room, messageId);
	const tasks = [
		robot.adapter.reactToMessage(room, "ok_hand", messageId),
		robot.adapter.updateBreakingTopic(incident, robot.tracker),
		addLogEventDb(
			robot.db,
			incident.id,
			`old title: ${oldTitle}\n\nnew title: ${newTitle}`,
			createdBy,
			url,
		),
	];

	return Promise.allSettled(tasks);
};

export const incidentAcknowledge = async (
	robot: BreakingBot,
	room: string,
	createdBy: string,
	messageId?: string,
	contextUrl?: string,
) => {
	if (robot.incidents[room].state() !== IncidentState.Acknowledged) {
		return robot.adapter.reactToMessage(room, "exclamation", messageId);
	}

	const incident = robot.incidents[room].data();

	incident.acknowledgedAt = await ackIncidentDb(robot.db, incident.id);

	if (!incident.acknowledgedAt) {
		robot.logger.error("incidentAcknowledge: DB ack failed!");
		return robot.adapter.replyToMessage(room, "DB: ack failed!", messageId);
	}

	return addLogEventDb(
		robot.db,
		incident.id,
		"Incident acked (both comms and point are set)",
		createdBy,
		contextUrl,
	);
};

export const incidentMitigate = async (
	robot: BreakingBot,
	room: string,
	createdBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	if (!robot.incidents[room].action(MITIGATE)) {
		const errorMsg = "Unable to mitigate an inactive incident.";
		return robot.adapter.sendError(room, errorMsg, messageId);
	}

	if (incident.acknowledgedAt) {
		incident.mitigatedAt = await mitigateIncidentDb(
			robot.db,
			incident.id,
			iso9075Now(),
		);
	} else {
		const [acked, mitigated] = await ackMitigateIncidentDb(
			robot.db,
			incident.id,
		);

		incident.acknowledgedAt = acked;
		incident.mitigatedAt = mitigated;
	}

	if (!incident.mitigatedAt) {
		robot.incidents[room] = newIncidentMachine(incident);
		return robot.adapter.sendError(room, "DB update failed!", messageId);
	}

	const url = await permalink(robot.adapter, room, messageId);
	const tasks = [
		robot.adapter.sendMitigated(
			room,
			incident.mitigatedAt,
			null,
			incident.comms,
			createdBy,
			messageId,
		),
		addLogEventDb(robot.db, incident.id, "Incident mitigated", createdBy, url),
	];

	return Promise.allSettled(tasks);
};

export const incidentSetMitigated = async (
	robot: BreakingBot,
	room: string,
	userInput: string,
	createdBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	if (
		!robot.incidents[room].action(MITIGATE) &&
		!isIncidentUpdatable(incident)
	) {
		const errorMsg = "Unable to mitigate an inactive incident.";
		return robot.adapter.sendError(room, errorMsg, messageId);
	}

	const userTimezone = await robot.adapter.getUserTimezone(createdBy);
	let mitigatedAt: DatetimeIso9075;

	try {
		mitigatedAt = parseNaturalLanguageDate(userInput, userTimezone);
	} catch (_e) {
		return robot.adapter.sendTimeParseError(
			room,
			userInput,
			userTimezone,
			"Maybe try one of <https://sugarjs.com/docs/#/DateParsing|these formats> or just `.mitigated` to set the mitigation time to now?",
			messageId,
		);
	}

	if (isDatetimeInFuture(mitigatedAt)) {
		robot.incidents[room] = newIncidentMachine(incident);
		return robot.adapter.sendError(
			room,
			"Woah there, time traveler! Mitigated cannot be in the future!",
			messageId,
		);
	}

	if (incident.acknowledgedAt) {
		incident.mitigatedAt = await mitigateIncidentDb(
			robot.db,
			incident.id,
			mitigatedAt,
		);
	} else {
		const [acked, mitigated] = await ackMitigateIncidentDb(
			robot.db,
			incident.id,
			mitigatedAt,
		);

		incident.acknowledgedAt = acked;
		incident.mitigatedAt = mitigated;
	}

	if (!incident.mitigatedAt) {
		robot.incidents[room] = newIncidentMachine(incident);
		return robot.adapter.sendError(room, "DB update failed!", messageId);
	}

	const url = await permalink(robot.adapter, room, messageId);
	const tasks = [
		robot.adapter.sendMitigated(
			room,
			incident.mitigatedAt,
			userTimezone,
			incident.comms,
			createdBy,
			messageId,
		),
		addLogEventDb(
			robot.db,
			incident.id,
			`Incident mitigated set to ${mitigatedAt}`,
			createdBy,
			url,
		),
	];

	return Promise.allSettled(tasks);
};

export const incidentReadyForReview = async (
	robot: BreakingBot,
	room: string,
	createdBy: string,
	messageId?: string,
) => {
	if (robot.incidents[room].state() === IncidentState.ReadyForReview) {
		const errorMsg = "Review currently in progress!";
		return robot.adapter.sendError(room, errorMsg, messageId);
	}

	const incident = robot.incidents[room].data();

	if (isIncidentActive(incident)) {
		const errorMsg = "Incident must be resolved first!";
		return robot.adapter.sendError(room, errorMsg, messageId);
	}

	const tasks = [];

	if (robot.incidents[room].action(RFR)) {
		incident.readyForReviewAt = await rfrIncidentDb(robot.db, incident.id);

		if (!incident.readyForReviewAt) {
			robot.incidents[room] = newIncidentMachine(incident);
			ffwIncident(robot.incidents[room]);
			return robot.adapter.sendError(room, "DB update failed!", messageId);
		}

		const note = "Incident marked ready for review";
		const log = await getLogAllDb(robot.db, incident.id);
		tasks.push(robot.adapter.sendBeginReview(incident, log, messageId));
		const url = await permalink(robot.adapter, room, messageId);
		tasks.push(addLogEventDb(robot.db, incident.id, note, createdBy, url));
	} else {
		const title = "Unable to set ready for review";
		const reasons = rfrAnalysis(incident);
		tasks.push(robot.adapter.sendErrorListToRoom(room, reasons, title));
		tasks.push(robot.adapter.reactToMessage(room, "exclamation", messageId));
	}

	return Promise.allSettled(tasks);
};

export const incidentComplete = async (
	robot: BreakingBot,
	room: string,
	createdBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	if (!robot.incidents[room].action(COMPLETE)) {
		return robot.adapter.reactToMessage(room, "exclamation", messageId);
	}

	incident.completedAt = await completeIncidentDb(robot.db, incident.id);

	if (!incident.completedAt) {
		robot.incidents[room] = newIncidentMachine(incident);
		ffwIncident(robot.incidents[room]);
		return robot.adapter.sendError(room, "DB update failed!", messageId);
	}

	const url = await permalink(robot.adapter, room, messageId);

	const tasks = [
		robot.adapter.sendCompleted(incident, messageId),
		addLogEventDb(
			robot.db,
			incident.id,
			"Incident marked completed",
			createdBy,
			url,
		),
	];

	if (robot.reporter && isReportRequiredForPriority(incident.priority)) {
		const log = await getLogAllDb(robot.db, incident.id);
		const reportUrl = await robot.reporter.draft(incident, log, createdBy);
		tasks.push(robot.adapter.sendMessageToRoom(room, `Report: ${reportUrl}`));
	}

	return Promise.allSettled(tasks);
};

export const incidentSetGenesis = async (
	robot: BreakingBot,
	room: string,
	userInput: string,
	createdBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();
	const userTimezone = await robot.adapter.getUserTimezone(createdBy);

	let genesisAt: DatetimeIso9075;

	try {
		genesisAt = parseNaturalLanguageDate(userInput, userTimezone);
	} catch (_e) {
		return robot.adapter.sendTimeParseError(
			room,
			userInput,
			userTimezone,
			"Maybe try one of <https://sugarjs.com/docs/#/DateParsing|these formats>?",
			messageId,
		);
	}

	if (isDatetimeLeftGtRight(genesisAt, incident.createdAt)) {
		return robot.adapter.sendError(
			room,
			"Woah there, time traveler! Genesis must be before incident start!",
			messageId,
		);
	}

	incident.genesisAt = await genesisIncidentDb(
		robot.db,
		incident.id,
		genesisAt,
	);

	if (!incident.genesisAt) {
		return robot.adapter.sendError(room, "DB update failed!", messageId);
	}

	const url = await permalink(robot.adapter, room, messageId);
	const tasks = [
		robot.adapter.sendGenesisUpdated(room, genesisAt, userTimezone, messageId),
		addLogEventDb(
			robot.db,
			incident.id,
			`Incident genesis set to ${genesisAt}`,
			createdBy,
			url,
		),
	];

	return Promise.allSettled(tasks);
};

export const incidentSetDetected = async (
	robot: BreakingBot,
	room: string,
	userInput: string,
	createdBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();
	const userTimezone = await robot.adapter.getUserTimezone(createdBy);

	let detectedAt: DatetimeIso9075;

	try {
		detectedAt = parseNaturalLanguageDate(userInput, userTimezone);
	} catch (_e) {
		return robot.adapter.sendTimeParseError(
			room,
			userInput,
			userTimezone,
			"Maybe try one of <https://sugarjs.com/docs/#/DateParsing|these formats>?",
			messageId,
		);
	}

	if (isDatetimeLeftGtRight(detectedAt, incident.createdAt)) {
		return robot.adapter.sendError(
			room,
			"Woah there, time traveler! Detected must be before incident start!",
			messageId,
		);
	}

	incident.detectedAt = await detectedIncidentDb(
		robot.db,
		incident.id,
		detectedAt,
	);

	if (!incident.detectedAt) {
		return robot.adapter.sendError(room, "DB update failed!", messageId);
	}

	const url = await permalink(robot.adapter, room, messageId);
	const tasks = [
		robot.adapter.sendDetectedUpdated(
			room,
			detectedAt,
			userTimezone,
			messageId,
		),
		addLogEventDb(
			robot.db,
			incident.id,
			`Incident detected set to ${detectedAt}`,
			createdBy,
			url,
		),
	];

	return Promise.allSettled(tasks);
};

export const incidentSetPriority = async (
	robot: BreakingBot,
	room: string,
	priority: number,
	reason: string | null | undefined,
	createdBy: string,
	messageId?: string,
) => {
	const { config } = robot;
	const incident = robot.incidents[room].data();

	if (!isValidPriority(priority)) {
		return robot.adapter.sendError(
			room,
			"Invalid priority. Maybe check out `.priorities`?",
			messageId,
		);
	}

	if (incident.priority === priority) {
		return robot.adapter.reactToMessage(room, "ok_hand", messageId);
	}

	const [result] = await setIncidentPriorityDb(robot.db, incident.id, priority);

	if (result?.priority !== priority) {
		return robot.adapter.sendError(room, "Failed to set priority!", messageId);
	}

	incident.priority = priority;

	const url = await permalink(robot.adapter, room, messageId);
	const tasks = [
		robot.adapter.sendPriorityUpdated(room, priority, messageId),
		robot.adapter.updateBreakingTopic(incident, robot.tracker),
		addLogPriorityDb(
			robot.db,
			incident.id,
			`Incident priority set to ${priority}${reason ? `: ${reason}` : ""}`,
			createdBy,
			url,
		),
	];

	return Promise.allSettled(tasks);
};

export const incidentAssign = async (
	robot: BreakingBot,
	room: string,
	assignee: string,
	createdBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	const entry = userCacheGet(robot.users, assignee);
	const isValid = entry ? true : await robot.adapter.validateUser(assignee);

	if (!isValid) {
		return robot.adapter.reactToMessage(room, "exclamation", messageId);
	}

	const [result] = await setIncidentAssignedDb(robot.db, incident.id, assignee);

	if (result?.assigned !== assignee) {
		return robot.adapter.reactToMessage(room, "exclamation", messageId);
	}

	incident.assigned = assignee;

	const url = await permalink(robot.adapter, room, messageId);
	const tasks = [
		robot.adapter.reactToMessage(room, "ok_hand", messageId),
		robot.adapter.inviteUsers(room, assignee),
		addLogEventDb(
			robot.db,
			incident.id,
			`Incident assigned to ${assignee}`,
			createdBy,
			url,
		),
	];

	return Promise.allSettled(tasks);
};

export const incidentNotify = async (
	robot: BreakingBot,
	room: string,
	text: string,
	createdBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	const notifyRoom =
		robot.config.breakingNotifyRoom ?? robot.config.breakingMainRoom;

	const url = await permalink(robot.adapter, room, messageId);
	const [logEntry] = await addLogCommsUpdateDb(
		robot.db,
		incident.id,
		text,
		createdBy,
		url,
	);

	if (!logEntry) {
		return robot.adapter.sendError(room, "DB insert failed!", messageId);
	}

	const tasks = [robot.adapter.reactToMessage(room, "ok_hand", messageId)];

	if (isHighPriority(incident.priority)) {
		tasks.push(
			robot.adapter.sendCommUpdate(notifyRoom, incident, text, createdBy),
		);
	}

	if (robot.tracker) {
		tasks.push(robot.tracker.syncCommUpdate(incident, logEntry));
	}

	return Promise.allSettled(tasks);
};

export const incidentStatus = (
	robot: BreakingBot,
	room: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();
	let formattedTrackerUid: string | undefined;

	if (incident.trackerUid) {
		formattedTrackerUid = robot.tracker?.fmtUidForSlack(incident.trackerUid);
	}

	return robot.adapter.sendStatus(
		room,
		incident,
		formattedTrackerUid,
		messageId,
	);
};

export const incidentStatusAllActive = (
	robot: BreakingBot,
	room: string,
	messageId?: string,
) => {
	const incidents = [];

	for (const key in robot.incidents) {
		incidents.push(robot.incidents[key].data());
	}

	return robot.adapter.sendStatusAllActive(
		room,
		incidentOverview(incidents),
		robot.tracker,
		messageId,
	);
};

export const incidentHistory = async (
	robot: BreakingBot,
	room: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();
	const log = await getLogAllDb(robot.db, incident.id);

	return robot.adapter.sendHistory(
		room,
		incident,
		log,
		messageId,
		robot.tracker,
	);
};

export const incidentTutorial = (
	robot: BreakingBot,
	room: string,
	createdBy: string,
	messageId?: string,
) => {
	const incident = robot.incidents[room].data();

	if (!isReviewRequiredForPriority(incident.priority)) {
		return robot.adapter.sendError(
			room,
			"Review not required! Ready to `.complete`?",
			messageId,
		);
	}

	const lastTransition = robot.incidents[room].action("next");

	ffwTutorial(robot.incidents[room]);

	let title: string;
	let body: string;

	switch (robot.incidents[room].state()) {
		case TutorialState.Assignee: {
			const assignee = incident.assigned
				? `• Current assignee is ${incident.assigned}\n`
				: "• Nobody is currently assigned to this incident\n";

			title = "Use `.assign @someone` to set an assignee";
			body =
				// biome-ignore lint/style/useTemplate: ease of reading here
				assignee +
				"• Someone needs to be responsible for authoring the report and running the postmortem\n" +
				"• If we have a contributing factor PR, that PR author may be the best assignee candidate\n" +
				"• If you are unsure, assign to a relevant lead or director to fill out or delegate assignment\n" +
				"• `.assign` will assign the incident to yourself\n" +
				"• Ensure whomstever you assign is in the room and aware of their responsibilities";
			break;
		}
		case TutorialState.Components: {
			title = "Use `.component <name>` to set one or more components";
			body = `• At least one component is required, several are encouraged\n• Components are created on the fly, create new ones as appropriate\n• \`.componentrm <component>\` may be used to remove components\n• Keep in mind the list of already ${robot.config.componentListUrl}`;
			break;
		}
		case TutorialState.Core4: {
			title = "Use `.status` to inspect the incident metrics";
			body =
				"• `.genesis <when>` is used to set when the incident started, it must preceed detection time\n" +
				"• `.detected <when>` is used to set when we first became aware of the problem, it should preceed acknowledgement time\n" +
				"• `.mitigated <when>` is used to set when we mitigated the effects of the breaking, it should happen between genesis and resolution\n" +
				"•  Acknowledgement timestamp is auto-populated based on when comms+point where set on the incident\n" +
				"•  Resolved timestamp is auto-populated based on when the incident was marked all clear";
			break;
		}
		case TutorialState.Factors: {
			title =
				"Use `.factors` to inspect the contributing factors that led to this incident, use `.factor` for any additions";
			body =
				"• Not all incidents have linkable contributing factors\n" +
				"• Almost all incidents have multiple contributing factors\n" +
				"• Text is ok if there isn't a link\n";
			break;
		}
		case TutorialState.Priority: {
			title =
				"Use `.p1` | `.p2` | `.p3` | `.p4` | `.p5` to set a calibrated peak Incident Priority";
			body =
				"• `.p1` - Critical site failure impacting many customers, severe security breach, etm.\n" +
				'• `.p2` - "Normal" breaking incident; serious, but blast radius is limited.\n' +
				'• `.p3` - Minor breaking incident impacting few; "below urgent", but requires prompt fix. Security incidents involving a _single_ customer fall here.\n' +
				"• `.p4` - Not a breaking incident. These are bugs or improvements that should be sprint ticket work to be prioritized as time allows.\n" +
				'• `.p5` - "False Alarm", turns out nothing was wrong';
			break;
		}
		case TutorialState.Summary: {
			if (lastTransition) {
				const currentSummary = incident.summary
					? `• current summary: ${"```"}${incident.summary}${"```"}\n`
					: "• Summary is missing\n";

				title =
					"Use `.summary <details of what happened>` to describe our understanding of what broke and how";
				body = `${currentSummary}• now is the time to get into specifics`;
			} else {
				return incidentReadyForReview(robot, room, createdBy, messageId);
			}
			break;
		}
		case IncidentState.ReadyForReview: {
			return robot.adapter.sendError(
				room,
				"Incident under review. Ready to `.complete`?",
				messageId,
			);
		}
		default:
			return robot.adapter.reactToMessage(room, "exclamation", messageId);
	}

	return robot.adapter.sendTutorialStep(room, title, body);
};

export const incidentAddInterestedParty = (
	robot: BreakingBot,
	room: string,
	chatUserId: string,
) => {
	if (!robot.incidents[room]) {
		return;
	}

	const incident = robot.incidents[room].data();

	if (!robot.tracker || !incident.trackerUid) {
		return;
	}

	if (!isIncidentActive(incident)) {
		return;
	}

	const entry = userCacheGet(robot.users, chatUserId);

	if (!entry || !entry.trackerUserId) {
		return;
	}

	const alreadyInterested = robot.tracker.isAlreadyInterestedParty(
		incident.trackerUid,
		entry.trackerUserId,
	);

	if (alreadyInterested) {
		return;
	}

	robot.logger.debug(
		`Adding ${entry.trackerUserId} to ${incident.trackerUid} as interested party`,
	);

	return robot.tracker.addInterestedParty(
		incident.trackerUid,
		entry.trackerUserId,
	);
};

const permalink = async (
	adapter: CommPlatform,
	room: string,
	messageId: string | undefined,
) => {
	return messageId ? await adapter.getPermalink(room, messageId) : undefined;
};
