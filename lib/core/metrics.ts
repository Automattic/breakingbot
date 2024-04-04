import type { Incident } from "../data/incident.js";
import {
	type DatetimeIso9075,
	humanDateDiffShort,
	prettifyDate,
} from "./date.js";
import { isString } from "./string.js";

type TimespanPoint = {
	title: string;
	at: DatetimeIso9075 | null;
	prettyString: string;
};

export type Core4 = {
	genesis: TimespanPoint;
	detected: TimespanPoint;
	acknowledged: TimespanPoint;
	mitigated: TimespanPoint;
	resolved: TimespanPoint;
	ttd: string | undefined;
	tta: string | undefined;
	ttm: string | undefined;
	ttr: string | undefined;
};

export const getCore4 = (incident: Incident): Core4 => {
	let ttd: string | undefined;
	let tta: string | undefined;
	let ttm: string | undefined;
	let ttr: string | undefined;

	const pretty = {
		genesis: prettifyDate(incident.genesisAt, "use .genesis to set"),
		detected: prettifyDate(incident.detectedAt, "use .detected to set"),
		acked: prettifyDate(
			incident.acknowledgedAt,
			"assign .point and .comms to ack",
		),
		mitigated: prettifyDate(incident.mitigatedAt, "use .mitigated to set"),
		resolved: prettifyDate(incident.resolvedAt, "set when incident is stopped"),
	};

	// we compute TTx between neighboring core4 fields
	if (incident.genesisAt && incident.detectedAt) {
		// TTD: genesis -> detected
		ttd = humanDateDiffShort(incident.genesisAt, incident.detectedAt);
	}

	// TTA: detected -> acknowledged
	if (incident.detectedAt && incident.acknowledgedAt) {
		tta = humanDateDiffShort(incident.detectedAt, incident.acknowledgedAt);
	}

	// TTM: genesis -> mitigated
	if (incident.genesisAt && incident.mitigatedAt) {
		ttm = humanDateDiffShort(incident.genesisAt, incident.mitigatedAt);
	}

	// TTR: genesis -> resolved
	if (incident.genesisAt && incident.resolvedAt) {
		ttr = humanDateDiffShort(incident.genesisAt, incident.resolvedAt);
	}

	return {
		genesis: {
			title: "Genesis",
			at: incident.genesisAt,
			prettyString: pretty.genesis,
		},

		detected: {
			title: "Detected",
			at: incident.detectedAt,
			prettyString: pretty.detected,
		},

		acknowledged: {
			title: "Acked",
			at: incident.acknowledgedAt,
			prettyString: pretty.acked,
		},

		mitigated: {
			title: "Mitigated",
			at: incident.mitigatedAt,
			prettyString: pretty.mitigated,
		},

		resolved: {
			title: "Resolved",
			at: incident.resolvedAt,
			prettyString: pretty.resolved,
		},
		ttd,
		tta,
		ttm,
		ttr,
	};
};

export const core4String = (core4: Core4) => {
	const ttd = core4.ttd ? `(TTD ${core4.ttd})` : "";
	const tta = core4.tta ? `(TTA ${core4.tta})` : "";
	const ttm = core4.ttm ? `(TTM ${core4.ttm})` : "";
	const ttr = core4.ttr ? `(TTR ${core4.ttr})` : "";

	return (
		// biome-ignore lint/style/useTemplate: easier reading
		"```" +
		`Genesis:           ${core4.genesis.prettyString}\n` +
		`Detected:          ${core4.detected.prettyString}         ${ttd}\n` +
		`Acked:             ${core4.acknowledged.prettyString}         ${tta}\n` +
		`Mitigated:         ${core4.mitigated.prettyString}         ${ttm}\n` +
		`Resolved:          ${core4.resolved.prettyString}         ${ttr}\n` +
		"```"
	);
};

export const isAnyCore4Set = (incident: Incident): boolean => {
	return (
		isString(incident.genesisAt) ||
		isString(incident.detectedAt) ||
		isString(incident.acknowledgedAt) ||
		isString(incident.mitigatedAt) ||
		isString(incident.resolvedAt)
	);
};
