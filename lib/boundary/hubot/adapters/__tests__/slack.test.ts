import type { SocketModeClient } from "@slack/socket-mode";
import type { WebClient } from "@slack/web-api";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { type DeepMockProxy, anyArray, mockDeep } from "vitest-mock-extended";
import { testConfig } from "../../../../../config/test.js";
import { createIncident, createLogEntry } from "../../../../../test/index.js";
import type { BreakingBot } from "../../../../types/index.js";
import { Slack } from "../slack.js";
import {
	blockquoteBlock,
	breakingListBlocks,
	headerBlock,
	helpBlocks,
	mrkdownBlock,
	newBreakingBlocks,
	priorityBlocks,
} from "../slack/blocks.js";
import { allClear, fiery, incidentCanceled } from "../slack/emoji.js";

describe("slack.ts", () => {
	let slack: Slack;
	let robot: DeepMockProxy<BreakingBot>;
	let socketClient: DeepMockProxy<SocketModeClient>;
	let webClient: DeepMockProxy<WebClient>;

	beforeEach(() => {
		robot = mockDeep<BreakingBot>();
		socketClient = mockDeep<SocketModeClient>();
		webClient = mockDeep<WebClient>();
		slack = new Slack(robot, socketClient, webClient);
	});

	describe("createIncidentRoom", () => {
		test("success", async () => {
			const channel = "someplace";

			webClient.conversations.create.mockResolvedValue({
				ok: true,
				channel: {
					id: "C123456",
					name: channel,
				},
			});

			const result = await slack.createIncidentRoom(channel, []);

			expect(webClient.conversations.create).toHaveBeenCalledWith(
				expect.objectContaining({ name: channel }),
			);

			expect(webClient.conversations.invite).toHaveBeenCalledTimes(0);

			expect(result).toStrictEqual({
				roomId: "C123456",
				roomName: channel,
			});
		});

		test("success with invites", async () => {
			const channel = "someplace";

			webClient.conversations.create.mockResolvedValue({
				ok: true,
				channel: {
					id: "C123456",
					name: channel,
				},
			});

			const result = await slack.createIncidentRoom(channel, ["U123", "U456"]);

			expect(webClient.conversations.create).toHaveBeenCalledWith(
				expect.objectContaining({ name: channel }),
			);

			expect(webClient.conversations.invite).toHaveBeenCalledWith({
				channel: "C123456",
				users: "U123,U456",
			});

			expect(result).toStrictEqual({
				roomId: "C123456",
				roomName: channel,
			});
		});

		test("fail channel create errors out", async () => {
			const channel = "someplace";
			webClient.conversations.create.mockResolvedValue({ ok: false });

			const result = await slack.createIncidentRoom(channel, []);

			expect(webClient.conversations.create).toHaveBeenCalledWith(
				expect.objectContaining({ name: channel }),
			);

			expect(robot.logger.error).toHaveBeenCalledTimes(1);
			expect(webClient.conversations.invite).toHaveBeenCalledTimes(0);
			expect(result).toStrictEqual({});
		});
	});

	describe("notifyNewIncident", () => {
		test("success", async () => {
			const incident = createIncident();

			await slack.notifyNewIncident(incident, "C3984354");

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: newBreakingBlocks(
						incident.title,
						incident.chatRoomUid || "",
						incident.createdBy,
					),
					channel: "C3984354",
					text: ":fire: <#unit-test-breaking-42>: *TESTING 123* started by <@hanni>",
				}),
			);
		});

		test("fails fast if no chatRoomUid", () => {
			const incident = createIncident({ chatRoomUid: null });
			expectProcessExit(async () =>
				slack.notifyNewIncident(incident, "C3984354"),
			);
		});
	});

	describe("notifyNewLowIncident", () => {
		test("success", async () => {
			const incident = createIncident();

			await slack.notifyNewLowIncident(incident, "C3984354");

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: anyArray(),
					channel: "C3984354",
					text: ":fire: <#unit-test-breaking-42>: *TESTING 123* started by <@hanni>",
				}),
			);
		});

		test("fails fast if no chatRoomUid", () => {
			const incident = createIncident({ chatRoomUid: null });
			expectProcessExit(async () =>
				slack.notifyNewIncident(incident, "C3984354"),
			);
		});
	});

	describe("introNewIncident", () => {
		test("success", async () => {
			const incident = createIncident();

			await slack.introNewIncident(incident, testConfig, "BREAKING-123");

			expect(webClient.conversations.setTopic).toHaveBeenCalledWith({
				channel: incident.chatRoomUid,
				topic:
					":fire: [P2] *TESTING 123* - Point: _nobody_, Comms: _nobody_, BREAKING-123",
			});

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([
						headerBlock(incident.title.toUpperCase()),
					]),
					channel: incident.chatRoomUid,
					text: "Tracking TESTING 123 in BREAKING-123",
					// biome-ignore lint/style/useNamingConvention: Slack defined
					unfurl_links: false,
				}),
			);
		});

		test("no chat room errors out", () => {
			const incident = createIncident({ chatRoomUid: null });
			expectProcessExit(async () =>
				slack.introNewIncident(incident, testConfig, "BREAKING-123"),
			);
		});
	});

	describe("updateBreakingTopic", () => {
		test("success", async () => {
			const incident = createIncident();

			await slack.updateBreakingTopic(incident);

			expect(webClient.conversations.setTopic).toHaveBeenCalledWith({
				channel: incident.chatRoomUid,
				topic: ":fire: [P2] *TESTING 123* - Point: _nobody_, Comms: _nobody_",
			});
		});

		test("success with truncation", async () => {
			const incident = createIncident({
				title:
					"Comprehensive Infrastructure Outage Across Multiple Data Centers Affecting Global Operations, Communication Services, Online Platforms, and Customer Support Systems Leading to Extensive Downtime and Service Interruption for Numerous Clients and Partners",
			});

			await slack.updateBreakingTopic(incident);

			expect(webClient.conversations.setTopic).toHaveBeenCalledWith({
				channel: incident.chatRoomUid,
				topic:
					":fire: [P2] *COMPREHENSIVE INFRASTRUCTURE OUTAGE ACROSS MULTIPLE DATA CENTERS AFFECTING GLOBAL OPERATIONS, COMMUNICATION SERVICES, ONLINE PLATFORMS, AND CUSTOMER SUPPORT SYSTEMS LEADING TO EXTENSIVE DOWNTIME AND SERVICE INTERRUPTION FOR NUMEROUS C...",
			});
		});

		test("fails fast if somehow no chatRoomUid", () => {
			const incident = createIncident({ chatRoomUid: null });
			expectProcessExit(async () => slack.updateBreakingTopic(incident));
		});
	});

	test("replyToMessage", () => {
		slack.replyToMessage("C452644", "something", "m353");

		expect(webClient.chat.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				blocks: [mrkdownBlock("something")],
				channel: "C452644",
				text: "something",
				// biome-ignore lint/style/useNamingConvention: Slack defined
				thread_ts: "m353",
			}),
		);
	});

	test("sendRoomEnterWelcome", () => {
		const incident = createIncident({
			chatRoomUid: "C8732838",
			title: "Welcome test!",
			summary: "Some some",
			genesisAt: "2024-01-01 01:00:00",
			detectedAt: "2024-01-01 02:00:00",
			acknowledgedAt: "2024-01-01 03:04:00",
			mitigatedAt: "2024-01-01 03:24:00",
			resolvedAt: "2024-01-01 05:00:00",
		});

		slack.sendRoomEnterWelcome(incident, "W287B322");

		expect(webClient.chat.postEphemeral).toHaveBeenCalledWith(
			expect.objectContaining({
				blocks: anyArray(),
				channel: "C8732838",
				text: "Hi, <@W287B322>! Welcome to <#C8732838>.",
				user: "W287B322",
			}),
		);
	});

	test("sendComponentsAdded", () => {
		slack.sendComponentsAdded(
			"C8732838",
			["apple, plum"],
			["carrot"],
			["kale"],
			"m898",
		);

		expect(webClient.chat.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				blocks: expect.arrayContaining([headerBlock("Components")]),
				channel: "C8732838",
				text: "Components added: apple, plum; dupes: carrot; rejected: kale",
				// biome-ignore lint/style/useNamingConvention: Slack defined
				thread_ts: "m898",
			}),
		);
	});

	describe("sendSummary", () => {
		test("send a summary", () => {
			slack.sendSummary("C8732838", "Sum sum summary!", "wargable");

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([headerBlock("Summary")]),
					channel: "C8732838",
					text: "Sum sum summary!",
					// biome-ignore lint/style/useNamingConvention: Slack defined
					thread_ts: "wargable",
				}),
			);
		});

		test("send a fallback summary when input is null", () => {
			slack.sendSummary("C8732838", null, "wargable");

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([headerBlock("Summary")]),
					channel: "C8732838",
					text: "Use `.summary <incident summary>` to set",
					// biome-ignore lint/style/useNamingConvention: Slack defined
					thread_ts: "wargable",
				}),
			);
		});
	});

	test("sendSummaryUpdated", () => {
		slack.sendSummaryUpdated("C8732838", "So summery!", "U12345", "m235");

		expect(webClient.chat.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				blocks: anyArray(),
				channel: "C8732838",
				text: 'Thanks, <@U12345>! I have updated the summary: "So summery!"',
				// biome-ignore lint/style/useNamingConvention: Slack defined
				thread_ts: "m235",
			}),
		);
	});

	test("sendPointTakeover", () => {
		slack.sendPointTakeover("C8732838", "U49324", "https://wp.com", "m453");

		expect(webClient.chat.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				blocks: expect.arrayContaining([headerBlock("Point Takeover")]),
				channel: "C8732838",
				text: "Congrats <@U49324>, you are point!",
				// biome-ignore lint/style/useNamingConvention: Slack defined
				thread_ts: "m453",
			}),
		);
	});

	test("sendCommsTakeover", () => {
		slack.sendCommsTakeover("C8732838", "U49324", "https://wp.com", "m453");

		expect(webClient.chat.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				blocks: expect.arrayContaining([headerBlock("Comms Takeover")]),
				channel: "C8732838",
				text: "Congrats <@U49324>, you are comms!",
				// biome-ignore lint/style/useNamingConvention: Slack defined
				thread_ts: "m453",
			}),
		);
	});

	test("sendTriageTakeover", () => {
		slack.sendTriageTakeover("C8732838", "U49324", "https://wp.com", "m453");

		expect(webClient.chat.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				blocks: expect.arrayContaining([headerBlock("Triage Takeover")]),
				channel: "C8732838",
				text: "Congrats <@U49324>, you are triage!",
				// biome-ignore lint/style/useNamingConvention: Slack defined
				thread_ts: "m453",
			}),
		);
	});

	test("sendEngLeadTakeover", () => {
		slack.sendEngLeadTakeover("C8732838", "U49324", "https://wp.com", "m453");

		expect(webClient.chat.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				blocks: expect.arrayContaining([headerBlock("Engineer Lead Takeover")]),
				channel: "C8732838",
				text: "Congrats <@U49324>, you are eng!",
				// biome-ignore lint/style/useNamingConvention: Slack defined
				thread_ts: "m453",
			}),
		);
	});

	test("sendGenesisUpdated", () => {
		slack.sendGenesisUpdated(
			"C8732838",
			"2024-01-26 12:32:00",
			"Africa/Casablanca",
			"m837",
		);

		expect(webClient.chat.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				blocks: expect.arrayContaining([
					headerBlock("Incident Genesis Updated"),
					blockquoteBlock("2024-01-26 12:32:00 +00:00 (UTC)"),
				]),
				channel: "C8732838",
				text: "This incident genesis is now set at: 2024-01-26 12:32:00 +00:00 (UTC)",
				// biome-ignore lint/style/useNamingConvention: Slack defined
				thread_ts: "m837",
			}),
		);
	});

	test("sendDetectedUpdated", () => {
		slack.sendDetectedUpdated(
			"C8732838",
			"2024-01-26 12:32:00",
			"Africa/Casablanca",
			"m837",
		);

		expect(webClient.chat.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				blocks: expect.arrayContaining([
					headerBlock("Incident Detected Updated"),
					blockquoteBlock("2024-01-26 12:32:00 +00:00 (UTC)"),
				]),
				channel: "C8732838",
				text: "This incident detected is now set at: 2024-01-26 12:32:00 +00:00 (UTC)",
				// biome-ignore lint/style/useNamingConvention: Slack defined
				thread_ts: "m837",
			}),
		);
	});

	test("sendMitigated", () => {
		slack.sendMitigated(
			"C8732838",
			"2024-01-26 12:32:00",
			"Africa/Casablanca",
			"U49324",
			"U47878",
			"m837",
		);

		expect(webClient.chat.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				blocks: expect.arrayContaining([headerBlock("Incident Mitigated")]),
				channel: "C8732838",
				text: "This incident is marked mitigated at: 2024-01-26 12:32:00 +00:00 (UTC)",
				// biome-ignore lint/style/useNamingConvention: Slack defined
				thread_ts: "m837",
			}),
		);
	});

	describe("sendResolved", () => {
		test("success", () => {
			const incident = createIncident();

			slack.sendResolved(incident, [], undefined, "m837");

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([
						headerBlock(`ALL CLEAR! :${allClear()}:`),
					]),
					channel: incident.chatRoomUid,
					text: "All clear! for incident TESTING 123",
					// biome-ignore lint/style/useNamingConvention: Slack defined
					unfurl_links: false,
				}),
			);
		});

		test("fails fast if no chatRoomUid", () => {
			const incident = createIncident({ chatRoomUid: null });
			expectProcessExit(async () =>
				slack.sendResolved(incident, [], undefined, "m837"),
			);
		});
	});

	describe("notifyResolvedIncident", () => {
		test("success", async () => {
			const incident = createIncident({ resolvedAt: "2024-02-27 19:30:00" });

			await slack.notifyResolvedIncident(incident, "C3984354");

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: anyArray(),
					channel: "C3984354",
					text: ":sunny: <#unit-test-breaking-42>: [P2] *TESTING 123* resolved after 34 days, 5 hours, 10 minutes :dove_of_peace:",
				}),
			);
		});

		test("fails fast if no chatRoomUid", () => {
			const incident = createIncident({
				chatRoomUid: null,
				resolvedAt: "2024-02-27 19:30:00",
			});

			expectProcessExit(async () =>
				slack.notifyResolvedIncident(incident, "C3984354"),
			);
		});

		test("fails fast if no resolvedAt", () => {
			const incident = createIncident({ chatRoomUid: "C3984354" });
			expectProcessExit(async () =>
				slack.notifyResolvedIncident(incident, "C3984354"),
			);
		});
	});

	describe("notifyResolvedLowIncident", () => {
		test("success", async () => {
			const incident = createIncident({ resolvedAt: "2024-02-27 19:30:00" });

			await slack.notifyResolvedLowIncident(incident, "C3984354");

			const text =
				":sunny: <#unit-test-breaking-42>: [P2] *TESTING 123* resolved after 34 days, 5 hours, 10 minutes :dove_of_peace:";

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: [mrkdownBlock(text)],
					channel: "C3984354",
					text,
				}),
			);
		});

		test("fails fast if no chatRoomUid", () => {
			const incident = createIncident({
				chatRoomUid: null,
				resolvedAt: "2024-02-27 19:30:00",
			});

			expectProcessExit(async () =>
				slack.notifyResolvedLowIncident(incident, "C3984354"),
			);
		});

		test("fails fast if no resolvedAt", () => {
			const incident = createIncident({ chatRoomUid: "C3984354" });
			expectProcessExit(async () =>
				slack.notifyResolvedLowIncident(incident, "C3984354"),
			);
		});
	});

	describe("notifyCanceled", () => {
		test("success", () => {
			const incident = createIncident();
			const text = `:heavy_multiplication_x: CANCELED: ~<#unit-test-breaking-42>: [P2] ${incident.title.toUpperCase()}~`;

			slack.notifyCanceled(incident, "#main-room");

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([
						headerBlock(`CANCELED :${incidentCanceled()}:`),
					]),
					channel: incident.chatRoomUid,
					text,
				}),
			);

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([mrkdownBlock(text)]),
					channel: "#main-room",
					text,
				}),
			);
		});

		test("success with notify room", () => {
			const incident = createIncident();
			const text = `:heavy_multiplication_x: CANCELED: ~<#unit-test-breaking-42>: [P2] ${incident.title.toUpperCase()}~`;

			slack.notifyCanceled(incident, "#main-room", "#notify-room");

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([
						headerBlock(`CANCELED :${incidentCanceled()}:`),
					]),
					channel: incident.chatRoomUid,
					text,
				}),
			);

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([mrkdownBlock(text)]),
					channel: "#main-room",
					text,
				}),
			);

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([mrkdownBlock(text)]),
					channel: "#notify-room",
					text,
				}),
			);
		});

		test("success with low priority skipping notify room", () => {
			const incident = createIncident({ priority: 4 });
			const text = `:heavy_multiplication_x: CANCELED: ~<#unit-test-breaking-42>: [P4] ${incident.title.toUpperCase()}~`;

			slack.notifyCanceled(incident, "#main-room", "#notify-room");

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([
						headerBlock(`CANCELED :${incidentCanceled()}:`),
					]),
					channel: incident.chatRoomUid,
					text,
				}),
			);

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([mrkdownBlock(text)]),
					channel: "#main-room",
					text,
				}),
			);

			expect(webClient.chat.postMessage).not.toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([mrkdownBlock(text)]),
					channel: "#notify-room",
					text,
				}),
			);
		});

		test("fails fast if no chatRoomUid", () => {
			const incident = createIncident({ chatRoomUid: null });
			expectProcessExit(async () => slack.notifyCanceled(incident, "#smroom"));
		});
	});

	describe("notifyRestarted", () => {
		test("success", () => {
			const incident = createIncident();
			const text = `:fire: RESTARTED: <#unit-test-breaking-42>: [P2] *${incident.title.toUpperCase()}*`;

			slack.notifyRestarted(incident, "#main-room");

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([
						headerBlock(`RESTARTED! :${fiery()}:`),
					]),
					channel: incident.chatRoomUid,
					text,
				}),
			);

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([mrkdownBlock(text)]),
					channel: "#main-room",
					text,
				}),
			);
		});

		test("success with notify room", () => {
			const incident = createIncident();
			const text = `:fire: RESTARTED: <#unit-test-breaking-42>: [P2] *${incident.title.toUpperCase()}*`;

			slack.notifyRestarted(incident, "#main-room", "#notify-room");

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([
						headerBlock(`RESTARTED! :${fiery()}:`),
					]),
					channel: incident.chatRoomUid,
					text,
				}),
			);

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([mrkdownBlock(text)]),
					channel: "#main-room",
					text,
				}),
			);

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([mrkdownBlock(text)]),
					channel: "#notify-room",
					text,
				}),
			);
		});

		test("success with low priority skipping notify room", () => {
			const incident = createIncident({ priority: 3 });
			const text = `:dash: RESTARTED: <#unit-test-breaking-42>: [P3] *${incident.title.toUpperCase()}*`;

			slack.notifyRestarted(incident, "#main-room", "#notify-room");

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([
						headerBlock(`RESTARTED! :${fiery()}:`),
					]),
					channel: incident.chatRoomUid,
					text,
				}),
			);

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([mrkdownBlock(text)]),
					channel: "#main-room",
					text,
				}),
			);

			expect(webClient.chat.postMessage).not.toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([mrkdownBlock(text)]),
					channel: "#notify-room",
					text,
				}),
			);
		});

		test("fails fast if no chatRoomUid", () => {
			const incident = createIncident({ chatRoomUid: null });
			expectProcessExit(async () => slack.notifyRestarted(incident, "#smroom"));
		});
	});

	test("sendTimeParseError", () => {
		slack.sendTimeParseError(
			"C8732838",
			"two yorgle blots ago",
			"Africa/Casablanca",
			"Do something else?",
			"m405",
		);

		expect(webClient.chat.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				blocks: anyArray(),
				channel: "C8732838",
				text: "Error parsing `two yorgle blots ago` as a time (in `Africa/Casablanca`",
				// biome-ignore lint/style/useNamingConvention: Slack defined
				thread_ts: "m405",
				// biome-ignore lint/style/useNamingConvention: Slack defined
				unfurl_links: false,
			}),
		);
	});

	describe("sendAddedActionItem", () => {
		test("send with tracker", () => {
			const logEntry = createLogEntry();

			robot.tracker?.fmtUidForSlack.mockReturnValue("BREAKING-456");
			robot.tracker?.newActionItem.mockResolvedValue([
				"BREAKING-456",
				"https://somejira/BREAKING-456",
			]);

			slack.sendAddedActionItem(
				"C8732838",
				logEntry,
				"BREAKING-456",
				"BREAKING-123",
				robot.tracker,
				"m405",
			);

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([
						mrkdownBlock(
							"I've added an action item BREAKING-456 for `UOTHER456, just noting this down` and linked it to parent BREAKING-456.",
						),
					]),
					channel: "C8732838",
					text: `Added action item \`${logEntry.text}\``,
					// biome-ignore lint/style/useNamingConvention: Slack defined
					thread_ts: "m405",
					// biome-ignore lint/style/useNamingConvention: Slack defined
					unfurl_links: false,
				}),
			);
		});

		test("send without tracker", () => {
			const logEntry = createLogEntry();

			slack.sendAddedActionItem("C8732838", logEntry, null, null, null, "m405");

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([
						mrkdownBlock(
							"I've added an action item `UOTHER456, just noting this down`",
						),
					]),
					channel: "C8732838",
					text: `Added action item \`${logEntry.text}\``,
					// biome-ignore lint/style/useNamingConvention: Slack defined
					thread_ts: "m405",
					// biome-ignore lint/style/useNamingConvention: Slack defined
					unfurl_links: false,
				}),
			);
		});

		test("send with backticks in the input", () => {
			const logEntry = createLogEntry({ text: "do version `2.1.1` upgrade" });

			slack.sendAddedActionItem("C8732838", logEntry, null, null, null, "m405");

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([
						mrkdownBlock(
							"I've added an action item `do version 2.1.1 upgrade`",
						),
					]),
					channel: "C8732838",
					text: "Added action item `do version 2.1.1 upgrade`",
					// biome-ignore lint/style/useNamingConvention: Slack defined
					thread_ts: "m405",
					// biome-ignore lint/style/useNamingConvention: Slack defined
					unfurl_links: false,
				}),
			);
		});
	});

	test("sendAiList", async () => {
		const ais = [
			createLogEntry({ type: "actionitem", text: "do something 1" }),
			createLogEntry({ type: "actionitem", text: "do something 2" }),
			createLogEntry({ type: "actionitem", text: "do something 2" }),
		];

		await slack.sendAiList("C8732838", ais, robot.tracker, "m405");

		expect(webClient.chat.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				blocks: expect.arrayContaining([headerBlock("Action Items")]),
				channel: "C8732838",
				text: "Action Items: 3",
				// biome-ignore lint/style/useNamingConvention: Slack defined
				thread_ts: "m405",
			}),
		);
	});

	test("sendAddedFactor", async () => {
		const logEntry = createLogEntry();

		await slack.sendAddedFactor("C8732838", logEntry, "m405");

		expect(webClient.chat.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				blocks: expect.arrayContaining([
					mrkdownBlock(
						`I've added \`${logEntry.text}\` as a contributing factor¹.`,
					),
				]),
				channel: "C8732838",
				text: `Added contributing factor \`${logEntry.text}\``,
				// biome-ignore lint/style/useNamingConvention: Slack defined
				thread_ts: "m405",
				// biome-ignore lint/style/useNamingConvention: Slack defined
				unfurl_links: false,
			}),
		);
	});

	test("sendContributingFactorList", async () => {
		await slack.sendContributingFactorList(
			"C8732838",
			[createLogEntry(), createLogEntry(), createLogEntry()],
			"m405",
		);

		expect(webClient.chat.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				blocks: expect.arrayContaining([headerBlock("Contributing Factors")]),
				channel: "C8732838",
				text: "Contributing Factors: 3",
				// biome-ignore lint/style/useNamingConvention: Slack defined
				thread_ts: "m405",
				// biome-ignore lint/style/useNamingConvention: Slack defined
				unfurl_links: false,
			}),
		);
	});

	test("sendBreakingList", async () => {
		const overview = {
			fiery: [createIncident()],
			mitigated: [createIncident(), createIncident()],
			inactive: [],
		};

		await slack.sendBreakingList("C8732838", overview, null, "m405");

		expect(webClient.chat.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				blocks: breakingListBlocks(
					overview.fiery,
					overview.mitigated,
					overview.inactive,
					null,
				),
				channel: "C8732838",
				text: "Breakings: 3 active, 0 inactive",
				// biome-ignore lint/style/useNamingConvention: Slack defined
				thread_ts: "m405",
			}),
		);
	});

	test("sendPriorities", async () => {
		await slack.sendPriorities("C8732838", testConfig.priorities, "m405");

		expect(webClient.chat.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				blocks: priorityBlocks(testConfig.priorities),
				channel: "C8732838",
				text: "Priorities: P1, P2, P3, P4, P5",
				// biome-ignore lint/style/useNamingConvention: Slack defined
				thread_ts: "m405",
				// biome-ignore lint/style/useNamingConvention: Slack defined
				unfurl_links: false,
			}),
		);
	});

	test("sendAddedPr", async () => {
		await slack.sendAddedPr(
			"C8732838",
			createLogEntry({ text: "https://githublink" }),
			"m405",
		);

		expect(webClient.chat.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				blocks: expect.arrayContaining([headerBlock("Added PR")]),
				channel: "C8732838",
				text: "Added PR: https://githublink",
				// biome-ignore lint/style/useNamingConvention: Slack defined
				thread_ts: "m405",
				// biome-ignore lint/style/useNamingConvention: Slack defined
				unfurl_links: false,
			}),
		);
	});

	describe("sendPrsList", () => {
		test("num of prs === 1", async () => {
			await slack.sendPrsList("C8732838", [createLogEntry()], "m405");

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([
						headerBlock("Change Summary"),
						mrkdownBlock("There is 1 PR attached to this incident."),
					]),
					channel: "C8732838",
					text: "PRs: 1",
					// biome-ignore lint/style/useNamingConvention: Slack defined
					thread_ts: "m405",
					// biome-ignore lint/style/useNamingConvention: Slack defined
					unfurl_links: false,
				}),
			);
		});

		test("num of prs > 1", async () => {
			await slack.sendPrsList(
				"C8732838",
				[createLogEntry(), createLogEntry(), createLogEntry()],
				"m405",
			);

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([
						headerBlock("Change Summary"),
						mrkdownBlock("There are 3 PRs attached to this incident."),
					]),
					channel: "C8732838",
					text: "PRs: 3",
					// biome-ignore lint/style/useNamingConvention: Slack defined
					thread_ts: "m405",
					// biome-ignore lint/style/useNamingConvention: Slack defined
					unfurl_links: false,
				}),
			);
		});

		test("num of prs === 0", async () => {
			await slack.sendPrsList("C8732838", [], "m405");

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: expect.arrayContaining([
						headerBlock("Change Summary"),
						mrkdownBlock("There are 0 PRs attached to this incident."),
					]),
					channel: "C8732838",
					text: "PRs: 0",
					// biome-ignore lint/style/useNamingConvention: Slack defined
					thread_ts: "m405",
					// biome-ignore lint/style/useNamingConvention: Slack defined
					unfurl_links: false,
				}),
			);
		});
	});

	test("sendHelpMessage", async () => {
		await slack.sendHelpMessage("C8732838", testConfig, "m405");

		expect(webClient.chat.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				blocks: helpBlocks(testConfig),
				channel: "C8732838",
				text: `Help: ${testConfig.runbookRootUrl}`,
				// biome-ignore lint/style/useNamingConvention: Slack defined
				thread_ts: "m405",
				// biome-ignore lint/style/useNamingConvention: Slack defined
				unfurl_links: false,
			}),
		);
	});

	describe("sendMaintenanceAlert", () => {
		test("send without specific message", async () => {
			await slack.sendMaintenanceAlert(testConfig.commPlatform, "C784574");

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: [mrkdownBlock(":boom: SoMEthInG wENt wRonG!")],
					channel: "C784574",
					text: ":boom: SoMEthInG wENt wRonG!",
					// biome-ignore lint/style/useNamingConvention: Slack defined
					unfurl_links: false,
				}),
			);
		});

		test("send with specific message", async () => {
			await slack.sendMaintenanceAlert(
				testConfig.commPlatform,
				"C784574",
				"oof, ouch, bammy happened",
			);

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: [mrkdownBlock(":boom: oof, ouch, bammy happened")],
					channel: "C784574",
					text: ":boom: oof, ouch, bammy happened",
					// biome-ignore lint/style/useNamingConvention: Slack defined
					unfurl_links: false,
				}),
			);
		});

		test("send with mention without specific message", async () => {
			const cfg = { ...testConfig.commPlatform, botEngSubteamId: "S278874" };

			await slack.sendMaintenanceAlert(cfg, "C784574");

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: [
						mrkdownBlock(
							":boom: Hey <!subteam^S278874>, SoMEthInG wENt wRonG!",
						),
					],
					channel: "C784574",
					text: ":boom: Hey <!subteam^S278874>, SoMEthInG wENt wRonG!",
					// biome-ignore lint/style/useNamingConvention: Slack defined
					unfurl_links: false,
				}),
			);
		});

		test("send with mention with specific message", async () => {
			const cfg = { ...testConfig.commPlatform, botEngSubteamId: "S278874" };

			await slack.sendMaintenanceAlert(
				cfg,
				"C784574",
				"oof, ouch, bammy happened",
			);

			expect(webClient.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					blocks: [
						mrkdownBlock(
							":boom: Hey <!subteam^S278874>, oof, ouch, bammy happened",
						),
					],
					channel: "C784574",
					text: ":boom: Hey <!subteam^S278874>, oof, ouch, bammy happened",
					// biome-ignore lint/style/useNamingConvention: Slack defined
					unfurl_links: false,
				}),
			);
		});

		test("send without channel does noting", async () => {
			await slack.sendMaintenanceAlert(testConfig.commPlatform);
			expect(webClient.chat.postMessage).not.toHaveBeenCalled();
		});
	});

	test("sendCommandsMessage", async () => {
		await slack.sendCommandsMessage("C8732838", ["cmd1", "cmd2"], "m405");

		expect(webClient.chat.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				blocks: expect.arrayContaining([
					mrkdownBlock("cmd1"),
					mrkdownBlock("cmd2"),
				]),
				channel: "C8732838",
				text: "Commands: 2",
				// biome-ignore lint/style/useNamingConvention: Slack defined
				thread_ts: "m405",
				// biome-ignore lint/style/useNamingConvention: Slack defined
				unfurl_links: false,
			}),
		);
	});

	describe("validateUser", () => {
		test("valid", async () => {
			webClient.users.info.mockResolvedValueOnce({
				ok: true,
				// biome-ignore lint/style/useNamingConvention: Slack defined
				user: { is_bot: false },
			});

			expect(await slack.validateUser("U123ABC456")).toBe(true);
		});

		test("invalid bot", async () => {
			webClient.users.info.mockResolvedValueOnce({
				ok: true,
				// biome-ignore lint/style/useNamingConvention: Slack defined
				user: { is_bot: true },
			});

			expect(await slack.validateUser("U123ABC456")).toBe(false);
		});

		test("invalid undefined", async () => {
			webClient.users.info.mockResolvedValueOnce({ ok: false });
			expect(await slack.validateUser("U123ABC456")).toBe(false);
		});
	});

	describe("resolveUser", () => {
		test("success", async () => {
			webClient.users.info.mockResolvedValueOnce({
				ok: true,
				user: {
					// biome-ignore lint/style/useNamingConvention: Slack defined
					is_bot: false,
					name: "luis",
					profile: {
						// biome-ignore lint/style/useNamingConvention: Slack defined
						display_name: "Luis A.",
						// biome-ignore lint/style/useNamingConvention: Slack defined
						real_name: "Luis Alton",
						email: "luis@example.com",
					},
				},
			});

			expect(await slack.resolveUser("U123ABC456")).toStrictEqual({
				name: "Luis A.",
				email: "luis@example.com",
			});
		});

		test("success with real name fallback", async () => {
			webClient.users.info.mockResolvedValueOnce({
				ok: true,
				user: {
					// biome-ignore lint/style/useNamingConvention: Slack defined
					is_bot: false,
					name: "luis",
					profile: {
						// biome-ignore lint/style/useNamingConvention: Slack defined
						real_name: "Luis Alton",
						email: "luis@example.com",
					},
				},
			});

			expect(await slack.resolveUser("U123ABC456")).toStrictEqual({
				name: "Luis Alton",
				email: "luis@example.com",
			});
		});

		test("success with name fallback", async () => {
			webClient.users.info.mockResolvedValueOnce({
				ok: true,
				user: {
					// biome-ignore lint/style/useNamingConvention: Slack defined
					is_bot: false,
					name: "luis",
					profile: { email: "luis@example.com" },
				},
			});

			expect(await slack.resolveUser("U123ABC456")).toStrictEqual({
				name: "luis",
				email: "luis@example.com",
			});
		});

		test("success with name fallback no profile", async () => {
			webClient.users.info.mockResolvedValueOnce({
				ok: true,
				// biome-ignore lint/style/useNamingConvention: Slack defined
				user: { is_bot: false, name: "luis" },
			});

			expect(await slack.resolveUser("U123ABC456")).toStrictEqual({
				name: "luis",
			});
		});

		test("success with no name no profile", async () => {
			webClient.users.info.mockResolvedValueOnce({
				ok: true,
				// biome-ignore lint/style/useNamingConvention: Slack defined
				user: { is_bot: false },
			});

			expect(await slack.resolveUser("U123ABC456")).toStrictEqual({
				name: "Not Sure",
			});
		});
	});

	describe("normalizeUserIdInput", () => {
		test("strip slack user ID correctly for U-prefixed IDs", () => {
			expect(slack.normalizeUserIdInput("<@U123ABC456>")).toBe("U123ABC456");
		});

		test("strip slack user ID correctly for W-prefixed IDs", () => {
			expect(slack.normalizeUserIdInput("<@W987XYZ654>")).toBe("W987XYZ654");
		});

		test("noop strings without user formatting", () => {
			expect(slack.normalizeUserIdInput("U123ABC456")).toBe("U123ABC456");
		});
	});

	describe("resolveText", () => {
		test("resolve an empty string without links", async () => {
			expect(await slack.resolveText("")).toBe("");
		});

		test("resolve a string without Slack formatting", async () => {
			const text = "Just some regular text.";
			expect(await slack.resolveText(text)).toBe(text);
		});

		describe("Resolve user links", () => {
			test("resolve a user link with label to Slack member id", async () => {
				const result = await slack.resolveText("<@U1234|sally>");
				expect(result).toBe("<@U1234>");
			});

			test("resolve a user link without label to Slack member id", async () => {
				const result = await slack.resolveText(
					"request volume spiked again when <@U0123456> ran e2e tests",
				);
				expect(result).toBe(
					"request volume spiked again when <@U0123456> ran e2e tests",
				);
			});
		});

		describe("Resolve conversation links", () => {
			test("resolve a conversation with label to the label", async () => {
				const result = await slack.resolveText(
					"<#C39NTSKE45|vip-breaking-701> update: VIP services are restored and stable.",
				);
				expect(result).toBe(
					"#vip-breaking-701 update: VIP services are restored and stable.",
				);
			});

			test("resolve a conversation without label", async () => {
				webClient.conversations.info.mockResolvedValueOnce({
					ok: true,
					channel: { name: "tumblr-breaking-420" },
				});

				const result = await slack.resolveText("Over in <#C67NTMT65>.");
				expect(result).toBe("Over in #tumblr-breaking-420.");
			});
		});

		describe("Resolve special mentions links", () => {
			test("resolve a conversation with label to the label", async () => {
				const result = await slack.resolveText(
					"<http://example.com|example link> <http://example.com> <#C0838UC2D|general> <!here>",
				);
				expect(result).toBe(
					"example link (http://example.com) http://example.com #general @here",
				);
			});
		});

		describe("Resolve links", () => {
			test("resolve a link by removing the escaping", async () => {
				const result = await slack.resolveText(
					"Disabled Scheduled e2e tests here: <https://github.com/Automattic/blahblah/123>",
				);
				expect(result).toBe(
					"Disabled Scheduled e2e tests here: https://github.com/Automattic/blahblah/123",
				);
			});

			test("resolve multiple links by removing the escaping", async () => {
				const result = await slack.resolveText(
					"<https://github.com/Automattic/blahblahblah#L1335> this check here and this one here <https://github.com/Automattic/blahblahblah#L1348> are broken because of a cast to string, and caused recursion",
				);
				expect(result).toBe(
					"https://github.com/Automattic/blahblahblah#L1335 this check here and this one here https://github.com/Automattic/blahblahblah#L1348 are broken because of a cast to string, and caused recursion",
				);
			});

			test("resolve a link with label by using the label and removing the escaping", async () => {
				const result = await slack.resolveText(
					"The House - <https://example.zendesk.com/agent/tickets/7567|#7567>",
				);
				expect(result).toBe(
					"The House - #7567 (https://example.zendesk.com/agent/tickets/7567)",
				);
			});

			test("resolve multiple links with label by using the label and removing the escaping", async () => {
				const result = await slack.resolveText(
					"Database load was accompanied by flood of <https://a8c.slack.com/archives/blahblah|queries from the >`client-site`<https://a8c.slack.com/archives/bluhbluh| module> that persisted even after endpoints were blocked (`/v1/somethings` and `/v1/elses`)",
				);
				expect(result).toBe(
					"Database load was accompanied by flood of queries from the  (https://a8c.slack.com/archives/blahblah)`client-site` module (https://a8c.slack.com/archives/bluhbluh) that persisted even after endpoints were blocked (`/v1/somethings` and `/v1/elses`)",
				);
			});
		});
	});
});

const expectProcessExit = async (fnUnderTest: () => Promise<unknown>) => {
	const mockExit = vi
		.spyOn(process, "exit")
		.mockImplementation((code?: number) => {
			throw new Error(`Process.exit(${code})`);
		});

	try {
		await fnUnderTest();
	} catch (e) {
		if (!(e instanceof Error)) {
			throw e;
		}

		expect(mockExit).toHaveBeenCalledTimes(1);
		expect(e.message).toBe("Process.exit(1)");
	}

	mockExit.mockRestore();
};
