import * as jssm from "jssm";
import type { NagConfig } from "../../config/types.js";
import type { NagState } from "../boundary/annoyotron.js";
import {
	type Incident,
	currentPersistedState,
	isIncidentBlocked,
	isIncidentReadyForReview,
} from "../data/incident.js";
import { isInsideTimeAgo } from "./date.js";
import { isReviewRequiredForPriority } from "./priority.js";
import { isString } from "./string.js";

/**
 * Incident workflow states
 */
export enum IncidentState {
	Started = "Started",
	Acknowledged = "Acknowledged",
	Mitigated = "Mitigated",
	Blocked = "Blocked",
	Resolved = "Resolved",
	ReadyForReview = "Ready For Review",
	Completed = "Completed",
	Archived = "Archived",
	Canceled = "Canceled",
}

/**
 * Incident tutorial (.next) states - an optional side flow
 */
export enum TutorialState {
	Assignee = "Tutorial: Assignee",
	Core4 = "Tutorial: Core4",
	Priority = "Tutorial: Priority",
	Components = "Tutorial: Components",
	Factors = "Tutorial: Contributing Factors",
	Summary = "Tutorial: Summary",
}

/**
 * Incident actions (ie, named transitions)
 */
export const ACK = "ack";
export const MITIGATE = "mitigate";
export const BLOCK = "block";
export const RESOLVE = "resolve";
export const RFR = "rfr";
export const COMPLETE = "complete";
export const ARCHIVE = "archive";
export const CANCEL = "cancel";
export const UNBLOCK = "unblock";
export const UNMITIGATE = "unmitigate";
export const UNRESOLVE = "unresolve";
export const NEXT = "next";
export const RESTART = "restart";

// @see: https://fsl.tools && https://github.com/StoneCypher/jssm/
const incidentFsl = `
machine_name: "Breaking Incident";

Started 'ack' => Acknowledged 'mitigate' => Mitigated 'resolve' => Resolved 'rfr' => "Ready For Review" 'complete' => Completed 'archive' => Archived;

Started 'mitigate' -> Mitigated;
[Started Acknowledged] 'resolve' -> Resolved;
[Started Acknowledged Mitigated] 'block' ~> Blocked;
[Started Acknowledged Mitigated Blocked Resolved] 'cancel' ~> Canceled 'archive' -> Archived;

Blocked 'unblock' ~> Started;
[Mitigated Resolved] 'restart' ~> Started;

Mitigated 'unmitigate' -> Acknowledged;
Resolved 'unresolve' -> Mitigated;

Resolved 'complete' -> Completed;
Resolved 'next' -> "Tutorial: Assignee" 'next' -> "Tutorial: Core4" 'next' -> "Tutorial: Priority" 'next' -> "Tutorial: Components" 'next' -> "Tutorial: Contributing Factors" 'next' -> "Tutorial: Summary";
["Tutorial: Assignee" "Tutorial: Core4" "Tutorial: Priority" "Tutorial: Components" "Tutorial: Contributing Factors" "Tutorial: Summary"] 'rfr' -> "Ready For Review";
["Tutorial: Assignee" "Tutorial: Core4" "Tutorial: Priority" "Tutorial: Components" "Tutorial: Contributing Factors" "Tutorial: Summary"] 'restart' ~> "Started";
`;

export const newIncidentMachine = (
	incident: Incident,
): jssm.Machine<Incident> => {
	const machine = jssm.from<Incident>(incidentFsl, {
		// biome-ignore lint/style/useNamingConvention: jssm defined
		start_states: [currentPersistedState(incident)],
		data: incident,
	});

	machine.hook_entry(IncidentState.Acknowledged, ({ data }) => {
		return (
			isString(data.acknowledgedAt) ||
			(isString(data.point) && isString(data.comms))
		);
	});
	machine.hook_exit(IncidentState.Acknowledged, ({ data }) => {
		return isString(data.acknowledgedAt);
	});
	machine.hook_exit(IncidentState.Mitigated, ({ data }) => {
		return isString(data.acknowledgedAt) && isString(data.mitigatedAt);
	});
	machine.hook_entry(IncidentState.Blocked, ({ data }) => {
		return isIncidentBlocked(data);
	});
	machine.hook(IncidentState.Blocked, IncidentState.Started, ({ data }) => {
		return !isIncidentBlocked(data);
	});
	machine.hook_exit(IncidentState.Resolved, ({ data }) => {
		return (
			isString(data.acknowledgedAt) &&
			isString(data.mitigatedAt) &&
			isString(data.resolvedAt)
		);
	});
	machine.hook(IncidentState.Resolved, IncidentState.Completed, ({ data }) => {
		return !isReviewRequiredForPriority(data.priority);
	});
	machine.hook_entry(TutorialState.Assignee, ({ data }) => {
		return isReviewRequiredForPriority(data.priority);
	});
	machine.hook(TutorialState.Assignee, TutorialState.Core4, ({ data }) => {
		return isString(data.assigned);
	});
	machine.hook(TutorialState.Core4, TutorialState.Priority, ({ data }) => {
		return isString(data.genesisAt) && isString(data.detectedAt);
	});
	machine.hook(TutorialState.Components, TutorialState.Factors, ({ data }) => {
		return data.components.length > 0;
	});
	machine.hook_entry(IncidentState.ReadyForReview, ({ data }) => {
		return isIncidentReadyForReview(data);
	});
	machine.hook_exit(IncidentState.ReadyForReview, ({ data }) => {
		return isString(data.readyForReviewAt);
	});
	machine.hook_exit(IncidentState.Completed, ({ data }) => {
		return isString(data.completedAt);
	});
	machine.hook_entry(IncidentState.Archived, ({ data }) => {
		return isString(data.completedAt) || isString(data.canceledAt);
	});

	return machine;
};

