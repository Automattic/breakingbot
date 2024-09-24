import { describe, expect, test } from "vitest";
import { anyString } from "vitest-mock-extended";
import { config } from "../../../../../../config/index.js";
import { createLogEntry } from "../../../../../../test/index.js";
import {
	aiBlocks,
	blockquoteBlock,
	bulletList,
	componentsAddedBlocks,
	divider,
	headerBlock,
	mitigatedBlocks,
	mrkdownBlock,
	mrkdownList,
	newBreakingBlocks,
	notesBlocks,
	priorityBlocks,
	richTextBlock,
	upgradePriorityBlocks,
} from "../blocks.js";

describe("slack/blocks.ts", () => {
	test("richTextBlock", () => {
		expect(richTextBlock("Hello world")).toEqual({
			type: "rich_text",
			elements: [
				{
					type: "rich_text_section",
					elements: [
						{
							type: "text",
							text: "Hello world",
						},
					],
				},
			],
		});
	});

	test("mrkdownBlock", () => {
		expect(mrkdownBlock("*bold text* _italic text_")).toEqual({
			type: "section",
			text: {
				type: "mrkdwn",
				text: "*bold text* _italic text_",
			},
		});
	});

	test("headerBlock", () => {
		expect(headerBlock("Heading 1")).toEqual({
			type: "header",
			text: {
				type: "plain_text",
				text: "Heading 1",
				emoji: true,
			},
		});
	});

	test("divider", () => {
		expect(divider()).toEqual({
			type: "divider",
		});
	});

	test("blockquoteBlock", () => {
		expect(blockquoteBlock("Four score...7..")).toEqual({
			type: "rich_text",
			elements: [
				{
					type: "rich_text_quote",
					elements: [
						{
							type: "text",
							text: "Four score...7..",
						},
					],
				},
			],
		});
	});

	describe("bulletList", () => {
		test("rich text structure with no items and no header", () => {
			expect(bulletList([])).toEqual({
				type: "rich_text",
				elements: [
					{
						type: "rich_text_list",
						style: "bullet",
						elements: [],
					},
				],
			});
		});

		test("rich text structure with multiple items and no header", () => {
			const items = ["Item 1", "Item 2", "Item 3"];
			const expectedOutput = {
				type: "rich_text",
				elements: [
					{
						type: "rich_text_list",
						style: "bullet",
						elements: items.map((item) => ({
							type: "rich_text_section",
							elements: [
								{
									type: "text",
									text: item,
								},
							],
						})),
					},
				],
			};

			const result = bulletList(["Item 1", "Item 2", "Item 3"]);
			expect(result).toEqual(expectedOutput);
		});

		test("rich text structure with a header and items", () => {
			const items = ["Item 1", "Item 2", "Item 3"];
			const listHeader = "Header";
			const expectedOutput = {
				type: "rich_text",
				elements: [
					{
						type: "rich_text_section",
						elements: [
							{
								type: "text",
								text: listHeader,
								style: { bold: true },
							},
						],
					},
					{
						type: "rich_text_list",
						style: "bullet",
						elements: items.map((item) => ({
							type: "rich_text_section",
							elements: [
								{
									type: "text",
									text: item,
								},
							],
						})),
					},
				],
			};

			const result = bulletList(items, listHeader);
			expect(result).toEqual(expectedOutput);
		});

		test("rich text structure without a header when undefined is explicitly passed", () => {
			const items = ["Item 1", "Item 2", "Item 3"];
			const listHeader = undefined;
			const expectedOutput = {
				type: "rich_text",
				elements: [
					{
						type: "rich_text_list",
						style: "bullet",
						elements: items.map((item) => ({
							type: "rich_text_section",
							elements: [
								{
									type: "text",
									text: item,
								},
							],
						})),
					},
				],
			};

			const result = bulletList(items, listHeader);
			expect(result).toEqual(expectedOutput);
		});
	});

	test("newBreakingBlocks", () => {
		const expectedOutput = [
			{ type: "divider" },
			{
				type: "header",
				text: {
					type: "plain_text",
					text: "BREAKING NEWS",
					emoji: true,
				},
			},
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: ":fire: :rotating_light: <#C12345> <!channel> started by <@U12345>",
				},
			},
			{ type: "divider" },
		];

		const result = newBreakingBlocks("BREAKING NEWS", "C12345", "U12345");
		expect(result).toEqual(expectedOutput);
	});

	test("upgradePriorityBlocks", () => {
		const expectedOutput = [
			{
				type: "header",
				text: {
					type: "plain_text",
					text: "[P2] Breaking Incident Upgraded!",
					emoji: true,
				},
			},
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: ":fire: *Breaking News*: has been upgraded to *P2*!\n\nupgraded by <@U12345> in <#C12345> <!channel>",
				},
			},
			{ type: "divider" },
		];

		const result = upgradePriorityBlocks(
			"Breaking News",
			2,
			"C12345",
			"U12345",
		);
		expect(result).toEqual(expectedOutput);
	});

	test("priorityBlocks", () => {
		expect(priorityBlocks(config.priorities)).toStrictEqual([
			{
				text: {
					emoji: true,
					text: ":fire: P1",
					type: "plain_text",
				},
				type: "header",
			},
			{
				text: { text: anyString(), type: "mrkdwn" },
				type: "section",
			},
			{
				text: {
					emoji: true,
					text: ":fire: P2 [default]",
					type: "plain_text",
				},
				type: "header",
			},
			{
				text: { text: anyString(), type: "mrkdwn" },
				type: "section",
			},
			{
				text: {
					emoji: true,
					text: ":dash: P3",
					type: "plain_text",
				},
				type: "header",
			},
			{
				text: { text: anyString(), type: "mrkdwn" },
				type: "section",
			},
			{
				text: {
					emoji: true,
					text: ":heavy_multiplication_x: P4",
					type: "plain_text",
				},
				type: "header",
			},
			{
				text: { text: anyString(), type: "mrkdwn" },
				type: "section",
			},
			{
				text: {
					emoji: true,
					text: ":heavy_multiplication_x: P5",
					type: "plain_text",
				},
				type: "header",
			},
			{
				text: { text: anyString(), type: "mrkdwn" },
				type: "section",
			},
		]);
	});

	describe("aiBlocks", () => {
		test("blocks when some ais", () => {
			const ai1 = createLogEntry({ type: "action_item", text: "num one" });
			const ai2 = createLogEntry({ type: "action_item", text: "num two" });
			const blocks = aiBlocks([ai1, ai2], undefined);
			expect(blocks).toStrictEqual([
				...mrkdownList([ai1.text, ai2.text], ":exclamation:", "Action Items"),
				mrkdownBlock("Add with `.ai <title> [=> summary]`"),
			]);
		});

		test("blocks when no ais", () => {
			const blocks = aiBlocks([], undefined);
			expect(blocks).toStrictEqual([
				headerBlock("No action items set"),
				richTextBlock("This incident has no action items"),
				mrkdownBlock("Add with `.ai <title> [=> summary]`"),
			]);
		});
	});

	describe("componentsAddedBlocks", () => {
		test("blocks with a header and plain text when no added or rejected components", () => {
			const blocks = componentsAddedBlocks([], [], []);
			expect(blocks).toStrictEqual([
				headerBlock("Components"),
				richTextBlock("Added to the incident:"),
				richTextBlock("No components added!"),
			]);
		});

		test("blocks with added components", () => {
			const added = ["Component1", "Component3"];
			const dupes = ["Component2"];
			const rejected: string[] = [];
			const blocks = componentsAddedBlocks(added, dupes, rejected);
			expect(blocks).toStrictEqual([
				headerBlock("Components"),
				bulletList(
					["Component1", "Component2", "Component3"],
					"Added to the incident:",
				),
			]);
		});

		test("blocks with rejected components", () => {
			const added: string[] = [];
			const dupes: string[] = [];
			const rejected = ["Component3"];
			const componentList = "https://example.com/components";

			const blocks = componentsAddedBlocks(
				added,
				dupes,
				rejected,
				componentList,
			);

			expect(blocks).toStrictEqual([
				headerBlock("Components"),
				richTextBlock("Added to the incident:"),
				richTextBlock("No components added!"),
				bulletList(rejected, "Skipped these unknown components:"),
				mrkdownBlock(
					"Check out <https://example.com/components|known components> and try again.",
				),
			]);
		});

		test("blocks with both added and rejected components", () => {
			const dupes = ["Component1"];
			const rejected = ["UnknownComponent"];
			const componentList = "https://example.com/components";
			const blocks = componentsAddedBlocks([], dupes, rejected, componentList);

			expect(blocks).toStrictEqual([
				headerBlock("Components"),
				bulletList(["Component1"], "Added to the incident:"),
				bulletList(rejected, "Skipped these unknown components:"),
				mrkdownBlock(
					"Check out <https://example.com/components|known components> and try again.",
				),
			]);
		});

		test("blocks without component list when none is provided", () => {
			const added = ["Component2"];
			const dupes: string[] = [];
			const rejected = ["UnknownComponent"];
			const blocks = componentsAddedBlocks(added, dupes, rejected);

			expect(blocks).toStrictEqual([
				headerBlock("Components"),
				bulletList(["Component2"], "Added to the incident:"),
				bulletList(rejected, "Skipped these unknown components:"),
			]);
		});
	});

	describe("mitigatedBlocks", () => {
		const mitigatedAt = "2024-02-04 16:38:00";

		test("blocks with user timezone", () => {
			const timezone = "America/New_York";
			const comms = "commsUser";
			const messageUserId = "messageUser";
			const blocks = mitigatedBlocks(
				mitigatedAt,
				timezone,
				comms,
				messageUserId,
			);

			expect(blocks).toStrictEqual([
				headerBlock("Incident Mitigated"),
				mrkdownBlock("This incident is marked mitigated at:"),
				blockquoteBlock(`${mitigatedAt} +00:00 (UTC)`),
				mrkdownBlock(
					`(<!date^1707064680^{date_short_pretty} {time}|${mitigatedAt} +00:00 (UTC)> in \`${timezone}\`)`,
				),
				mrkdownBlock(
					`<@${comms}> or <@${messageUserId}>, make sure to \`.notify\` to let people know how the issue was mitigated. Further comms updates aren't required, but _are_ appreciated!`,
				),
			]);
		});

		test("blocks without user timezone", () => {
			const comms = "commsUser";
			const messageUserId = "messageUser";
			const blocks = mitigatedBlocks(mitigatedAt, null, comms, messageUserId);

			expect(blocks).toStrictEqual([
				headerBlock("Incident Mitigated"),
				mrkdownBlock("This incident is marked mitigated at:"),
				blockquoteBlock(`${mitigatedAt} +00:00 (UTC)`),
				mrkdownBlock("Use `.mitigated <when>` if you need adjust."),
				mrkdownBlock(
					`<@${comms}> or <@${messageUserId}>, make sure to \`.notify\` to let people know how the issue was mitigated. Further comms updates aren't required, but _are_ appreciated!`,
				),
			]);
		});

		test("blocks with only messageUserId when comms is null", () => {
			const timezone = "America/New_York";
			const messageUserId = "messageUser";
			const blocks = mitigatedBlocks(
				mitigatedAt,
				timezone,
				null,
				messageUserId,
			);

			expect(blocks).toStrictEqual([
				headerBlock("Incident Mitigated"),
				mrkdownBlock("This incident is marked mitigated at:"),
				blockquoteBlock(`${mitigatedAt} +00:00 (UTC)`),
				mrkdownBlock(
					`(<!date^1707064680^{date_short_pretty} {time}|${mitigatedAt} +00:00 (UTC)> in \`${timezone}\`)`,
				),
				mrkdownBlock(
					`<@${messageUserId}>, make sure to \`.notify\` to let people know how the issue was mitigated. Further comms updates aren't required, but _are_ appreciated!`,
				),
			]);
		});

		test("blocks with only comms when messageUserId is the same as comms", () => {
			const timezone = "America/New_York";
			const commsUserId = "commsUser";
			const blocks = mitigatedBlocks(
				mitigatedAt,
				timezone,
				commsUserId,
				commsUserId,
			);

			expect(blocks).toStrictEqual([
				headerBlock("Incident Mitigated"),
				mrkdownBlock("This incident is marked mitigated at:"),
				blockquoteBlock(`${mitigatedAt} +00:00 (UTC)`),
				mrkdownBlock(
					`(<!date^1707064680^{date_short_pretty} {time}|${mitigatedAt} +00:00 (UTC)> in \`${timezone}\`)`,
				),
				mrkdownBlock(
					`<@${commsUserId}>, make sure to \`.notify\` to let people know how the issue was mitigated. Further comms updates aren't required, but _are_ appreciated!`,
				),
			]);
		});

		test("blocks with different comms and messageUserId", () => {
			const timezone = "America/New_York";
			const commsUserId = "commsUser";
			const messageUserId = "messageUser";
			const blocks = mitigatedBlocks(
				mitigatedAt,
				timezone,
				commsUserId,
				messageUserId,
			);

			expect(blocks).toStrictEqual([
				headerBlock("Incident Mitigated"),
				mrkdownBlock("This incident is marked mitigated at:"),
				blockquoteBlock(`${mitigatedAt} +00:00 (UTC)`),
				mrkdownBlock(
					`(<!date^1707064680^{date_short_pretty} {time}|${mitigatedAt} +00:00 (UTC)> in \`${timezone}\`)`,
				),
				mrkdownBlock(
					`<@${commsUserId}> or <@${messageUserId}>, make sure to \`.notify\` to let people know how the issue was mitigated. Further comms updates aren't required, but _are_ appreciated!`,
				),
			]);
		});
	});

	describe("notesBlocks", () => {
		test("blocks with empty log", () => {
			expect(notesBlocks([])).toStrictEqual([
				headerBlock("Notes"),
				richTextBlock("This incident doesn't have any notes yet."),
				mrkdownBlock("Add with `.note <text>`"),
			]);
		});
	});
});
