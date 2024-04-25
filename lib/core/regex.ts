export const blockerAddRegex = () =>
	/^\.blocke(?:d|r)\s+([^=>]\S*.*?)(?:\s*=>\s*(\S.*))?$/i;

export const helpRegex = () => /^\.help$/i;
