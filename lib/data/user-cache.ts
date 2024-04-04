import { isInsideTimeAgo, iso9075Now } from "../core/date.js";
import type { BreakingBotDb, ChatUserId } from "../types/index.js";
import { userCache } from "./schema/user-cache-schema.js";

export type UserEntry = typeof userCache.$inferSelect;
export type UserCache = Map<ChatUserId, UserEntry>;

export const userCacheMerge = (
	userCache: UserCache,
	{ chatUserId, trackerUserId, reporterUserId, name }: UserEntry,
): UserEntry => {
	const previous = userCache.get(chatUserId);

	const entry = {
		chatUserId,
		trackerUserId: trackerUserId ?? previous?.trackerUserId ?? null,
		reporterUserId: reporterUserId ?? previous?.reporterUserId ?? null,
		name: name ?? previous?.name ?? null,
		updatedAt: iso9075Now(),
	};

	userCache.set(entry.chatUserId, entry);

	return entry;
};

export const userCacheGet = (
	userCache: UserCache,
	chatUserId: string,
): UserEntry | null => {
	return userCache.get(chatUserId) ?? null;
};

export const userCacheGetMulti = (
	userCache: UserCache,
	chatUserIds: string[],
): Map<ChatUserId, UserEntry> => {
	const results = new Map();

	for (const chatUserId of chatUserIds) {
		const entry = userCache.get(chatUserId);

		if (!entry) {
			continue;
		}

		results.set(chatUserId, entry);
	}

	return results;
};

export const isUserEntryFreshish = (
	userCache: UserCache,
	durationFreshish: number,
	chatUserId: string,
): boolean => {
	const entry = userCacheGet(userCache, chatUserId);
	return entry ? isInsideTimeAgo(entry.updatedAt, durationFreshish) : false;
};

export const initUserCache = async (db: BreakingBotDb): Promise<UserCache> => {
	const all = await db.select().from(userCache);
	const memCache = new Map();

	for (const entry of all) {
		memCache.set(entry.chatUserId, entry);
	}

	return memCache;
};

export const userDbCacheSet = (db: BreakingBotDb, entry: UserEntry) => {
	const { chatUserId, ...entryWithoutPk } = entry;

	return db
		.insert(userCache)
		.values(entry)
		.onConflictDoUpdate({ target: userCache.chatUserId, set: entryWithoutPk });
};
