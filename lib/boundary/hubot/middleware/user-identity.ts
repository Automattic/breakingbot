// Description:
//   Middleware that lazily resolves user details and stores them in
//   our cache map. Occasionally refreshes. If it feels like it.
//

import { iso9075Now } from "../../../core/date.js";
import {
	isUserEntryFreshish,
	userCacheMerge,
	userDbCacheSet,
} from "../../../data/user-cache.js";
import type { BreakingBot, ChatUserId } from "../../../types/index.js";

const DURATION_FRESHISH = 72 * 60 * 60; // seconds

export const userIdentityMiddleware = (robot: BreakingBot) => {
	robot.listenerMiddleware(async (context) => {
		if (!context.response || !context.response.message.user.id) {
			return true;
		}

		await maybeResolveUser(robot, context.response.message.user.id);

		return true;
	});
};

export const maybeResolveUser = async (
	robot: BreakingBot,
	chatUserId: ChatUserId,
) => {
	if (isUserEntryFreshish(robot.users, DURATION_FRESHISH, chatUserId)) {
		return;
	}

	await resolveUser(robot, chatUserId);
};

const resolveUser = async (
	{ adapter, db, logger, reporter, tracker, users }: BreakingBot,
	chatUserId: ChatUserId,
) => {
	logger.debug(`Updating user cache for chatUserId ${chatUserId}`);

	const { name, email } = await adapter.resolveUser(chatUserId);

	if (!email) {
		logger.warn(`Unable to resolve email at chat platform! id: ${chatUserId}`);
	}

	let trackerUserId = null;

	if (tracker) {
		trackerUserId = await tracker.resolveUserId(email, chatUserId);

		if (!trackerUserId) {
			logger.warn(`Unable to resolve user at issue tracker! id: ${chatUserId}`);
		}
	}

	let reporterUserId = null;

	if (reporter) {
		reporterUserId = await reporter.resolveUserId(email, chatUserId);

		if (!reporterUserId) {
			logger.warn(`Unable resolve user at report platform! id: ${chatUserId}`);
		}
	}

	const entry = {
		chatUserId,
		trackerUserId,
		reporterUserId,
		name,
		updatedAt: iso9075Now(),
	};

	const mergedEntry = userCacheMerge(users, entry);
	return userDbCacheSet(db, mergedEntry);
};
