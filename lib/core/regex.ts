export const blockerAddRegex = () =>
	/^\.blocke(?:d|r)\s+([^=>]\S*.*?)(?:\s*=>\s*(\S.*))?$/i;

export const commandsRegex = () => /^\.commands$/i;

export const helpRegex = () => /^\.help$/i;
