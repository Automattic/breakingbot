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
import { type DeepMockProxy, any, mockDeep } from "vitest-mock-extended";
import {
	createBlocker,
	createIncident,
	initRobotIncidents,
} from "../../../test/index.js";
import { iso9075Now } from "../../core/date.js";
import { getLogMostRecentCommUpdates } from "../../data/log.js";
import type { BreakingBot } from "../../types/index.js";
import {
	LOOP_INTERVAL_SECONDS,
	isInitialCommNaggable,
	startAnnoyotron,
	stopAnnoyotron,
} from "../annoyotron.js";

const LOOP_INTERVAL_MS = LOOP_INTERVAL_SECONDS * 1000;

const p2NagIntervals = {
	noComms: 1200,
	noPoint: 1800,
	needCommUpdate: 3600,
	needInitialComm: 360,
};

vi.mock("../../data/log.js", () => {
	return { getLogMostRecentCommUpdates: vi.fn() };
});

describe("annoyotron.ts", () => {
	let robot: DeepMockProxy<BreakingBot>;

	describe("startAnnoyotron", () => {
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

		test("Nags point and comms", async () => {
			const skipAhead = p2NagIntervals.noPoint * 1000 + LOOP_INTERVAL_MS;

			const i2 = createIncident({ id: 2, chatRoomUid: "room2" });
			initRobotIncidents(robot, [i2]);

			// @ts-expect-error
			getLogMostRecentCommUpdates.mockReturnValue({ 2: "2024-02-12 11:10:00" });

			startAnnoyotron(robot);

			await vi.advanceTimersByTimeAsync(skipAhead);
			await vi.advanceTimersByTimeAsync(LOOP_INTERVAL_MS);

			expect(robot.adapter.sendPointNag).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendCommsNag).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendPointNag).toHaveBeenCalledWith(i2, any());
			expect(robot.adapter.sendCommsNag).toHaveBeenCalledWith(i2, any());
			expect(robot.adapter.sendNeedInitialCommNag).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendNeedCommUpdateNag).toHaveBeenCalledTimes(0);
			stopAnnoyotron(robot.annoyotron);
		});

		test("Nags initial comms needed", async () => {
			const skipAhead =
				p2NagIntervals.needInitialComm * 1000 + LOOP_INTERVAL_MS;

			const i6 = createIncident({
				id: 6,
				chatRoomUid: "room6",
				point: "alice",
				comms: "bob",
			});

			initRobotIncidents(robot, [i6]);

			startAnnoyotron(robot);

			await vi.advanceTimersByTimeAsync(skipAhead);
			await vi.advanceTimersByTimeAsync(LOOP_INTERVAL_MS);

			expect(robot.adapter.sendNeedInitialCommNag).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendNeedInitialCommNag).toHaveBeenCalledWith(i6);
			expect(robot.adapter.sendPointNag).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendCommsNag).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendNeedCommUpdateNag).toHaveBeenCalledTimes(0);
			stopAnnoyotron(robot.annoyotron);
		});

		test("Nags comms update needed 2x", async () => {
			const i7 = createIncident({
				id: 7,
				chatRoomUid: "room7",
				point: "alicia",
				comms: "robert",
			});

			initRobotIncidents(robot, [i7]);

			// @ts-expect-error
			getLogMostRecentCommUpdates.mockReturnValue({ 7: "2024-02-14 09:05:00" });

			startAnnoyotron(robot);

			await vi.advanceTimersByTimeAsync(p2NagIntervals.needCommUpdate * 1000);
			await vi.advanceTimersByTimeAsync(LOOP_INTERVAL_MS);
			await vi.advanceTimersByTimeAsync(p2NagIntervals.needCommUpdate * 1000);
			await vi.advanceTimersByTimeAsync(LOOP_INTERVAL_MS);

			expect(robot.adapter.sendNeedCommUpdateNag).toHaveBeenCalledTimes(2);
			expect(robot.adapter.sendNeedCommUpdateNag).toHaveBeenCalledWith(i7);
			expect(robot.adapter.sendPointNag).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendCommsNag).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendNeedInitialCommNag).toHaveBeenCalledTimes(0);
			stopAnnoyotron(robot.annoyotron);
		});

		test("Not nagged happy path", async () => {
			const i8 = createIncident({
				id: 8,
				chatRoomUid: "room8",
				point: "alexa",
				comms: "bobert",
			});

			initRobotIncidents(robot, [i8]);

			// @ts-expect-error
			getLogMostRecentCommUpdates.mockImplementation(() => ({
				8: iso9075Now(),
			}));

			startAnnoyotron(robot);

			await vi.advanceTimersByTimeAsync(p2NagIntervals.noPoint * 5000);
			await vi.advanceTimersByTimeAsync(LOOP_INTERVAL_MS);

			expect(robot.adapter.sendPointNag).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendCommsNag).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendNeedInitialCommNag).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendNeedCommUpdateNag).toHaveBeenCalledTimes(0);
			stopAnnoyotron(robot.annoyotron);
		});

		test("Not nagged because mitigated", async () => {
			const i5 = createIncident({
				id: 5,
				chatRoomUid: "room5",
				mitigatedAt: "2024-02-11 13:10:00",
			});

			initRobotIncidents(robot, [i5]);

			startAnnoyotron(robot);

			await vi.advanceTimersByTimeAsync(p2NagIntervals.noPoint * 5000);
			await vi.advanceTimersByTimeAsync(LOOP_INTERVAL_MS);

			expect(robot.adapter.sendPointNag).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendCommsNag).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendNeedInitialCommNag).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendNeedCommUpdateNag).toHaveBeenCalledTimes(0);
			stopAnnoyotron(robot.annoyotron);
		});

		test("Not nagged because canceled", async () => {
			const i3 = createIncident({
				id: 3,
				chatRoomUid: "room3",
				canceledAt: "2024-02-10 14:54:00",
			});

			initRobotIncidents(robot, [i3]);

			startAnnoyotron(robot);

			await vi.advanceTimersByTimeAsync(p2NagIntervals.noPoint * 5000);
			await vi.advanceTimersByTimeAsync(LOOP_INTERVAL_MS);

			expect(robot.adapter.sendPointNag).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendCommsNag).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendNeedInitialCommNag).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendNeedCommUpdateNag).toHaveBeenCalledTimes(0);
			stopAnnoyotron(robot.annoyotron);
		});

		test("Not nagged because low priority", async () => {
			const i1 = createIncident({ id: 1, chatRoomUid: "room1", priority: 4 });
			initRobotIncidents(robot, [i1]);

			startAnnoyotron(robot);

			await vi.advanceTimersByTimeAsync(p2NagIntervals.noPoint * 5000);
			await vi.advanceTimersByTimeAsync(LOOP_INTERVAL_MS);

			expect(robot.adapter.sendPointNag).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendCommsNag).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendNeedInitialCommNag).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendNeedCommUpdateNag).toHaveBeenCalledTimes(0);
			stopAnnoyotron(robot.annoyotron);
		});

		test("Not nagged because blocked", async () => {
			const i9 = createIncident({
				id: 9,
				chatRoomUid: "room9",
				point: "aly",
				comms: "roberto",
				blockers: [createBlocker()],
			});
			initRobotIncidents(robot, [i9]);

			startAnnoyotron(robot);

			await vi.advanceTimersByTimeAsync(p2NagIntervals.noPoint * 5000);
			await vi.advanceTimersByTimeAsync(LOOP_INTERVAL_MS);

			expect(robot.adapter.sendPointNag).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendCommsNag).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendNeedInitialCommNag).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendNeedCommUpdateNag).toHaveBeenCalledTimes(0);
			stopAnnoyotron(robot.annoyotron);
		});

		test("Nags point and comms even though blocked", async () => {
			const i10 = createIncident({
				id: 10,
				chatRoomUid: "room10",
				blockers: [createBlocker()],
			});

			initRobotIncidents(robot, [i10]);

			startAnnoyotron(robot);

			await vi.advanceTimersByTimeAsync(p2NagIntervals.noPoint * 1000);
			await vi.advanceTimersByTimeAsync(LOOP_INTERVAL_MS);
			await vi.advanceTimersByTimeAsync(LOOP_INTERVAL_MS);

			expect(robot.adapter.sendPointNag).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendCommsNag).toHaveBeenCalledTimes(1);
			expect(robot.adapter.sendNeedInitialCommNag).toHaveBeenCalledTimes(0);
			expect(robot.adapter.sendNeedCommUpdateNag).toHaveBeenCalledTimes(0);
			stopAnnoyotron(robot.annoyotron);
		});

		test("starts with given interval and returns a timeout", () => {
			initRobotIncidents(robot, []);

			const intervalId = startAnnoyotron(robot);

			assertType<NodeJS.Timeout>(intervalId);
			expect(robot.logger.debug).toHaveBeenCalledTimes(1);
		});
	});

	test("stopAnnoyotron", async () => {
		vi.useFakeTimers();
		robot = mockDeep<BreakingBot>();

		initRobotIncidents(robot, []);

		const intervalId = startAnnoyotron(robot);

		await vi.advanceTimersByTimeAsync(3 * LOOP_INTERVAL_MS);

		// we expect ten: the annoyotron start, three event loop start,
		// three num nags sending, three event loop stop debug calls
		expect(robot.logger.debug).toHaveBeenCalledTimes(10);

		stopAnnoyotron(intervalId);

		await vi.advanceTimersByTimeAsync(3 * LOOP_INTERVAL_MS);

		// we still expect ten, because we stopped
		expect(robot.logger.debug).toHaveBeenCalledTimes(10);

		vi.restoreAllMocks();
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	describe("isInitialCommNaggable", () => {
		beforeAll(() => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date(2024, 1, 28, 8, 0, 0));
		});

		afterAll(() => {
			vi.useRealTimers();
		});

		test("naggable, no previous comm update nag", () => {
			expect(isInitialCommNaggable(2, "2024-02-24 00:00:00", null)).toBe(true);
		});

		test("naggable, no recent comm update nag", () => {
			const createdAt = "2024-02-24 00:00:00";
			const lastNag = "2024-02-24 09:12:00";
			expect(isInitialCommNaggable(2, createdAt, lastNag)).toBe(true);
		});

		test("not naggable, recently created", () => {
			const createdAt = "2024-02-28 07:56:23";
			expect(isInitialCommNaggable(2, createdAt, null)).toBe(false);
		});

		test("not naggable, recent comm update nag", () => {
			const createdAt = "2024-02-24 00:00:00";
			const lastNag = "2024-02-28 07:56:23";
			expect(isInitialCommNaggable(2, createdAt, lastNag)).toBe(false);
		});

		test("not naggable, invalid data", () => {
			expect(isInitialCommNaggable(9, "2024-02-24 00:00:00", null)).toBe(false);
		});
	});
});
