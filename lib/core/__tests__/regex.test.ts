import { describe, expect, test } from "vitest";
import { blockerAddRegex, commandsRegex, helpRegex } from "../regex.js";

describe("regex.ts", () => {
	describe("blockerAddRegex", () => {
		test("match a simple blocked command with text", () => {
			const str = ".blocked I don't want to get dressed";
			const result = str.match(blockerAddRegex());
			expect(result?.[1]).toBe("I don't want to get dressed");
		});

		test("match a blocker command with text", () => {
			const result = ".blocker the park looks nice".match(blockerAddRegex());
			expect(result?.[1]).toBe("the park looks nice");
		});

		test("match a blocker command with text and a result", () => {
			const str =
				".blocker i don't want to get dressed => it's soooooo much work";
			const result = str.match(blockerAddRegex());
			expect(result?.[1]).toBe("i don't want to get dressed");
			expect(result?.[2]).toBe("it's soooooo much work");
		});

		test("match a blocked command with text and a result", () => {
			const str =
				".blocked i don't want to get dressed => it's soooooo much work";
			const result = str.match(blockerAddRegex());
			expect(result?.[1]).toBe("i don't want to get dressed");
			expect(result?.[2]).toBe("it's soooooo much work");
		});

		test("match with trailing spaces", () => {
			const str =
				".blocked    something with spaces   =>   result with spaces   ";
			const result = str.match(blockerAddRegex());
			expect(result?.[1]).toBe("something with spaces");
			expect(result?.[2]).toBe("result with spaces   ");
		});

		test("not match if not starting with .blocked or .blocker", () => {
			const result1 = "blah .blocked action => result".match(blockerAddRegex());
			const result2 = "some.blocker action".match(blockerAddRegex());
			expect(result1).toBeNull();
			expect(result2).toBeNull();
		});

		test("not match if => is immediately after the command", () => {
			const result = ".blocked=>this is not valid".match(blockerAddRegex());
			expect(result).toBeNull();
		});

		test("not match if there is no text after the command", () => {
			const result = ".blocked".match(blockerAddRegex());
			expect(result).toBeNull();
		});

		test("match regardless of case", () => {
			const result = ".BLOCKED text goes here".match(blockerAddRegex());
			expect(result?.[1]).toBe("text goes here");
		});

		test("match if there is an equal sign before the arrow", () => {
			const result = ".blocked there=should => be a match".match(
				blockerAddRegex(),
			);
			expect(result?.[1]).toBe("there=should");
			expect(result?.[2]).toBe("be a match");
		});
	});

	describe("commandsRegex", () => {
		test('match ".commands" case insensitively', () => {
			const regex = commandsRegex();
			const commandLowercase = ".commands";
			const commandUppercase = ".COMMANDS";
			const commandMixedCase = ".CoMmaNds";

			expect(regex.test(commandLowercase)).toBe(true);
			expect(regex.test(commandUppercase)).toBe(true);
			expect(regex.test(commandMixedCase)).toBe(true);
		});

		test('should not match strings that do not strictly match ".commands"', () => {
			const regex = commandsRegex();
			const wrongCommands = [
				".command",
				"command",
				".commandss",
				"",
				". commands",
				" .commands",
				"some.commands",
				".commands ",
				"bcommands",
				".commands attention",
			];

			for (const command of wrongCommands) {
				expect(regex.test(command)).toBe(false);
			}
		});
	});

	describe("helpRegex", () => {
		test('match ".help" case insensitively', () => {
			const regex = helpRegex();
			const commandLowercase = ".help";
			const commandUppercase = ".HELP";
			const commandMixedCase = ".HeLp";

			expect(regex.test(commandLowercase)).toBe(true);
			expect(regex.test(commandUppercase)).toBe(true);
			expect(regex.test(commandMixedCase)).toBe(true);
		});

		test('should not match strings that do not strictly match ".help"', () => {
			const regex = helpRegex();
			const wrongCommands = [
				".helpp",
				"help",
				".h3lp",
				"",
				". help",
				" .help",
				"some.help",
				".help ",
				"Whelp",
				".help meeee",
			];

			for (const command of wrongCommands) {
				expect(regex.test(command)).toBe(false);
			}
		});
	});
});
