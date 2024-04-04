import * as affectedSchema from "./affected-schema.js";
import * as blockerSchema from "./blocker-schema.js";
import * as componentSchema from "./component-schema.js";
import * as incidentSchema from "./incident-schema.js";
import * as logSchema from "./log-entry-schema.js";
import * as userCacheSchema from "./user-cache-schema.js";

export const schema = {
	...incidentSchema,
	...logSchema,
	...affectedSchema,
	...blockerSchema,
	...componentSchema,
	...userCacheSchema,
};
