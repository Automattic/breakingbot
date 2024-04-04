// Description:
//   Middleware that returns an error if there is no in progress incident where the message is heard.
//

import { IncidentState } from "../../../core/fsm.js";
import {
	isIncidentActive,
	isIncidentUpdatable,
} from "../../../data/incident.js";
import type { BreakingBot } from "../../../types/index.js";

export const incidentStatusMiddleware = (robot: BreakingBot) => {
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: mostly inherent complexity here
	robot.listenerMiddleware((context) => {
		if (!context.response) {
			return true;
		}

		let incident = null;
		let state = null;

		if (robot.incidents[context.response.envelope.room]) {
			incident = robot.incidents[context.response.envelope.room].data();
			state = robot.incidents[context.response.envelope.room].state();
		}

		// stop execution if requires incident and there is no incident
		if (
			!incident &&
			(context.listener.options.requireIncident ||
				context.listener.options.requireActiveIncident ||
				context.listener.options.requireUpdatableIncident)
		) {
			context.response.send(
				"No incident in progress here! Perhaps you're in the wrong channel? See `.breakings` to find where you should be!",
			);
			return false;
		}

		// stop execution if requires active incident but the incident is blocked
		if (
			incident &&
			state === IncidentState.Blocked &&
			context.listener.options.requireActiveIncident
		) {
			context.response.send(
				"Incident is blocked! Maybe check `.blockers` and try again?",
			);
			return false;
		}

		// stop execution if requires active incident and the incident is not active
		if (
			incident &&
			!isIncidentActive(incident) &&
			context.listener.options.requireActiveIncident
		) {
			context.response.send("Incident is already resolved!");
			return false;
		}

		// stop execution if requires editable incident and the incident is not editable
		if (
			incident &&
			!isIncidentUpdatable(incident) &&
			context.listener.options.requireUpdatableIncident
		) {
			context.response.send("Incident is no longer updatable!");
			return false;
		}

		return true;
	});
};
