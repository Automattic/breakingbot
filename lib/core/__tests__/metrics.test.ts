import { describe, expect, test } from "vitest";
import { createIncident } from "../../../test/index.js";
import { getCore4, isAnyCore4Set } from "../metrics.js";

describe("metrics.ts", () => {
	describe("getCore4", () => {
		test("all points with fallback pretty strings if none are set", () => {
			const core4 = getCore4(createIncident());

			expect(core4.genesis.prettyString).toBe("use .genesis to set");
			expect(core4.detected.prettyString).toBe("use .detected to set");
			expect(core4.acknowledged.prettyString).toBe(
				"assign .point and .comms to ack",
			);
			expect(core4.mitigated.prettyString).toBe("use .mitigated to set");
			expect(core4.resolved.prettyString).toBe("set when incident is stopped");
		});

		test("pretty strings when dates are set", () => {
			const incident = createIncident({
				genesisAt: "2024-01-01 01:00:00",
				detectedAt: "2024-01-01 02:00:00",
				acknowledgedAt: "2024-01-01 03:04:00",
				mitigatedAt: "2024-01-01 03:24:00",
				resolvedAt: "2024-01-01 05:00:00",
			});
			const core4 = getCore4(incident);

			expect(core4.genesis.prettyString).toBe("2024-01-01 01:00 UTC");
			expect(core4.detected.prettyString).toBe("2024-01-01 02:00 UTC");
			expect(core4.acknowledged.prettyString).toBe("2024-01-01 03:04 UTC");
			expect(core4.mitigated.prettyString).toBe("2024-01-01 03:24 UTC");
			expect(core4.resolved.prettyString).toBe("2024-01-01 05:00 UTC");
			expect(core4.ttd).toBe("1h0m");
			expect(core4.tta).toBe("1h4m");
			expect(core4.ttm).toBe("2h24m");
			expect(core4.ttr).toBe("4h0m");
		});
	});

	describe("isAnyCore4Set", () => {
		test("true if one of the core four points is set", () => {
			const incidentWithGenesisAt = createIncident({
				genesisAt: "2023-01-01T02:00:00Z",
			});
			expect(isAnyCore4Set(incidentWithGenesisAt)).toBe(true);

			const incidentWithDetectedAt = createIncident({
				detectedAt: "2023-01-01T02:05:00Z",
			});
			expect(isAnyCore4Set(incidentWithDetectedAt)).toBe(true);

			const incidentWithAcknowledgedAt = createIncident({
				acknowledgedAt: "2023-01-01T02:10:00Z",
			});
			expect(isAnyCore4Set(incidentWithAcknowledgedAt)).toBe(true);

			const incidentWithMitigatedAt = createIncident({
				mitigatedAt: "2023-01-01T02:15:00Z",
			});
			expect(isAnyCore4Set(incidentWithMitigatedAt)).toBe(true);

			const incidentWithResolvedAt = createIncident({
				resolvedAt: "2023-01-01T03:00:00Z",
			});
			expect(isAnyCore4Set(incidentWithResolvedAt)).toBe(true);
		});

		test("true if all of the core four points are set", () => {
			const incidentWithAllFields = createIncident({
				genesisAt: "2023-01-01T02:00:00Z",
				detectedAt: "2023-01-01T02:05:00Z",
				acknowledgedAt: "2023-01-01T02:10:00Z",
				mitigatedAt: "2023-01-01T02:15:00Z",
				resolvedAt: "2023-01-01T03:00:00Z",
			});
			expect(isAnyCore4Set(incidentWithAllFields)).toBe(true);
		});

		test("false if none of the core four fields are set", () => {
			expect(isAnyCore4Set(createIncident())).toBe(false);
		});
	});
});
