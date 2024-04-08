import { beforeEach, describe, expect, test } from "vitest";
import { anyObject, mockDeep } from "vitest-mock-extended";
import {
	TEST_TRACKER,
	createIncident,
	createLogEntry,
	createReviewedIncident,
} from "../../../../test/index.js";
import { IncidentState } from "../../../core/fsm.js";
import { currentPersistedState } from "../../../data/incident.js";
import { userCacheMerge } from "../../../data/user-cache.js";
import { Jira } from "../jira.js";

import type { Version2Client, Version3Client } from "jira.js";
import type { DeepMockProxy } from "vitest-mock-extended";
import type { JiraConfig } from "../../../../config/types.js";
import type { UserCache } from "../../../data/user-cache.js";
import type { BreakingBot } from "../../../types/index.js";

describe("jira.ts", () => {
	let jira: Jira;
	let robot: DeepMockProxy<BreakingBot>;
	let webClient2: DeepMockProxy<Version2Client>;
	let webClient3: DeepMockProxy<Version3Client>;
	let userCache: UserCache;

	beforeEach(() => {
		robot = mockDeep<BreakingBot>();
		webClient2 = mockDeep<Version2Client>();
		webClient3 = mockDeep<Version3Client>();
		userCache = new Map();
		jira = new Jira(
			testJiraConfig,
			robot.logger,
			userCache,
			webClient2,
			webClient3,
		);
	});

	describe("init", () => {
		test("success", async () => {
			webClient3.myself.getCurrentUser.mockResolvedValue({ accountId: 123 });
			expect(await jira.init()).toBe(true);
			expect(jira.self).toStrictEqual({ accountId: 123 });
		});

		test("failure", async () => {
			expect(await jira.init()).toBe(false);
		});
	});

	describe("createIssue", () => {
		test("success", async () => {
			webClient2.issues.createIssue.mockResolvedValue({ key: "BREAKING-123" });
			const result = await jira.createIssue(createIncident());
			expect(result).toBe("BREAKING-123");
			expect(webClient2.issues.createIssue).toHaveBeenCalledWith({
				fields: anyObject(),
			});
		});
	});

	describe("sync", () => {
		test("success on happy path", async () => {
			const incident = createReviewedIncident();
			const state = currentPersistedState(incident);
			const log = [createLogEntry()];
			const rfrId = testJiraConfig.transitions["Ready For Review"].toString();
			const completedId = testJiraConfig.transitions.Completed.toString();

			await jira.sync(incident, state, log);
			await jira.sync(incident, state, log);
			await jira.sync(incident, state, log);
			await jira.sync(incident, state, log);
			await jira.sync(incident, IncidentState.Completed, log);
			await jira.sync(incident, IncidentState.Completed, log);
			await jira.sync(incident, IncidentState.Completed, log);

			expect(webClient2.issues.editIssue).toHaveBeenCalledTimes(7);
			expect(webClient2.issues.editIssue).toHaveBeenCalledWith({
				issueIdOrKey: TEST_TRACKER,
				fields: anyObject(),
			});

			expect(webClient3.issues.doTransition).toHaveBeenCalledTimes(2);
			expect(webClient3.issues.doTransition).toHaveBeenCalledWith({
				issueIdOrKey: TEST_TRACKER,
				transition: { id: rfrId },
			});
			expect(webClient3.issues.doTransition).toHaveBeenCalledWith({
				issueIdOrKey: TEST_TRACKER,
				transition: { id: completedId },
			});
		});

		test("failure", async () => {
			const incident = createIncident({ trackerUid: null });
			const state = currentPersistedState(incident);
			await jira.sync(incident, state, []);

			expect(webClient2.issues.editIssue).toHaveBeenCalledTimes(0);
			expect(webClient3.issues.doTransition).toHaveBeenCalledTimes(0);
			expect(robot.logger.warn).toHaveBeenCalledWith(
				"JIRA: missing issue key!",
			);
		});
	});

	describe("syncCommUpdate", () => {
		test("success", async () => {
			userCacheMerge(userCache, {
				chatUserId: "UOTHER456",
				trackerUserId: "so456",
				reporterUserId: null,
				name: "Cindy",
				updatedAt: "2024-03-18 11:19:00",
			});

			await jira.syncCommUpdate(
				createReviewedIncident(),
				createLogEntry({ text: "<@UOTHER456>, you rock" }),
			);

			expect(webClient2.issueComments.addComment).toHaveBeenCalledWith({
				issueIdOrKey: TEST_TRACKER,
				comment: "Comm update:\n\n[~accountid:so456], you rock",
			});
		});

		test("failure", async () => {
			const incident = createIncident({ trackerUid: null });
			await jira.syncCommUpdate(incident, createLogEntry());

			expect(webClient2.issueComments.addComment).toHaveBeenCalledTimes(0);
			expect(robot.logger.warn).toHaveBeenCalledWith(
				"JIRA: missing issue key!",
			);
		});
	});

	describe("newActionItem", () => {
		test("success with cache hit", async () => {
			webClient2.issues.createIssue.mockResolvedValue({ key: "BREAKING-43" });

			const incident = createIncident();

			userCacheMerge(userCache, {
				chatUserId: "UABC123",
				trackerUserId: "nyu38hhikab09eino",
				reporterUserId: null,
				name: "Emil",
				updatedAt: "2024-03-18 13:10:00",
			});

			const [key, url] = await jira.newActionItem(
				incident,
				"some summary",
				"UABC123",
			);

			expect(key).toBe("BREAKING-43");
			expect(url).toBe("https://unit-test.jira.local/browse/BREAKING-43");
			expect(webClient2.issues.createIssue).toHaveBeenCalledWith({
				fields: {
					project: { key: "BREAKINGT" },
					issuetype: { name: "Task" },
					summary: "some summary",
					labels: ["unit-test-breaking-actionitem"],
					description: expect.stringContaining(
						jira.fmtUser("nyu38hhikab09eino"),
					),
					parent: { key: "BREAKING-42" },
				},
			});
		});
	});

	test("addInterestedParty", async () => {
		await jira.addInterestedParty("BREAKING-123", "am3994meks");
		expect(webClient3.issueWatchers.addWatcher).toHaveBeenCalled();
	});

	test("isAlreadyInterestedParty", async () => {
		await jira.addInterestedParty("BRK-123", "am3994meks");
		expect(jira.isAlreadyInterestedParty("BRK-123", "am3994meks")).toBe(true);
	});

	describe("resolveUserId", () => {
		test("success with cache hit", async () => {
			userCacheMerge(userCache, {
				chatUserId: "UABC123",
				trackerUserId: "nyu38hhikab09eino",
				reporterUserId: null,
				name: "Emil",
				updatedAt: "2024-03-18 13:10:00",
			});

			const result = await jira.resolveUserId(null, "UABC123", userCache);

			expect(result).toBe("nyu38hhikab09eino");
		});

		test("success with cache miss", async () => {
			webClient3.userSearch.findUsers.mockResolvedValue([
				{ accountId: "nyu38hhikab09eino" },
			]);

			const result = await jira.resolveUserId("e@wp.com", "UABC123", userCache);
			expect(result).toBe("nyu38hhikab09eino");
		});

		test("failure", async () => {
			webClient3.userSearch.findUsers.mockResolvedValue([]);
			const result = await jira.resolveUserId("e@wp.com");
			expect(result).toBeNull();
		});

		test("failure no query", async () => {
			const result = await jira.resolveUserId(null, "UABC123");
			expect(result).toBeNull();
		});
	});

	test("fmtUidForSlack", () => {
		expect(jira.fmtUidForSlack("BREAKING-123")).toBe(
			"<https://unit-test.jira.local/browse/BREAKING-123|BREAKING-123>",
		);
	});

	test("fmtUrlForSlack", () => {
		expect(
			jira.fmtUrlForSlack("https://unit-test.jira.local/browse/BREAKING-123"),
		).toBe("<https://unit-test.jira.local/browse/BREAKING-123|BREAKING-123>");
	});
});

