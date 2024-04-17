// Description:
//   breakingbot - breaking incident management chat bot
//
// Configuration:
//   None
//
// Commands:
//   `.start <incident title>` - Starts a new incident, notifies widely, gets a new channel assigned
//   `.low <incident title>` - Starts a new low priority incident, gets a new channel assigned
//   `.mitigated|mitigate [<when>]` - Marks that the incident has been mitigated (Related Core 4 metrics). <when> is optional, and parsed from natural language. If omitted, uses now.
//   `.stop|allclear|resolve` - Marks an ongoing incident as resolved
//   `.restart` - Marks an ongoing incident both unmitigated and unresolved. Indicates that a previous .mitigated and/or .allclear call was premature and the outage persists.
//   `.title <title>` - Sets the title of the incident
//   `.help` - Outputs some help text and the breaking incident runbook links
//   `.ai|actionitem <title> [=> summary]` - Adds an action item to be followed up on during postmortem
//   `.ais|actionitems` - Lists action items
//   `.pr <url>` - Adds a PR or code change to the incident in progress
//   `.prs` - Show all PRs or code changes attached to the incident in progress
//   `.factor <factor>` - Adds a PR, code change, other link, or even just text to describe the contributing factor
//   `.factors` - Show all the contributing factors attached to the incident in progress
//   `.components` - Show what impacted components this incident is effecting
//   `.component <component>[,<component>]` - Adds component as an impacted component for this incident. Comma separated components for multiple!
//   `.componentrm <component>` - Remove a component you added in error.
//   `.commands` - Show all available commands
//   `.blockers` - Shows any active blockers
//   `.blocker|blocked <whomst> [=> <reason>]` - Set the incident to blocked on a 3rd party. Blocked indicates that no work on the incident can progress until unblocked. Reason is optional, use => as separator. See .unblocked
//   `.unblocked <id>` - Remove an active blocker by its id. See .blockers
//   `.unblockall`- Remove all active blockers. See .blockers
//   `.point <user>` - Sets point to <user> (omit <user> to take point yourself)
//   `.comms <user>` - Sets comms to <user> (omit <user> to take comms yourself)
//   `.triage <user>` - Sets triage to <user> (omit <user> to take triage yourself)
//   `.eng <user>` - Sets eng to <user> (omit <user> to take eng yourself)
//   `.notes` - Displays internal notes
//   `.notes|note <message>` - Adds internal notes to the incident
//   `.affected` - Displays list of affected items
//   `.affected <item>[,<item>]` - Add an item to the list of affected. Comma separated for multiple!
//   `.affectedrm <item>` - Remove an item to the list of affected
//   `.notify <message>` - Updates comms with a message, and sends appropriate Slack updates
//   `.detected <when>` - Tracks the time we detected the root cause of this issue. (i.e. when the alerts fired, monitoring picked this up, etc). Converts to UTC but knows _your_ timezone, so you can denote without fancy TZing. (Related: Core 4 metrics)
//   `.genesis <when>` - Tracks the time the incident started. (i.e. when the code first reached production, or the earliest symptom of capacity being insufficient) Converts to UTC but knows _your_ timezone, so you can denote without fancy TZing. (Related: Core 4 metrics)
//   `.status` - Checks the status of ongoing incidents
//   `.summary` - Checks the current executive summary of the incident in progress
//   `.summary <summary>` - Updates the summary for the incident. This should be read as an executive summary, describing the tl;dr: that we know about scope, impact, and cause. Updates to .summary are expected periodically as our understanding of the incident deepens.
//   `.p<level>|priority <level> [<reason>]` - Sets the priority for the incident. Typically this looks like .p1, .p2, .p3, .p4, or .p5. See .priorities for details. Optional reason, if you want to justify your priority selection.
//   `.priorities` - Show the valid priority levels for .priority command
//   `.cancel` - Cancel out a false-positive breaking without running an incident review
//   `.uncancel` - Uncancel a canceled incident
//   `.unmitigated|unmitigate` - Marks that the incident has been unmitigated (Related Core 4 metrics). Indicates that a previous .mitigated call was premature, and the outage persists.
//   `.unresolve` - Marks an ongoing incident as unresolved
//   `.rfr|readyforreview` - Mark this resolved incident as Ready For Review
//   `.complete|done` - Mark this incident as having completed review and ready for archival
//   `.next` - Run the RFR wizard
//   `.history` - shows incident log of events
//   `.breakings` - shows all the breaking channels in progress
//   `.issue` - Show the current tracking issue
//   `.mainchannel` - shows the current main breaking routing channel
//
// Notes:
//   <optional notes required for the script>
//
// Author:
//   WPVIP

