import type { PriorityConfig } from "./types.js";

export const priorityConfig: PriorityConfig = {
	default: 2,
	priorities: {
		1: {
			name: "P1",
			emoji: "fire",
			description:
				"Critical issue that warrants public notification and liaison with executive teams, sending tweet, etc. The site is in a critical state and is actively impacting a large number of customers. Or we have an obviously critical security incident. All hands on deck! Highest communication cadence required.",
			aliases: ["hi", "high", "critical", "crit"],
			nag: {
				nagIntervalsSeconds: {
					noComms: 120,
					noPoint: 180,
					needCommUpdate: 1800,
					needInitialComm: 360,
				},
			},
			reportRequired: true,
			reviewRequired: true,
			isHighPriority: true,
		},
		2: {
			name: "P2",
			emoji: "fire",
			description:
				"Something is seriously broken or degraded; but the blast radius is limited. Most breaking incidents fall into this category. _Serious_ security incidents involving _more than one_ customer fall into this category.",
			aliases: ["mid", "med", "medium", "normal"],
			nag: {
				nagIntervalsSeconds: {
					noComms: 1200,
					noPoint: 1800,
					needCommUpdate: 3600,
					needInitialComm: 360,
				},
			},
			reportRequired: true,
			reviewRequired: true,
			isHighPriority: true,
		},
		3: {
			name: "P3",
			emoji: "dash",
			description:
				"Something is broken, or not fully working as intended, but it's not resulting in customer-facing errors or is impacting a singular or very small segment of customers. It's below “urgent”, but it needs to be fixed with high priority. Security incidents involving a _single_ customer fall here. Most plugin vulnerability incidents also belong here.",
			aliases: ["lo", "low", "lite", "light"],
			nag: {
				nagIntervalsSeconds: {
					noComms: 1200,
					noPoint: 1800,
					needInitialComm: 600,
				},
			},
		},
		4: {
			name: "P4",
			emoji: "heavy_multiplication_x",
			description:
				"Not a breaking incident. These are bugs or improvements that should be instead moved to sprint ticket work to be prioritized as time allows.",
			aliases: ["backlog", "none"],
		},
		5: {
			name: "P5",
			emoji: "heavy_multiplication_x",
			description: "Not a breaking incident. Not an issue at all.",
			aliases: ["wontfix"],
		},
	},
} as const;
