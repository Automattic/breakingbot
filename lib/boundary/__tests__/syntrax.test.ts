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
	mockFluentDbSelectDistinctOnce,
	mockFluentDbSelectOnce,
} from "../../../test/index.js";
import type { BreakingBot } from "../../types/index.js";
import {
	LOOP_INTERVAL_SECONDS,
	startSyntrax,
	stopSyntrax,
} from "../syntrax.js";

const LOOP_INTERVAL_MS = LOOP_INTERVAL_SECONDS * 1000;

vi.mock("../../data/log.js", () => {
	return { getLogMostRecentCommUpdates: vi.fn() };
});

describe("syntrax.ts", () => {
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

	describe("startSyntrax", () => {
		/* @TODO: happy path tests! */

		test("starts with given interval and returns a timeout", () => {
			const intervalId = startSyntrax(robot);
			assertType<NodeJS.Timeout>(intervalId);
			expect(robot.logger.debug).toHaveBeenCalledTimes(1);
		});
	});

	test("stopSyntrax", async () => {
		mockFluentDbSelectDistinctOnce(robot, []);
		mockFluentDbSelectOnce(robot, []);

		const intervalId = startSyntrax(robot);

		await vi.advanceTimersByTimeAsync(3 * LOOP_INTERVAL_MS);

		// we expect ten: the syntrax start, three event loop start,
		// three num syncing, and three event loop stop debug calls
		expect(robot.logger.debug).toHaveBeenCalledTimes(10);

		stopSyntrax(intervalId);

		await vi.advanceTimersByTimeAsync(3 * LOOP_INTERVAL_MS);

		// we still expect seven, because we stopped
		expect(robot.logger.debug).toHaveBeenCalledTimes(10);
	});
});