import { isAnyCore4Set } from "../../../core/metrics.js";
import { blockerAddRegex } from "../../../core/regex.js";
import { incidentOverview } from "../../../data/incident.js";
import {
	getLogAisDb,
	getLogContributingFactorsDb,
	getLogNotesDb,
	getLogPrsDb,
} from "../../../data/log.js";
import { addAffected, removeAffected } from "../handlers/affected.js";
import {
	addBlocker,
	removeAllBlockers,
	removeBlocker,
} from "../handlers/blocker.js";
import { addComponent, removeComponent } from "../handlers/component.js";
import {
	incidentAddInterestedParty,
	incidentAssign,
	incidentCancel,
	incidentComplete,
	incidentHistory,
	incidentMitigate,
	incidentNotify,
	incidentReadyForReview,
	incidentResolve,
	incidentRestart,
	incidentSetComms,
	incidentSetDetected,
	incidentSetEngLead,
	incidentSetGenesis,
	incidentSetMitigated,
	incidentSetPoint,
	incidentSetPriority,
	incidentSetSummary,
	incidentSetTitle,
	incidentSetTriage,
	incidentStart,
	incidentStatus,
	incidentStatusAllActive,
	incidentTutorial,
	incidentUncancel,
	incidentUnresolve,
} from "../handlers/incident.js";
import {
	logAddActionItem,
	logAddFactor,
	logAddNote,
	logAddPr,
} from "../handlers/log.js";
import { getHelpCommands } from "../help.js";

import type { BreakingBot } from "../../../types/index.js";

