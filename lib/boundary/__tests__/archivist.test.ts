import {
	afterAll,
	afterEach,
	assertType,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from "vitest";
import { type DeepMockProxy, mockDeep } from "vitest-mock-extended";
import {
	createIncident,
	initRobotIncidents,
	mockFluentDbUpdateOnce,
} from "../../../test/index.js";
import { iso9075Now } from "../../core/date.js";
import type { BreakingBot } from "../../types/index.js";
import {
	LOOP_INTERVAL_MINUTES,
	startArchivist,
	stopArchivist,
} from "../archivist.js";

const LOOP_INTERVAL_MS = LOOP_INTERVAL_MINUTES * 60 * 1000;

vi.mock("../../data/log.js", () => {
	return { getLogMostRecentCommUpdates: vi.fn() };
});

describe("archivist.ts", () => {
	let robot: DeepMockProxy<BreakingBot>;

	beforeAll(() => {
		vi.useFakeTimers();
	});

	afterAll(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	beforeEach(() => {
		robot = mockDeep<BreakingBot>();
	});

	afterEach(() => {
		vi.clearAllTimers();
	});

	describe("startArchivist", () => {
		test("Happy path", async () => {
			const i1 = createIncident({ id: 1, chatRoomUid: "room1", priority: 4 });
			const i2 = createIncident({ id: 2, chatRoomUid: "room2" });
			const i3 = createIncident({
				id: 3,
				chatRoomUid: "room3",
				canceledAt: "2024-02-10 14:54:00",
			});
			const i4 = createIncident({ id: 4, chatRoomUid: "room4" });
			const i5 = createIncident({
				id: 5,
				chatRoomUid: "room5",
				mitigatedAt: "2024-02-11 13:10:00",
			});
			const i6 = createIncident({
				id: 6,
				chatRoomUid: "room6",
				completedAt: "2024-02-11 14:32:00",
			});
			const i7 = createIncident({
				id: 7,
				chatRoomUid: "room7",
				archivedAt: "2024-02-11 14:24:00",
			});

			const now = iso9075Now();

			initRobotIncidents(robot, [i1, i2, i3, i4, i5, i6, i7]);
			mockFluentDbUpdateOnce(robot, [{ value: now }]);
			mockFluentDbUpdateOnce(robot, [{ value: now }]);
			mockFluentDbUpdateOnce(robot, [{ value: now }]);

			startArchivist(robot);

			await vi.advanceTimersByTimeAsync(LOOP_INTERVAL_MS);

			expect(robot.adapter.archiveRoom).toHaveBeenCalledTimes(2);
			expect(robot.adapter.archiveRoom).toHaveBeenCalledWith(i3.chatRoomUid);
			expect(robot.adapter.archiveRoom).toHaveBeenCalledWith(i6.chatRoomUid);
			expect(Object.values(robot.incidents).length).toBe(4);
			expect(robot.incidents.room3).toBeUndefined();
			expect(robot.incidents.room6).toBeUndefined();
			expect(robot.incidents.room7).toBeUndefined();
		});

		test("starts with given interval and returns a timeout", () => {
			initRobotIncidents(robot, []);

			const intervalId = startArchivist(robot);

			assertType<NodeJS.Timeout>(intervalId);
			expect(robot.logger.debug).toHaveBeenCalledTimes(1);
		});
	});

	test("stopArchivist", async () => {
		initRobotIncidents(robot, []);

		const intervalId = startArchivist(robot);

		await vi.advanceTimersByTimeAsync(3 * LOOP_INTERVAL_MS);

		// we expect ten: the archivist start, three event loop start,
		// three num archiving, three event loop stop debug calls
		expect(robot.logger.debug).toHaveBeenCalledTimes(10);

		stopArchivist(intervalId);

		await vi.advanceTimersByTimeAsync(3 * LOOP_INTERVAL_MS);

		// we still expect ten, because we stopped
		expect(robot.logger.debug).toHaveBeenCalledTimes(10);
	});
});
