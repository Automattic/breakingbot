// Description:
//   A hubot script to join all ongoing breaking rooms
//
// Configuration:
//   None
//
// Commands:
//   None
//
// Author:
//   WPVIP

import type { BreakingBot } from "../../../types/index.js";

// biome-ignore lint/style/noDefaultExport: hubot requires it
export default (robot: BreakingBot) => {
	robot.on("incidents.online", async () => {
		robot.adapter.joinRoom(robot.config.breakingMainRoom);

		if (robot.config.breakingNotifyRoom) {
			robot.adapter.joinRoom(robot.config.breakingNotifyRoom);
		}

		const alreadyInRooms = await robot.adapter.getAlreadyInRooms();
		const roomsToJoin = [];

		for (const chatRoomUid of Object.keys(robot.incidents)) {
			if (alreadyInRooms[chatRoomUid]) {
				continue;
			}

			try {
				roomsToJoin.push(robot.adapter.joinRoom(chatRoomUid));
			} catch (err) {
				robot.logger.error(
					`Failed to join room ${chatRoomUid}! ${JSON.stringify(err)}`,
				);
			}
		}

		await Promise.allSettled(roomsToJoin);
		robot.emit("rooms.online");
	});
};
