import { devConfig } from "./dev.js";
import { testConfig } from "./test.js";
import type { AppConfig } from "./types.js";

let config: AppConfig;

switch (process.env.APP_ENV) {
	case "prod": {
		// Add your prod env config here
		break;
	}
	case "staging": {
		// Add your staging env config here
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
