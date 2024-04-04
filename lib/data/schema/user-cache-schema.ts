import { pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const userCache = pgTable("usercache", {
	chatUserId: varchar("chat_user_id", { length: 2048 }).primaryKey(),
	trackerUserId: varchar("tracker_user_id", { length: 2048 }),
	reporterUserId: varchar("reporter_user_id", { length: 2048 }),
	name: varchar("name", { length: 255 }),
	updatedAt: timestamp("updated_at", { mode: "string" }).notNull(),
});
