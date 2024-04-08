import { devConfig } from "./dev.js";
import { testConfig } from "./test.js";
import type { AppConfig } from "./types.js";

let config: AppConfig;

switch (process.env.APP_ENV) {
	case "prod": {
		break;
	}
	case "staging": {
		break;
	}
	case "test": {
		config = testConfig;
		break;
	}
	default:
		config = devConfig;
}

export { config };
