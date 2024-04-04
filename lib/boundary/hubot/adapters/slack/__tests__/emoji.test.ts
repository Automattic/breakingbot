import { describe, expect, test } from "vitest";
import { LogType } from "../../../../../data/schema/log-entry-schema.js";
import {
	ai,
	allClear,
	announce,
	blocked,
	comms,
	engLead,
	event,
	factor,
	fiery,
	git,
	hiPriority,
	incidentActive,
	incidentCanceled,
	incidentInactive,
	incidentMitigated,
	launch,
	logEmoji,
	lowPriority,
	mitigated,
	note,
	point,
	rip,
	siren,
	smokey,
	sob,
	tracker,
	triage,
	unblocked,
} from "../emoji.js";

describe("slack/emoji.ts", () => {
	describe("fiery", () => {
		test("default when config value not set", () => {
			expect(fiery()).toBe("fire");
		});
	});

	describe("mitigated", () => {
		test("default when config value not set", () => {
			expect(mitigated()).toBe("no_entry");
		});
	});

	describe("allClear", () => {
		test("default when config value not set", () => {
			expect(allClear()).toBe("sunny");
		});
	});

	describe("siren", () => {
		test("default when config value not set", () => {
			expect(siren()).toBe("rotating_light");
		});
	});

	describe("rip", () => {
		test("default when config value not set", () => {
			expect(rip()).toBe("dove_of_peace");
		});
	});

	describe("sob", () => {
		test("default when config value not set", () => {
			expect(sob()).toBe("sob");
		});
	});

	describe("git", () => {
		test("default when config value not set", () => {
			expect(git()).toBe("arrows_counterclockwise");
		});
	});

	describe("launch", () => {
		test("default when config value not set", () => {
			expect(launch()).toBe("rocket");
		});
	});

	describe("announce", () => {
		test("default when config value not set", () => {
			expect(announce()).toBe("mega");
		});
	});

	describe("incidentActive", () => {
		test("default when config value not set", () => {
			expect(incidentActive()).toBe("fire");
		});
	});

	describe("incidentMitigated", () => {
		test("default when config value not set", () => {
			expect(incidentMitigated()).toBe("fire");
		});
	});

	describe("incidentInactive", () => {
		test("default when config value not set", () => {
			expect(incidentInactive()).toBe("sunny");
		});
	});

	describe("incidentCanceled", () => {
		test("default when config value not set", () => {
			expect(incidentCanceled()).toBe("heavy_multiplication_x");
		});
	});

	describe("point", () => {
		test("default when config value not set", () => {
			expect(point()).toBe("dart");
		});
	});

	describe("comms", () => {
		test("default when config value not set", () => {
			expect(comms()).toBe("mega");
		});
	});

	describe("triage", () => {
		test("default when config value not set", () => {
			expect(triage()).toBe("ambulance");
		});
	});

	describe("engLead", () => {
		test("default when config value not set", () => {
			expect(engLead()).toBe("hammer_and_wrench");
		});
	});

	describe("tracker", () => {
		test("default when config value not set", () => {
			expect(tracker()).toBe("memo");
		});
	});

	describe("ai", () => {
		test("default when config value not set", () => {
			expect(ai()).toBe("exclamation");
		});
	});

	describe("factor", () => {
		test("default when config value not set", () => {
			expect(factor()).toBe("jigsaw");
		});
	});

	describe("smokey", () => {
		test("default when config value not set", () => {
			expect(smokey()).toBe("dash");
		});
	});

	describe("hiPriority", () => {
		test("default when config value not set", () => {
			expect(hiPriority()).toBe(fiery());
		});
	});

	describe("lowPriority", () => {
		test("default when config value not set", () => {
			expect(lowPriority()).toBe(smokey());
		});
	});

	describe("blocked", () => {
		test("default when config value not set", () => {
			expect(blocked()).toBe("no_entry");
		});
	});

	describe("unblocked", () => {
		test("default when config value not set", () => {
			expect(unblocked()).toBe("arrow_forward");
		});
	});

	describe("event", () => {
		test("default when config value not set", () => {
			expect(event()).toBe("small_blue_diamond");
		});
	});

	describe("note", () => {
		test("default when config value not set", () => {
			expect(note()).toBe("spiral_note_pad");
		});
	});

	describe("logEmoji", () => {
		test("LogType.ActionItem", () => {
			expect(logEmoji(LogType.ActionItem)).toBe(ai());
		});

		test("LogType.Blocker", () => {
			expect(logEmoji(LogType.Blocker)).toBe(blocked());
		});

		test("LogType.CommUpdate", () => {
			expect(logEmoji(LogType.CommUpdate)).toBe(comms());
		});

		test("LogType.ContributingFactor", () => {
			expect(logEmoji(LogType.ContributingFactor)).toBe(factor());
		});

		test("LogType.Event", () => {
			expect(logEmoji(LogType.Event)).toBe(event());
		});

		test("LogType.Pr", () => {
			expect(logEmoji(LogType.Pr)).toBe(git());
		});

		test("LogType.Unblock", () => {
			expect(logEmoji(LogType.Unblock)).toBe(unblocked());
		});

		test("undefined LogType", () => {
			expect(logEmoji("undefined_log_type" as LogType)).toBe(note());
		});
	});
});
