import { config } from "../../../../../config/index.js";
import { LogType } from "../../../../data/schema/log-entry-schema.js";

export const fiery = (): string => {
	return config.commPlatform?.emoji?.fiery ?? "fire";
};

export const mitigated = (): string => {
	return config.commPlatform?.emoji?.mitigated ?? "no_entry";
};

export const allClear = (): string => {
	return config.commPlatform?.emoji?.allclear ?? "sunny";
};

export const siren = (): string => {
	return config.commPlatform?.emoji?.siren ?? "rotating_light";
};

export const rip = (): string => {
	return config.commPlatform?.emoji?.rip ?? "dove_of_peace";
};

export const sob = (): string => {
	return config.commPlatform?.emoji?.rip ?? "sob";
};

export const git = (): string => {
	return config.commPlatform?.emoji?.git ?? "arrows_counterclockwise";
};

export const launch = (): string => {
	return config.commPlatform?.emoji?.launch ?? "rocket";
};

export const announce = (): string => {
	return config.commPlatform?.emoji?.announce ?? "mega";
};

export const incidentActive = (): string => {
	return config.commPlatform?.emoji?.incidentActive ?? fiery();
};

export const incidentMitigated = (): string => {
	return config.commPlatform?.emoji?.incidentMitigated ?? "fire";
};

export const incidentInactive = (): string => {
	return config.commPlatform?.emoji?.incidentInactive ?? allClear();
};

export const incidentCanceled = (): string => {
	return (
		config.commPlatform?.emoji?.incidentCanceled ?? "heavy_multiplication_x"
	);
};

export const point = (): string => {
	return config.commPlatform?.emoji?.point ?? "dart";
};

export const comms = (): string => {
	return config.commPlatform?.emoji?.comms ?? "mega";
};

export const triage = (): string => {
	return config.commPlatform?.emoji?.triage ?? "ambulance";
};

export const engLead = (): string => {
	return config.commPlatform?.emoji?.engLead ?? "hammer_and_wrench";
};

export const tracker = (): string => {
	return config.commPlatform?.emoji?.tracker ?? "memo";
};

export const ai = (): string => {
	return config.commPlatform?.emoji?.actionItem ?? "exclamation";
};

export const factor = (): string => {
	return config.commPlatform?.emoji?.contributingFactor ?? "jigsaw";
};

export const smokey = (): string => {
	return config.commPlatform?.emoji?.smokey ?? "dash";
};

export const hiPriority = (): string => {
	return config.commPlatform?.emoji?.hiPriority ?? fiery();
};

export const lowPriority = (): string => {
	return config.commPlatform?.emoji?.lowPriority ?? smokey();
};

export const blocked = (): string => {
	return config.commPlatform?.emoji?.blocked ?? "no_entry";
};

export const unblocked = (): string => {
	return config.commPlatform?.emoji?.unblocked ?? "arrow_forward";
};

export const event = (): string => {
	return config.commPlatform?.emoji?.note ?? "small_blue_diamond";
};

export const note = (): string => {
	return config.commPlatform?.emoji?.note ?? "spiral_note_pad";
};

export const affected = (): string => {
	return config.commPlatform?.emoji?.note ?? "anger";
};

export const component = (): string => {
	return config.commPlatform?.emoji?.note ?? "card_file_box";
};

export const logEmoji = (logType: LogType): string => {
	let emoji: string;

	switch (logType) {
		case LogType.ActionItem: {
			emoji = ai();
			break;
		}
		case LogType.Blocker: {
			emoji = blocked();
			break;
		}
		case LogType.CommUpdate: {
			emoji = comms();
			break;
		}
		case LogType.ContributingFactor: {
			emoji = factor();
			break;
		}
		case LogType.Event: {
			emoji = event();
			break;
		}
		case LogType.Pr: {
			emoji = git();
			break;
		}
		case LogType.Unblock: {
			emoji = unblocked();
			break;
		}
		default:
			emoji = note();
	}

	return emoji;
};
