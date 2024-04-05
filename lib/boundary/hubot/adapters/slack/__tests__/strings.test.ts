import { describe, expect, test } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { config } from "../../../../../../config/index.js";
import {
	createBlocker,
	createIncident,
	createLogEntry,
} from "../../../../../../test/index.js";
import { priorityEmoji } from "../../../../../core/priority.js";
import type { IssueTracker } from "../../../../issue-tracker.js";
import {
	blocked,
	hiPriority,
	incidentInactive,
	lowPriority,
} from "../emoji.js";
import {
	decodeHtmlEntities,
	encodeHtmlEntities,
	fmtActionItem,
	fmtChannel,
	fmtIncidentTopic,
	fmtLeadsNoMention,
	fmtTopicEmoji,
	fmtTopicPostfix,
	fmtTopicPrefix,
	fmtUser,
	insertDots,
} from "../strings.js";

describe("slack/string.ts", () => {
	describe("fmtIncidentTopic", () => {
		test("active incident with all details", () => {
			const activeIncident = createIncident({
				title: "Test Incident",
				priority: 1,
				point: "point_person",
				comms: "comms_person",
				triage: "triage_person",
				engLead: "eng_lead",
				blockers: [],
				components: [{ which: "auth-service" }],
			});
			const formattedTrackerUid = "BREAKING-42";

			const topic = fmtIncidentTopic(activeIncident, formattedTrackerUid);
			const expectedTopic = `:${hiPriority()}: [P1][auth-service] *TEST INCIDENT* - Point: <@point_person>, Comms: <@comms_person>, Triage: <@triage_person>, Eng: <@eng_lead>, BREAKING-42`;

			expect(topic).toEqual(expectedTopic);
		});

		test("active incident without roles and without blockage", () => {
			const inactiveIncident = createIncident({
				title: "Test Incident Low Priority",
				priority: config.priorities.defaultLow,
			});

			const topic = fmtIncidentTopic(inactiveIncident);
			const expectedTopic = `:${lowPriority()}: [P3] *TEST INCIDENT LOW PRIORITY* - Point: _nobody_, Comms: _nobody_`;

			expect(topic).toEqual(expectedTopic);
		});

		test("resolved incident with no active roles, blockers, or components", () => {
			const resolvedIncident = createIncident({
				title: "Another Test Incident",
				priority: 2,
				resolvedAt: "2023-01-01 12:00:00",
			});

			const topic = fmtIncidentTopic(resolvedIncident);
			const expectedTopic = `:${incidentInactive()}: [P2] *ANOTHER TEST INCIDENT*`;

			expect(topic).toEqual(expectedTopic);
		});

		test("completed incident with multiple components", () => {
			const incident = createIncident({
				title: "Minor Glitch",
				priority: 4,
				completedAt: "2023-01-02 10:00:00",
				components: [{ which: "gifs" }, { which: "lol" }],
			});
			const topic = fmtIncidentTopic(incident);

			const expectedTopic = `:${incidentInactive()}: [P4][gifs][lol] *MINOR GLITCH*`;
			expect(topic).toEqual(expectedTopic);
		});

		test("completed incident with a report uid", () => {
			const incident = createIncident({
				title: "Minor Glitch",
				priority: 4,
				completedAt: "2023-01-02 10:00:00",
				components: [{ which: "gifs" }],
			});
			const topic = fmtIncidentTopic(incident, "BREAKING-420");

			const expectedTopic = `:${incidentInactive()}: [P4][gifs] *MINOR GLITCH* - BREAKING-420`;
			expect(topic).toEqual(expectedTopic);
		});

		test("blocked incident with all details", () => {
			const activeIncident = createIncident({
				title: "Test Incident",
				priority: 1,
				point: "point_person",
				comms: "comms_person",
				triage: "triage_person",
				engLead: "eng_lead",
				blockers: [{ whomst: "An external system" }],
				components: [{ which: "auth-service" }],
			});
			const formattedTrackerUid = "BREAKING-42";

			const topic = fmtIncidentTopic(activeIncident, formattedTrackerUid);
			const expectedTopic = `:${blocked()}: [P1][blocked][auth-service] *TEST INCIDENT* - Blocked on: An external system, Point: <@point_person>, Comms: <@comms_person>, Triage: <@triage_person>, Eng: <@eng_lead>, BREAKING-42`;

			expect(topic).toEqual(expectedTopic);
		});
	});

	describe("fmtTopicEmoji", () => {
		test("active incident", () => {
			const incident = createIncident();
			expect(fmtTopicEmoji(incident)).toEqual(priorityEmoji(incident.priority));
		});

		test("inactive incident", () => {
			const incident = createIncident({ completedAt: "2024-03-15 22:24:00" });
			expect(fmtTopicEmoji(incident)).toEqual(incidentInactive());
		});

		test("blocked incident", () => {
			const incident = createIncident({ blockers: [createBlocker()] });
			expect(fmtTopicEmoji(incident)).toEqual(blocked());
		});
	});

	describe("fmtTopicPrefix", () => {
		test("empty string when there are no prefixes", () => {
			const prefixes: string[] = [];
			const result = fmtTopicPrefix(prefixes);
			expect(result).toBe("");
		});

		test("single prefix", () => {
			const prefixes = ["P1"];
			const result = fmtTopicPrefix(prefixes);
			expect(result).toBe("[P1] ");
		});

		test("multiple prefixes", () => {
			const prefixes = ["P1", "auth-service", "urgent"];
			const result = fmtTopicPrefix(prefixes);
			expect(result).toBe("[P1][auth-service][urgent] ");
		});
	});

	describe("fmtTopicPostfix", () => {
		test("empty string when there are no details", () => {
			const details: string[] = [];
			const result = fmtTopicPostfix(details);
			expect(result).toBe("");
		});

		test("single detail", () => {
			const details = ["Point: <@point_person>"];
			const result = fmtTopicPostfix(details);
			expect(result).toBe(" - Point: <@point_person>");
		});

		test("multiple details", () => {
			const details = [
				"Point: <@point_person>",
				"Comms: <@comms_person>",
				"Triage: <@triage_person>",
			];
			const result = fmtTopicPostfix(details);
			expect(result).toBe(
				" - Point: <@point_person>, Comms: <@comms_person>, Triage: <@triage_person>",
			);
		});
	});

	describe("fmtActionItem", () => {
		const ai = createLogEntry({
			type: "action_item",
			contextUrl: "https://issuetracker/5",
		});

		const aiNoUrl = createLogEntry({ type: "action_item" });
		const tracker = mockDeep<IssueTracker>();

		test("correctly formatted channel string when a valid channel is provided", () => {
			tracker.fmtUrlForSlack.mockReturnValue("ticket");
			expect(fmtActionItem(ai, tracker)).toBe(`ticket: ${ai.text}`);
		});

		test("ai text when no tracker and url", () => {
			expect(fmtActionItem(ai, null)).toBe(ai.text);
		});

		test("ai text when tracker and no url", () => {
			expect(fmtActionItem(aiNoUrl, tracker)).toBe(aiNoUrl.text);
		});

		test("ai text when null tracker and no url", () => {
			expect(fmtActionItem(aiNoUrl, null)).toBe(aiNoUrl.text);
		});

		test("ai text when undefined tracker and no url", () => {
			expect(fmtActionItem(aiNoUrl, undefined)).toBe(aiNoUrl.text);
		});
	});

	describe("fmtChannel", () => {
		test("correctly formatted channel string when a valid channel is provided", () => {
			expect(fmtChannel("C1234567890")).toBe("<#C1234567890>");
		});

		test("empty string when an empty string is provided", () => {
			expect(fmtChannel("")).toBe("");
		});

		test("empty string when null is provided", () => {
			expect(fmtChannel(null)).toBe("");
		});
	});

	describe("fmtUser", () => {
		test("correctly formatted user string when a valid user is provided", () => {
			expect(fmtUser("U1234567890")).toBe("<@U1234567890>");
		});

		test("empty string when an empty string is provided", () => {
			expect(fmtUser("")).toBe("");
		});

		test("empty string when null is provided", () => {
			expect(fmtUser(null)).toBe("");
		});
	});

	describe("encodeHtmlEntities", () => {
		test("encodes &, >, and < to &amp;, &gt;, and &lt;", () => {
			const rawString = "This & that is > than < stuff.";
			const expectedString = "This &amp; that is &gt; than &lt; stuff.";

			expect(encodeHtmlEntities(rawString)).toBe(expectedString);
		});

		test("returns the same string if there are no entities to decode", () => {
			const plainString = "No HTML entities here!";

			expect(encodeHtmlEntities(plainString)).toBe(plainString);
		});

		test("encodes multiple occurrences of the same entity", () => {
			const rawString = "<< Decrease && Increase >>";
			const expectedString = "&lt;&lt; Decrease &amp;&amp; Increase &gt;&gt;";

			expect(encodeHtmlEntities(rawString)).toBe(expectedString);
		});

		test("advanced blocker case", () => {
			const rawString =
				"Blocked on: customer => whatever thing; just <bust> it";
			const expectedString =
				"Blocked on: customer =&gt; whatever thing; just &lt;bust&gt; it";

			expect(encodeHtmlEntities(rawString)).toBe(expectedString);
		});
	});

	describe("decodeHtmlEntities", () => {
		test("decodes &amp;, &gt;, and &lt; to &, >, and <", () => {
			const encodedString = "This &amp; that is &gt; than &lt; stuff.";
			const expectedString = "This & that is > than < stuff.";

			expect(decodeHtmlEntities(encodedString)).toBe(expectedString);
		});

		test("returns the same string if there are no entities to decode", () => {
			const plainString = "No HTML entities here!";

			expect(decodeHtmlEntities(plainString)).toBe(plainString);
		});

		test("decodes multiple occurrences of the same entity", () => {
			const encodedString = "&lt;&lt; Decrease &amp;&amp; Increase &gt;&gt;";
			const expectedString = "<< Decrease && Increase >>";

			expect(decodeHtmlEntities(encodedString)).toBe(expectedString);
		});
	});

	describe("fmtLeadsNoMention", () => {
		test("format string with point and comms being the same and defined", () => {
			expect(fmtLeadsNoMention("ezra", "ezra")).toBe(
				"e.zra on point and comms",
			);
		});

		test("format string with only point defined", () => {
			expect(fmtLeadsNoMention("ezra", undefined)).toBe("e.zra on point");
		});

		test("format string with only comms defined", () => {
			expect(fmtLeadsNoMention(undefined, "peter")).toBe("p.eter on comms");
		});

		test("format string with both point and comms defined but not equal", () => {
			expect(fmtLeadsNoMention("ezra", "peter")).toBe(
				"e.zra on point, p.eter on comms",
			);
		});

		test("empty string when both point and comms are undefined", () => {
			expect(fmtLeadsNoMention(undefined, undefined)).toBe("");
		});

		test("handle more empty strings properly", () => {
			expect(fmtLeadsNoMention("", "")).toBe("");
			expect(fmtLeadsNoMention("ezra", "")).toBe("e.zra on point");
			expect(fmtLeadsNoMention("", "peter")).toBe("p.eter on comms");
		});
	});

	describe("insertDots", () => {
		test("same string if it has only one character", () => {
			expect(insertDots("a")).toBe("a");
		});

		test("insert a dot between two characters if the string has exactly two characters", () => {
			expect(insertDots("xi")).toBe("x.i");
		});

		test("insert dots at second and second to last positions if the string has a space", () => {
			expect(insertDots("matt smith")).toBe("m.att smit.h");
		});

		test("insert only one dot after the first character if the string is longer than two characters and has no spaces", () => {
			expect(insertDots("john")).toBe("j.ohn");
		});

		test("handle empty string", () => {
			expect(insertDots("")).toBe("");
		});

		test("handle strings with leading or trailing spaces", () => {
			expect(insertDots(" a")).toBe("a");
			expect(insertDots("a ")).toBe("a");
			expect(insertDots(" ab")).toBe("a.b");
			expect(insertDots("ab ")).toBe("a.b");
		});
	});
});