// biome-ignore lint/style/noDefaultExport: hubot requires it
export default async (robot: BreakingBot) => {
	robot.hear(
		/^\.start\b\s+(\S.*)$/i,
		{ id: "incident.start" },
		({ envelope: { room }, match, message }) => {
			const { breakingMainRoom } = robot.config;

			if (room !== breakingMainRoom) {
				return robot.adapter.sendError(
					room,
					`\`.start\` me up over in ${robot.adapter.fmtRoom(breakingMainRoom)}`,
					message.id,
				);
			}

			incidentStart(robot, match[1], message.user.id);
		},
	);

	robot.hear(
		/^\.low\b\s+(\S.*)$/i,
		{ id: "incident.start:low" },
		({ envelope: { room }, match, message }) => {
			const { breakingMainRoom, priorities } = robot.config;

			if (room !== breakingMainRoom) {
				return robot.adapter.sendError(
					room,
					`\`.start\` me up over in ${robot.adapter.fmtRoom(breakingMainRoom)}`,
					message.id,
				);
			}

			incidentStart(robot, match[1], message.user.id, priorities.defaultLow);
		},
	);

	robot.hear(
		/^\.(stop|allclear|clear|resolve|resolved)$/i,
		{
			id: "incident.resolve",
			requireActiveIncident: true,
		},
		({ envelope: { room }, message }) => {
			incidentResolve(robot, room, message.user.id, message.id);
		},
	);

	robot.hear(
		/^\.(restart|unmitigate|unmitigated)$/i,
		{ id: "incident.restart", requireIncident: true },
		({ envelope: { room }, message }) => {
			incidentRestart(robot, room, message.user.id, message.id);
		},
	);

	robot.hear(
		/^\.(unresolve|unresolved)$/i,
		{ id: "incident.unresolve", requireIncident: true },
		({ envelope: { room }, message }) => {
			incidentUnresolve(robot, room, message.user.id, message.id);
		},
	);

	robot.hear(
		/^\.cancel$/i,
		{ id: "incident.cancel", requireIncident: true },
		({ envelope: { room }, message }) => {
			incidentCancel(robot, room, message.user.id, message.id);
		},
	);

	robot.hear(
		/^\.uncancel$/i,
		{ id: "incident.uncancel", requireIncident: true },
		({ envelope: { room }, message }) => {
			incidentUncancel(robot, room, message.user.id, message.id);
		},
	);

	robot.hear(
		/^\.summary$/i,
		{ id: "incident.summary:get", requireIncident: true },
		({ envelope: { room }, message }) => {
			const incident = robot.incidents[room].data();
			robot.adapter.sendSummary(room, incident.summary, message.id);
		},
	);

	robot.hear(
		/^\.summary\b\s+(\S[\S\s]+)$/i,
		{ id: "incident.summary:set", requireUpdatableIncident: true },
		({ envelope: { room }, match, message }) => {
			incidentSetSummary(
				robot,
				room,
				match[1].trim(),
				message.user.id,
				message.id,
			);
		},
	);

	robot.hear(
		/^\.title\b\s+(\S.*)$/i,
		{ id: "incident.title:set", requireUpdatableIncident: true },
		({ envelope: { room }, match, message }) => {
			incidentSetTitle(robot, room, match[1], message.user.id, message.id);
		},
	);

	robot.hear(
		/^\.(component|components)\b(.+)$/i,
		{ id: "incident.component:add", requireIncident: true },
		({ envelope: { room }, match, message }) => {
			addComponent(robot, room, match[2], message.id);
		},
	);

	robot.hear(
		/^\.(component|components)$/i,
		{ id: "incident.component:get", requireIncident: true },
		({ envelope: { room }, message }) => {
			const incident = robot.incidents[room].data();

			robot.adapter.sendComponentsList(
				room,
				incident.components.map((c) => c.which),
				robot.config.componentListUrl,
				message.id,
			);
		},
	);

	robot.hear(
		/^\.componentrm\b\s+(\S.*)$/i,
		{ id: "incident.component:remove", requireIncident: true },
		({ envelope: { room }, match, message }) => {
			removeComponent(robot, room, match[1], message.id);
		},
	);

	robot.hear(
		/^\.point\b\s*$/i,
		{ id: "incident.point:set", requireActiveIncident: true },
		({ envelope: { room }, message }) => {
			incidentSetPoint(
				robot,
				room,
				message.user.id,
				message.user.id,
				message.id,
			);
		},
	);

	robot.hear(
		/^\.point\b\s+(\S.*)$/i,
		{ id: "incident.point:set", requireActiveIncident: true },
		({ envelope: { room }, match, message }) => {
			const normalized = robot.adapter.normalizeUserIdInput(match[1]);
			incidentSetPoint(robot, room, normalized, message.user.id, message.id);
		},
	);

	robot.hear(
		/^\.comms\b\s*$/i,
		{ id: "incident.comms:set", requireActiveIncident: true },
		({ envelope: { room }, message }) => {
			incidentSetComms(
				robot,
				room,
				message.user.id,
				message.user.id,
				message.id,
			);
		},
	);

	robot.hear(
		/^\.comms\b\s+(\S.*)$/i,
		{ id: "incident.comms:set", requireActiveIncident: true },
		({ envelope: { room }, match, message }) => {
			const normalized = robot.adapter.normalizeUserIdInput(match[1]);
			incidentSetComms(robot, room, normalized, message.user.id, message.id);
		},
	);

	robot.hear(
		/^\.triage\b\s*$/i,
		{ id: "incident.triage:set", requireActiveIncident: true },
		({ envelope: { room }, message }) => {
			incidentSetTriage(
				robot,
				room,
				message.user.id,
				message.user.id,
				message.id,
			);
		},
	);

	robot.hear(
		/^\.triage\b\s+(\S.*)$/i,
		{ id: "incident.triage:set", requireActiveIncident: true },
		({ envelope: { room }, match, message }) => {
			const normalized = robot.adapter.normalizeUserIdInput(match[1]);
			incidentSetTriage(robot, room, normalized, message.user.id, message.id);
		},
	);

	robot.hear(
		/^\.eng\b\s*$/i,
		{ id: "incident.eng:set", requireActiveIncident: true },
		({ envelope: { room }, message }) => {
			incidentSetEngLead(
				robot,
				room,
				message.user.id,
				message.user.id,
				message.id,
			);
		},
	);

	robot.hear(
		/^\.eng\b\s+(\S.*)$/i,
		{ id: "incident.eng:set", requireActiveIncident: true },
		({ envelope: { room }, match, message }) => {
			const normalized = robot.adapter.normalizeUserIdInput(match[1]);
			incidentSetEngLead(robot, room, normalized, message.user.id, message.id);
		},
	);

	robot.hear(
		/^.(mitigate|mitigated)$/,
		{ id: "incident.mitigate", requireActiveIncident: true },
		({ envelope: { room }, message }) => {
			incidentMitigate(robot, room, message.user.id, message.id);
		},
	);

	robot.hear(
		/^.(mitigate|mitigated)\b\s(\S.*)?$/,
		{ id: "incident.mitigated:set", requireUpdatableIncident: true },
		({ envelope: { room }, match, message }) => {
			incidentSetMitigated(robot, room, match[2], message.user.id, message.id);
		},
	);

	robot.hear(
		/^.genesis\s+(\S.*)$/,
		{ id: "incident.genesis:set", requireUpdatableIncident: true },
		({ envelope: { room }, match, message }) => {
			incidentSetGenesis(robot, room, match[1], message.user.id, message.id);
		},
	);

	robot.hear(
		/^.detected\s+(\S.*)$/,
		{ id: "incident.detected:set", requireUpdatableIncident: true },
		({ envelope: { room }, match, message }) => {
			incidentSetDetected(robot, room, match[1], message.user.id, message.id);
		},
	);

	robot.hear(
		/^\.(ai|actionitem)\b\s+(\S.*)$/i,
		{ id: "incident.actionitem:add", requireUpdatableIncident: true },
		({ envelope: { room }, match, message }) => {
			logAddActionItem(robot, room, match[2], message.user.id, message.id);
		},
	);

	robot.hear(
		/^\.(ais|actionitems)$/i,
		{ id: "incident.actionitems:get", requireIncident: true },
		async ({ envelope: { room }, message }) => {
			const ais = await getLogAisDb(robot.db, robot.incidents[room].data().id);
			robot.adapter.sendAiList(room, ais, robot.tracker, message.id);
		},
	);

	robot.hear(
		/^.(breakings|breakingchannels)/i,
		{ id: "breakingchannels:get" },
		({ envelope: { room }, message }) => {
			const incidents = [];

			for (const key in robot.incidents) {
				incidents.push(robot.incidents[key].data());
			}

			robot.adapter.sendBreakingList(
				room,
				incidentOverview(incidents),
				robot.tracker,
				message.id,
			);
		},
	);

	robot.hear(/^\.mainchannel$/i, { id: "mainchannel:get" }, (res) => {
		const formatted = robot.adapter.fmtRoom(robot.config.breakingMainRoom);

		robot.adapter.replyToMessage(
			res.envelope.room,
			`The main channel is ${formatted}`,
			res.message.id,
		);
	});

	robot.enter(
		{ id: "incident.room:enter" },
		({ envelope: { room }, message }) => {
			if (!robot.incidents[room]) {
				return;
			}

			const incident = robot.incidents[room].data();

			if (incident.summary || isAnyCore4Set(incident)) {
				robot.adapter.sendRoomEnterWelcome(incident, message.user.id);
			}
		},
	);

	robot.hear(
		/^\.(factor|cause|rootcause|chain|iamsorry|mybad)\b\s+(\S.*)$/i,
		{ id: "incident.factor:add", requireUpdatableIncident: true },
		({ envelope: { room }, match, message }) => {
			logAddFactor(robot, room, match[2], message.user.id, message.id);
		},
	);

	robot.hear(
		/^\.(factors|causes|rootcauses|chains)$/i,
		{ id: "incident.factors:get", requireIncident: true },
		async ({ envelope: { room }, message }) => {
			const factors = await getLogContributingFactorsDb(
				robot.db,
				robot.incidents[room].data().id,
			);

			robot.adapter.sendContributingFactorList(room, factors, message.id);
		},
	);

	robot.hear(
		/^\.priorit(ies|y)$/i,
		{ id: "incident.priorities:get" },
		({ envelope: { room }, message }) => {
			robot.adapter.sendPriorities(room, robot.config.priorities, message.id);
		},
	);

	robot.hear(
		/^\.p(\d+)\b\s*(\S.*)?$/i,
		{ id: "incident.priority:set", requireUpdatableIncident: true },
		({ envelope: { room }, match, message }) => {
			incidentSetPriority(
				robot,
				room,
				Number(match[1]),
				match[2],
				message.user.id,
				message.id,
			);
		},
	);

	robot.hear(
		/^\.priority\b\s+(\d+)\b\s*(\S.*)?$/i,
		{ id: "incident.priority:set", requireUpdatableIncident: true },
		({ envelope: { room }, match, message }) => {
			incidentSetPriority(
				robot,
				room,
				Number(match[1]),
				match[2],
				message.user.id,
				message.id,
			);
		},
	);

	robot.hear(
		/^\.prs$/i,
		{ id: "incident.prs:get", requireIncident: true },
		async ({ envelope: { room }, message }) => {
			const prs = await getLogPrsDb(robot.db, robot.incidents[room].data().id);
			robot.adapter.sendPrsList(room, prs, message.id);
		},
	);

	robot.hear(
		/^\.(fix)?pr\s+([\S\s]+)$/i,
		{ id: "incident.pr:add", requireUpdatableIncident: true },
		({ envelope: { room }, match, message }) => {
			logAddPr(robot, room, match[2], message.user.id, message.id);
		},
	);

	robot.hear(
		/^\.(rfr|readyforreview)$/i,
		{ id: "incident.rfr", requireIncident: true },
		({ envelope: { room }, message }) => {
			incidentReadyForReview(robot, room, message.user.id, message.id);
		},
	);

	robot.hear(
		/^\.(complete|done)$/i,
		{ id: "incident.complete", requireIncident: true },
		({ envelope: { room }, message }) => {
			incidentComplete(robot, room, message.user.id, message.id);
		},
	);

	robot.hear(
		/^\.assign(?:ee)?$/i,
		{ id: "incident:assignee:set", requireUpdatableIncident: true },
		({ envelope: { room }, message }) => {
			incidentAssign(robot, room, message.user.id, message.user.id, message.id);
		},
	);

	robot.hear(
		/^\.assign(?:ee)?\b\s+(\S.*)$/i,
		{ id: "incident:assignee:set", requireUpdatableIncident: true },
		({ envelope: { room }, match, message }) => {
			const norm = robot.adapter.normalizeUserIdInput(match[1]);
			incidentAssign(robot, room, norm, message.user.id, message.id);
		},
	);

	robot.hear(
		/^\.affected$/i,
		{ id: "affected:get", requireIncident: true },
		({ envelope: { room }, message }) => {
			const incident = robot.incidents[room].data();

			robot.adapter.sendAffectedList(
				room,
				incident.affected.map((a) => a.what),
				message.id,
			);
		},
	);

	robot.hear(
		/^\.affected\b\s+(\S[\S\s]+)$/i,
		{ id: "affected:add", requireUpdatableIncident: true },
		({ envelope: { room }, match, message }) => {
			addAffected(robot, room, match[1], message.id);
		},
	);

	robot.hear(
		/^\.affectedrm\b\s+(\S.*)$/i,
		{ id: "affected:remove", requireUpdatableIncident: true },
		({ envelope: { room }, match, message }) => {
			removeAffected(robot, room, match[1], message.id);
		},
	);

	robot.hear(
		/^\.(notes)$/i,
		{ id: "log.notes:get", requireIncident: true },
		async ({ envelope: { room }, message }) => {
			const notes = await getLogNotesDb(
				robot.db,
				robot.incidents[room].data().id,
			);

			robot.adapter.sendNotesList(room, notes, message.id);
		},
	);

	robot.hear(
		/^\.(note|notes)\b\s+(\S[\S\s]+)$/i,
		{ id: "log.notes:add", requireUpdatableIncident: true },
		({ envelope: { room }, match, message }) => {
			logAddNote(robot, room, match[2], message.user.id, message.id);
		},
	);

	robot.hear(
		/^\.blockers$/i,
		{ id: "blockers:get", requireIncident: true },
		({ envelope: { room }, message }) => {
			const incident = robot.incidents[room].data();
			robot.adapter.sendBlockersList(room, incident.blockers, message.id);
		},
	);

	robot.hear(
		blockerAddRegex(),
		{ id: "blocker:add", requireIncident: true },
		({ envelope: { room }, match, message }) => {
			const whomst = match[1] ? match[1].trim() : match[1];
			const reason = match[2] ? match[2].trim() : match[2];
			addBlocker(robot, room, whomst, reason, message.user.id, message.id);
		},
	);

	robot.hear(
		/^\.unblock(?:ed)?\b\s+(\d+)$/i,
		{ id: "blocker:unblock", requireIncident: true },
		({ envelope: { room }, match, message }) => {
			removeBlocker(robot, room, Number(match[1]), message.user.id, message.id);
		},
	);

	robot.hear(
		/^\.unblock(?:ed)?all$/i,
		{ id: "blocker:unblockall", requireIncident: true },
		({ envelope: { room }, message }) => {
			removeAllBlockers(robot, room, message.user.id, message.id);
		},
	);

	robot.hear(
		/^\.notify\s+([\S\s]+)$/i,
		{ id: "incident.notify", requireIncident: true },
		({ envelope: { room }, match, message }) => {
			incidentNotify(robot, room, match[1], message.user.id, message.id);
		},
	);

	robot.hear(
		/^\.status$/i,
		{ id: "incident.status:get" },
		({ envelope: { room }, message }) => {
			if (!robot.incidents[room]) {
				return incidentStatusAllActive(robot, room, message.id);
			}

			incidentStatus(robot, room, message.id);
		},
	);

	robot.hear(
		/^\.(history|timeline|log)$/i,
		{ id: "incident.showcomms", requireIncident: true },
		({ envelope: { room }, message }) => {
			incidentHistory(robot, room, message.id);
		},
	);

	robot.hear(
		/^\.(issue|ticket)$/i,
		{ id: "incident.trackingissue:get", requireIncident: true },
		({ envelope: { room }, message }) => {
			const incident = robot.incidents[room].data();

			if (!incident.trackerUid || !robot.tracker) {
				return robot.adapter.sendError(room, "No tracking found!", message.id);
			}

			robot.adapter.sendTrackingIssue(
				room,
				incident,
				robot.tracker,
				message.id,
			);
		},
	);

	robot.hear(/^.help$/i, { id: "bot.help" }, ({ envelope, message }) => {
		robot.adapter.sendHelpMessage(envelope.room, robot.config, message.id);
	});

	robot.hear(
		/^.commands(?:\s+(.*))?$/i,
		{ id: "bot.commands" },
		({ envelope: { room }, message }) => {
			const commands = getHelpCommands(robot);
			robot.adapter.sendCommandsMessage(room, commands, message.id);
		},
	);

	robot.hear(
		/^\.(next|tutorial)$/i,
		{ id: "tutorial", requireIncident: true },
		({ envelope: { room }, message }) => {
			incidentTutorial(robot, room, message.user.id, message.id);
		},
	);

	robot.catchAll(({ message }) => {
		// biome-ignore lint/correctness/noConstantCondition: hotfix
		if (true) {
			return;
		}

		incidentAddInterestedParty(robot, message.room, message.user.id);
	});
};