const testJiraConfig: JiraConfig = {
	type: "JIRA",
	host: "unit-test.jira.local",
	fields: {
		platform: "customfield_10023",
		epicName: "customfield_10100",
		breakingPriority: "customfield_10101",
		genesis: "customfield_10070",
		detected: "customfield_10080",
		acknowledged: "customfield_10119",
		mitigated: "customfield_10001",
		resolved: "customfield_10014",
		incidentReview: "customfield_10084",
		chatRoomUid: "customfield_10074",
		incidentPointPerson: "customfield_10044",
		incidentCommsPerson: "customfield_10045",
	},
	trackingIssue: {
		projectKey: "BREAKINGT",
		labels: ["unit-test-breaking"],
	},
	actionItems: {
		projectKey: "BREAKINGT",
		labels: ["unit-test-breaking-actionitem"],
	},
	transitions: {
		[IncidentState.Started]: 1,
		[IncidentState.Acknowledged]: 2,
		[IncidentState.Mitigated]: 3,
		[IncidentState.Blocked]: 4,
		[IncidentState.Resolved]: 5,
		[IncidentState.ReadyForReview]: 6,
		[IncidentState.Completed]: 7,
		[IncidentState.Archived]: 8,
		[IncidentState.Canceled]: 9,
	},
	botAccount: {
		id: "breakingbot",
		jiraId: "339l9dunnaont93ndimoak",
	},
	breakingRoomPrefix: "unit-test-breaking-",
	chatRoomUrl: "https://unit-test.slack.local/messages",
	chatUserIdRegex: /(<@[UW][A-Z0-9]{5,19}>)|\b([UW][A-Z0-9]{5,19})\b/g,
} as const;