export const ffwIncident = (incident: jssm.Machine<Incident>) => {
	const persistedState = currentPersistedState(incident.data());
	let lastTransition = true;

	while (incident.state() !== persistedState && lastTransition) {
		switch (incident.state()) {
			case IncidentState.Started: {
				lastTransition = incident.action(ACK);
				break;
			}
			case IncidentState.Acknowledged: {
				lastTransition = incident.action(MITIGATE);
				break;
			}
			case IncidentState.Mitigated: {
				lastTransition = incident.action(RESOLVE);
				break;
			}
			case IncidentState.Resolved: {
				lastTransition = incident.action(RFR);
				break;
			}
			case IncidentState.ReadyForReview: {
				lastTransition = incident.action(COMPLETE);
				break;
			}
			case IncidentState.Completed: {
				lastTransition = incident.action(ARCHIVE);
				break;
			}
			default:
				lastTransition = false;
		}
	}
};

export const ffwTutorial = (incident: jssm.Machine<Incident>) => {
	let lastTransition = true;

	while (lastTransition) {
		switch (incident.state()) {
			case TutorialState.Assignee:
			case TutorialState.Components:
			case TutorialState.Core4: {
				lastTransition = incident.action(NEXT);
				break;
			}
			default:
				lastTransition = false;
		}
	}
};

/**
 * Annoyotron states
 */
export enum Annoyotron {
	Start = "Start",
	PointNag = "Point Nag",
	CommsNag = "Comms Nag",
	CommUpdateNag = "Comm Update Nag",
	InitialCommNag = "Initial Comm Nag",
	Done = "Done",
}

/**
 * Annoyotron actions (ie, named transitions)
 */
export const NAG = "nag";
export const DONE = "done";

const annoyotronFsl = `
machine_name: "Annoyotron";

Start 'nag' => "Point Nag" 'nag' => "Comms Nag" 'nag' => "Initial Comm Nag" 'nag' => "Comm Update Nag" 'done' => Done;
["Initial Comm Nag" "Comms Nag"] 'done' -> Done;
`;

export const newAnnoyotronMachine = (
	incident: Incident,
	{ nagIntervalsSeconds }: NagConfig,
	nagState: NagState,
): jssm.Machine<NagState> => {
	const machine = jssm.from<NagState>(annoyotronFsl, { data: nagState });

	machine.hook_entry(Annoyotron.PointNag, ({ data }) => {
		if (isString(incident.point)) {
			return true;
		}

		return isInsideTimeAgo(data.lastNags.noPoint, nagIntervalsSeconds.noPoint);
	});

	machine.hook_entry(Annoyotron.CommsNag, ({ data }) => {
		if (isString(incident.comms)) {
			return true;
		}

		return isInsideTimeAgo(data.lastNags.noComms, nagIntervalsSeconds.noComms);
	});

	machine.hook_entry(Annoyotron.InitialCommNag, (_args) => {
		return isString(incident.comms) && !isIncidentBlocked(incident);
	});

	machine.hook_entry(Annoyotron.CommUpdateNag, ({ data }) => {
		return isString(data.mostRecentCommUpdate) && !isIncidentBlocked(incident);
	});

	machine.hook_exit(Annoyotron.CommUpdateNag, ({ data }) => {
		if (!nagIntervalsSeconds.needCommUpdate) {
			return true;
		}

		return (
			isInsideTimeAgo(
				data.mostRecentCommUpdate,
				nagIntervalsSeconds.needCommUpdate,
			) ||
			isInsideTimeAgo(
				data.lastNags.needCommUpdate,
				nagIntervalsSeconds.needCommUpdate,
			)
		);
	});

	return machine;
};
