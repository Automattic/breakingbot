export const blockerAddRegex = () =>
	/^\.blocke(?:d|r)\s+([^=>]\S*.*?)(?:\s*=>\s*(\S.*))?$/i;

export const commandsRegex = () => /^.commands(?:\s+(.*))?$/i;

export const helpRegex = () => /^\.help$/i;
