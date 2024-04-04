import type { Robot } from "hubot";

const hiddenCommandsPattern = () => {
	const hiddenCommands =
		process.env.HUBOT_HELP_HIDDEN_COMMANDS != null
			? process.env.HUBOT_HELP_HIDDEN_COMMANDS.split(",").map((c) => c.trim())
			: undefined;
	if (hiddenCommands) {
		return new RegExp(
			`^hubot (?:${
				hiddenCommands != null ? hiddenCommands.join("|") : undefined
			}) - `,
		);
	}
};

export const getHelpCommands = (robot: Robot) => {
	let helpCommands = robot.helpCommands();

	const robotName = robot.alias || robot.name;
	const hiddenPattern = hiddenCommandsPattern();

	if (hiddenPattern) {
		helpCommands = helpCommands.filter(
			(command) => !hiddenPattern.test(command),
		);
	}

	helpCommands = helpCommands.map((command) => {
		if (robotName.length === 1) {
			return command.replace(/^hubot\s*/i, robotName);
		}

		return command.replace(/^hubot/i, robotName);
	});

	return helpCommands.sort();
};
