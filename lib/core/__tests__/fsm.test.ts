import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from "vitest";
import { createBlocker, createIncident } from "../../../test/index.js";
import type { NagState } from "../../boundary/annoyotron.js";
import {
	Annoyotron,
	DONE,
	IncidentState,
	NAG,
	TutorialState,
	newAnnoyotronMachine,
	newIncidentMachine,
} from "../fsm.js";
import { priorityNags } from "../priority.js";

describe("fsm.ts", () => {
	describe("newIncidentMachine", () => {
		describe("Happy Path (Started => ... => Archived)", () => {
			test("succeeds", () => {
				const i1 = createIncident();
				const fsm = newIncidentMachine(i1);

				expect(fsm.state()).toBe(IncidentState.Started);

				i1.point = "russell";
				i1.comms = "mike";

				fsm.action("ack");
				expect(fsm.state()).toBe(IncidentState.Acknowledged);

				i1.acknowledgedAt = "2024-01-22 11:23:00";

				fsm.action("mitigate");
				expect(fsm.state()).toBe(IncidentState.Mitigated);

				i1.mitigatedAt = "2024-01-22 11:50:00";

				fsm.action("resolve");
				expect(fsm.state()).toBe(IncidentState.Resolved);

				i1.resolvedAt = "2024-01-22 11:54:30";

				i1.assigned = "nick";
				i1.summary = "it's raining!!1";
				i1.genesisAt = "2024-01-22 05:12:20";
				i1.detectedAt = "2024-01-22 11:21:30";
				i1.components.push({ incidentId: 42, which: "parka" });

				fsm.action("rfr");
				expect(fsm.state()).toBe(IncidentState.ReadyForReview);

				i1.readyForReviewAt = "2024-01-22 11:29:30";
				i1.completedAt = "2024-01-22 12:19:30";

				fsm.action("complete");
				expect(fsm.state()).toBe(IncidentState.Completed);

				i1.archivedAt = "2024-01-23 12:19:30";

				fsm.action("archive");
				expect(fsm.state()).toBe(IncidentState.Archived);
			});
		});

		describe("Started -> Acknowledged", () => {
			test("succeeds with point and comms", () => {
				const fsm = newIncidentMachine(
					createIncident({
						point: "russell",
						comms: "mike",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Started);
				fsm.action("ack");
				expect(fsm.state()).toBe(IncidentState.Acknowledged);
			});

			test("succeeds no point or comms but acknowledgedAt", () => {
				const fsm = newIncidentMachine(
					createIncident({
						acknowledgedAt: "2024-02-26 13:26:00",
						mitigatedAt: "2024-02-26 13:30:00",
					}),
				);

				fsm.action("restart");
				expect(fsm.state()).toBe(IncidentState.Started);
				fsm.action("ack");
				expect(fsm.state()).toBe(IncidentState.Acknowledged);
			});

			test("succeeds with point and acknowledgedAt", () => {
				const fsm = newIncidentMachine(
					createIncident({
						point: "russell",
						acknowledgedAt: "2024-02-26 13:26:00",
						mitigatedAt: "2024-02-26 13:30:00",
					}),
				);

				fsm.action("restart");
				expect(fsm.state()).toBe(IncidentState.Started);
				fsm.action("ack");
				expect(fsm.state()).toBe(IncidentState.Acknowledged);
			});

			test("succeeds with comms and acknowledgedAt", () => {
				const fsm = newIncidentMachine(
					createIncident({
						comms: "mike",
						acknowledgedAt: "2024-02-26 13:26:00",
						mitigatedAt: "2024-02-26 13:30:00",
					}),
				);

				fsm.action("restart");
				expect(fsm.state()).toBe(IncidentState.Started);
				fsm.action("ack");
				expect(fsm.state()).toBe(IncidentState.Acknowledged);
			});

			test("fails entry without comms and point", () => {
				const fsm = newIncidentMachine(createIncident());

				expect(fsm.state()).toBe(IncidentState.Started);
				fsm.action("ack");
				expect(fsm.state()).toBe(IncidentState.Started);
			});

			test("fails entry without comms", () => {
				const fsm = newIncidentMachine(createIncident({ point: "russell" }));

				expect(fsm.state()).toBe(IncidentState.Started);
				fsm.action("ack");
				expect(fsm.state()).toBe(IncidentState.Started);
			});

			test("fails entry without point", () => {
				const fsm = newIncidentMachine(createIncident({ comms: "mike" }));

				expect(fsm.state()).toBe(IncidentState.Started);
				fsm.action("ack");
				expect(fsm.state()).toBe(IncidentState.Started);
			});

			test("reverse transition invalid", () => {
				const fsm = newIncidentMachine(
					createIncident({
						point: "russell",
						comms: "mike",
						acknowledgedAt: "2024-01-22 10:15:00",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Acknowledged);
				fsm.transition(IncidentState.Started);
				expect(fsm.state()).toBe(IncidentState.Acknowledged);
			});
		});

		describe("Started -> Mitigated", () => {
			test("succeeds", () => {
				const fsm = newIncidentMachine(createIncident());

				expect(fsm.state()).toBe(IncidentState.Started);
				fsm.action("mitigate");
				expect(fsm.state()).toBe(IncidentState.Mitigated);
			});

			test("reverse forced transition valid", () => {
				const fsm = newIncidentMachine(
					createIncident({
						acknowledgedAt: "2024-01-22 11:40:00",
						mitigatedAt: "2024-01-22 11:40:00",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Mitigated);
				fsm.action("restart");
				expect(fsm.state()).toBe(IncidentState.Started);
			});
		});

		describe("Started -> Resolved", () => {
			test("succeeds", () => {
				const fsm = newIncidentMachine(createIncident());

				expect(fsm.state()).toBe(IncidentState.Started);
				fsm.action("resolve");
				expect(fsm.state()).toBe(IncidentState.Resolved);
			});

			test("reverse forced transition valid", () => {
				const fsm = newIncidentMachine(
					createIncident({
						acknowledgedAt: "2024-01-22 11:40:00",
						mitigatedAt: "2024-01-22 11:40:00",
						resolvedAt: "2024-01-22 11:40:00",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Resolved);
				fsm.action("restart");
				expect(fsm.state()).toBe(IncidentState.Started);
			});
		});

		describe("Started -> Ready For Review", () => {
			test("fails", () => {
				const fsm = newIncidentMachine(createIncident());

				expect(fsm.state()).toBe(IncidentState.Started);
				fsm.action("rfr");
				expect(fsm.state()).toBe(IncidentState.Started);
			});
		});

		describe("Started -> Completed", () => {
			test("fails", () => {
				const fsm = newIncidentMachine(createIncident());

				expect(fsm.state()).toBe(IncidentState.Started);
				fsm.action("complete");
				expect(fsm.state()).toBe(IncidentState.Started);
			});
		});

		describe("Started -> Archived", () => {
			test("fails", () => {
				const fsm = newIncidentMachine(createIncident());

				expect(fsm.state()).toBe(IncidentState.Started);
				fsm.action("archive");
				expect(fsm.state()).toBe(IncidentState.Started);
			});
		});

		describe("Started -> Canceled", () => {
			test("succeeds", () => {
				const fsm = newIncidentMachine(createIncident());

				expect(fsm.state()).toBe(IncidentState.Started);
				fsm.action("cancel");
				expect(fsm.state()).toBe(IncidentState.Canceled);
			});

			test("reverse forced transition invalid", () => {
				const fsm = newIncidentMachine(
					createIncident({ canceledAt: "2024-01-22 17:28:30" }),
				);

				expect(fsm.state()).toBe(IncidentState.Canceled);
				fsm.force_transition(IncidentState.Started);
				expect(fsm.state()).toBe(IncidentState.Canceled);
			});
		});

		describe("Started -> Blocked", () => {
			test("succeeds", () => {
				const fsm = newIncidentMachine(createIncident());

				expect(fsm.state()).toBe(IncidentState.Started);

				fsm.data().blockers = [createBlocker()];
				fsm.action("block");

				expect(fsm.state()).toBe(IncidentState.Blocked);
			});

			test("fails without blockers", () => {
				const fsm = newIncidentMachine(createIncident({}));

				expect(fsm.state()).toBe(IncidentState.Started);
				fsm.action("block");
				expect(fsm.state()).toBe(IncidentState.Started);
			});

			test("reverse forced transition valid", () => {
				const fsm = newIncidentMachine(
					createIncident({ blockers: [createBlocker()] }),
				);

				expect(fsm.state()).toBe(IncidentState.Blocked);

				fsm.data().blockers = [];
				fsm.action("unblock");

				expect(fsm.state()).toBe(IncidentState.Started);
			});
		});

		describe("Acknowledged -> Mitigated", () => {
			test("succeeds", () => {
				const fsm = newIncidentMachine(
					createIncident({
						point: "russell",
						comms: "mike",
						acknowledgedAt: "2024-01-22 17:16:00",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Acknowledged);
				fsm.action("mitigate");
				expect(fsm.state()).toBe(IncidentState.Mitigated);
			});

			test("fails exit without acknowledged timestamp", () => {
				const fsm = newIncidentMachine(
					createIncident({
						point: "russell",
						comms: "mike",
					}),
				);

				fsm.force_transition(IncidentState.Acknowledged);

				expect(fsm.state()).toBe(IncidentState.Acknowledged);
				fsm.action("mitigate");
				expect(fsm.state()).toBe(IncidentState.Acknowledged);
			});
		});

		describe("Acknowledged -> Resolved", () => {
			test("succeeds", () => {
				const fsm = newIncidentMachine(
					createIncident({
						point: "russell",
						comms: "mike",
						acknowledgedAt: "2024-01-22 17:16:00",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Acknowledged);
				fsm.action("resolve");
				expect(fsm.state()).toBe(IncidentState.Resolved);
			});

			test("fails exit without acknowledged timestamp", () => {
				const fsm = newIncidentMachine(
					createIncident({
						point: "russell",
						comms: "mike",
					}),
				);

				fsm.force_transition(IncidentState.Acknowledged);

				expect(fsm.state()).toBe(IncidentState.Acknowledged);
				fsm.action("resolve");
				expect(fsm.state()).toBe(IncidentState.Acknowledged);
			});
		});

		describe("Acknowledged -> Acknowledged", () => {
			test("does nothing", () => {
				const fsm = newIncidentMachine(
					createIncident({
						point: "russell",
						comms: "mike",
						acknowledgedAt: "2024-01-22 21:02:00",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Acknowledged);
				fsm.action("ack");
				expect(fsm.state()).toBe(IncidentState.Acknowledged);
			});
		});

		describe("Acknowledged -> Blocked", () => {
			test("succeeds", () => {
				const fsm = newIncidentMachine(
					createIncident({ acknowledgedAt: "2024-01-22 21:02:00" }),
				);
				expect(fsm.state()).toBe(IncidentState.Acknowledged);

				fsm.data().blockers = [createBlocker()];
				fsm.action("block");

				expect(fsm.state()).toBe(IncidentState.Blocked);
			});

			test("fails without blockers", () => {
				const fsm = newIncidentMachine(
					createIncident({
						point: "russell",
						comms: "mike",
						acknowledgedAt: "2024-01-22 21:02:00",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Acknowledged);
				fsm.action("block");
				expect(fsm.state()).toBe(IncidentState.Acknowledged);
			});

			test("reverse forced transition invalid", () => {
				const fsm = newIncidentMachine(
					createIncident({
						acknowledgedAt: "2024-01-22 21:02:00",
						blockers: [createBlocker()],
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Blocked);

				fsm.data().blockers = [];
				fsm.force_transition(IncidentState.Acknowledged);

				expect(fsm.state()).toBe(IncidentState.Blocked);
			});
		});

		describe("Acknowledged -> Canceled", () => {
			test("succeeds", () => {
				const fsm = newIncidentMachine(
					createIncident({
						point: "bob",
						comms: "jo",
						acknowledgedAt: "2024-01-27 20:21:30",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Acknowledged);
				fsm.action("cancel");
				expect(fsm.state()).toBe(IncidentState.Canceled);
			});
		});

		describe("Mitigated -> Resolved", () => {
			test("succeeds", () => {
				const fsm = newIncidentMachine(
					createIncident({
						acknowledgedAt: "2024-01-22 21:02:00",
						mitigatedAt: "2024-02-06 10:25:00",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Mitigated);
				fsm.action("resolve");
				expect(fsm.state()).toBe(IncidentState.Resolved);
			});
		});

		describe("Mitigated -> Mitigated", () => {
			test("does nothing", () => {
				const fsm = newIncidentMachine(
					createIncident({
						acknowledgedAt: "2024-01-22 21:02:00",
						mitigatedAt: "2024-02-06 10:25:00",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Mitigated);
				fsm.action("mitigate");
				expect(fsm.state()).toBe(IncidentState.Mitigated);
			});
		});

		describe("Mitigated -> Blocked", () => {
			test("succeeds", () => {
				const fsm = newIncidentMachine(
					createIncident({
						acknowledgedAt: "2024-01-27 20:22:30",
						mitigatedAt: "2024-01-27 20:22:30",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Mitigated);

				fsm.data().blockers = [createBlocker()];
				fsm.action("block");

				expect(fsm.state()).toBe(IncidentState.Blocked);
			});

			test("fails without blockers", () => {
				const fsm = newIncidentMachine(
					createIncident({
						acknowledgedAt: "2024-01-27 20:22:30",
						mitigatedAt: "2024-01-27 20:22:30",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Mitigated);
				fsm.action("block");
				expect(fsm.state()).toBe(IncidentState.Mitigated);
			});

			test("reverse forced transition invalid", () => {
				const fsm = newIncidentMachine(
					createIncident({
						acknowledgedAt: "2024-01-27 20:22:30",
						mitigatedAt: "2024-01-27 20:22:30",
						blockers: [createBlocker()],
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Blocked);

				fsm.data().blockers = [];
				fsm.force_transition(IncidentState.Mitigated);

				expect(fsm.state()).toBe(IncidentState.Blocked);
			});
		});

		describe("Mitigated -> Canceled", () => {
			test("succeeds", () => {
				const fsm = newIncidentMachine(
					createIncident({
						acknowledgedAt: "2024-01-27 20:22:30",
						mitigatedAt: "2024-01-27 20:22:30",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Mitigated);
				fsm.action("cancel");
				expect(fsm.state()).toBe(IncidentState.Canceled);
			});
		});

		describe("Mitigated -> Acknowledged", () => {
			test("succeeds", () => {
				const fsm = newIncidentMachine(
					createIncident({
						point: "russell",
						comms: "mike",
						acknowledgedAt: "2024-01-22 17:20:00",
						mitigatedAt: "2024-01-22 17:20:00",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Mitigated);
				fsm.action("unmitigate");
				expect(fsm.state()).toBe(IncidentState.Acknowledged);
			});
		});

		describe("Mitigated -> Started", () => {
			test("succeeds", () => {
				const fsm = newIncidentMachine(
					createIncident({
						point: "russell",
						comms: "mike",
						acknowledgedAt: "2024-01-22 17:20:00",
						mitigatedAt: "2024-01-22 17:20:00",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Mitigated);
				fsm.action("restart");
				expect(fsm.state()).toBe(IncidentState.Started);
			});
		});

		describe("Resolved -> Canceled", () => {
			test("succeeds", () => {
				const fsm = newIncidentMachine(
					createIncident({
						acknowledgedAt: "2024-01-27 20:22:45",
						mitigatedAt: "2024-01-27 20:22:45",
						resolvedAt: "2024-01-27 20:22:45",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Resolved);
				fsm.action("cancel");
				expect(fsm.state()).toBe(IncidentState.Canceled);
			});
		});

		describe("Resolved -> Completed", () => {
			test("succeeds if review not required", () => {
				const fsm = newIncidentMachine(
					createIncident({
						priority: 4,
						acknowledgedAt: "2024-01-27 20:22:45",
						mitigatedAt: "2024-01-27 20:22:45",
						resolvedAt: "2024-01-27 20:22:45",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Resolved);
				fsm.action("complete");
				expect(fsm.state()).toBe(IncidentState.Completed);
			});

			test("fails if review required", () => {
				const fsm = newIncidentMachine(
					createIncident({
						priority: 1,
						acknowledgedAt: "2024-01-27 20:22:45",
						mitigatedAt: "2024-01-27 20:22:45",
						resolvedAt: "2024-01-27 20:22:45",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Resolved);
				fsm.action("complete");
				expect(fsm.state()).toBe(IncidentState.Resolved);
			});
		});

		describe("Resolved -> Acknowledged", () => {
			test("fails", () => {
				const fsm = newIncidentMachine(
					createIncident({
						point: "russell",
						comms: "mike",
						acknowledgedAt: "2024-01-27 20:12:10",
						mitigatedAt: "2024-01-27 20:22:45",
						resolvedAt: "2024-01-22 21:02:00",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Resolved);
				fsm.transition(IncidentState.Acknowledged);
				expect(fsm.state()).toBe(IncidentState.Resolved);
			});
		});

		describe("Resolved -> Mitigated", () => {
			test("succeeds", () => {
				const fsm = newIncidentMachine(
					createIncident({
						point: "russell",
						comms: "mike",
						acknowledgedAt: "2024-01-27 20:12:10",
						mitigatedAt: "2024-01-27 20:22:45",
						resolvedAt: "2024-01-22 21:02:00",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Resolved);
				fsm.action("unresolve");
				expect(fsm.state()).toBe(IncidentState.Mitigated);
			});
		});

		describe("Resolved -> Resolved", () => {
			test("does nothing", () => {
				const fsm = newIncidentMachine(
					createIncident({
						point: "russell",
						comms: "mike",
						acknowledgedAt: "2024-01-27 20:12:10",
						mitigatedAt: "2024-01-27 20:22:45",
						resolvedAt: "2024-01-22 21:02:00",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Resolved);
				fsm.action("resolve");
				expect(fsm.state()).toBe(IncidentState.Resolved);
			});
		});

		describe("Resolved -> Tutorial", () => {
			test("succeeds if review required", () => {
				const fsm = newIncidentMachine(
					createIncident({
						priority: 1,
						acknowledgedAt: "2024-01-27 20:22:45",
						mitigatedAt: "2024-01-27 20:22:45",
						resolvedAt: "2024-01-27 20:22:45",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Resolved);
				fsm.action("next");
				expect(fsm.state()).toBe(TutorialState.Assignee);
			});

			test("fails if review not required", () => {
				const fsm = newIncidentMachine(
					createIncident({
						priority: 4,
						acknowledgedAt: "2024-01-27 20:22:45",
						mitigatedAt: "2024-01-27 20:22:45",
						resolvedAt: "2024-01-27 20:22:45",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Resolved);
				fsm.action("next");
				expect(fsm.state()).toBe(IncidentState.Resolved);
			});
		});

		describe("Completed -> Canceled", () => {
			test("fails", () => {
				const fsm = newIncidentMachine(
					createIncident({ completedAt: "2024-01-27 20:23:45" }),
				);

				expect(fsm.state()).toBe(IncidentState.Completed);
				fsm.force_transition(IncidentState.Canceled);
				expect(fsm.state()).toBe(IncidentState.Completed);
			});
		});

		describe("Completed -> Archived", () => {
			test("succeeds", () => {
				const fsm = newIncidentMachine(
					createIncident({
						point: "russell",
						comms: "mike",
						completedAt: "2024-01-23 01:36:00",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Completed);
				fsm.action("archive");
				expect(fsm.state()).toBe(IncidentState.Archived);
			});

			test("reverse transition invalid", () => {
				const fsm = newIncidentMachine(
					createIncident({
						point: "russell",
						comms: "mike",
						archivedAt: "2024-01-23 01:38:00",
					}),
				);

				expect(fsm.state()).toBe(IncidentState.Archived);
				fsm.transition(IncidentState.Completed);
				expect(fsm.state()).toBe(IncidentState.Archived);
			});
		});
	});

	describe("newAnnoyotronMachine", () => {
		let nagState: NagState;

		beforeAll(() => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date(2024, 1, 11, 12, 0));
		});

		afterAll(() => {
			vi.useRealTimers();
		});

		beforeEach(() => {
			const longAgo = "2024-01-09 10:00:00";

			nagState = {
				mostRecentCommUpdate: null,
				lastNags: {
					noComms: longAgo,
					noPoint: longAgo,
					needCommUpdate: longAgo,
				},
			};
		});

		describe("Happy Path (Started => ...no nags... => Done)", () => {
			test("succeeds with recent comm update", () => {
				const i1 = createIncident({ point: "juan", comms: "linda" });
				const nagConfig = priorityNags(i1.priority);

				if (!nagConfig) {
					throw new Error("");
				}

				nagState.mostRecentCommUpdate = "2024-02-11 11:43:00";

				const fsm = newAnnoyotronMachine(i1, nagConfig, nagState);

				expect(fsm.state()).toBe(Annoyotron.Start);

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.PointNag);

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.CommsNag);

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.InitialCommNag);

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.CommUpdateNag);

				fsm.action(DONE);
				expect(fsm.state()).toBe(Annoyotron.Done);
			});

			test("succeeds with recent comm update nag", () => {
				const i1 = createIncident({ point: "juan", comms: "linda" });
				const nagConfig = priorityNags(i1.priority);

				if (!nagConfig) {
					throw new Error("");
				}

				nagState.mostRecentCommUpdate = "2024-02-08 16:31:00";
				nagState.lastNags.needCommUpdate = "2024-02-11 11:43:00";

				const fsm = newAnnoyotronMachine(i1, nagConfig, nagState);

				expect(fsm.state()).toBe(Annoyotron.Start);

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.PointNag);

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.CommsNag);

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.InitialCommNag);

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.CommUpdateNag);

				fsm.action(DONE);
				expect(fsm.state()).toBe(Annoyotron.Done);
			});
		});

		describe("No point, no comms", () => {
			test("Nags both -> Done", () => {
				const i1 = createIncident();
				const nagConfig = priorityNags(i1.priority);

				if (!nagConfig) {
					throw new Error("");
				}

				const fsm = newAnnoyotronMachine(i1, nagConfig, nagState);

				expect(fsm.state()).toBe(Annoyotron.Start);

				// prevents move forward with no point not nagged
				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.Start);

				fsm.data().lastNags.noPoint = "2024-02-11 12:00:00";

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.PointNag);

				// prevents move forward with no comms not nagged
				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.PointNag);

				fsm.data().lastNags.noComms = "2024-02-11 12:00:00";

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.CommsNag);

				// prevents move forward with no comms but nagged
				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.CommsNag);

				fsm.action(DONE);
				expect(fsm.state()).toBe(Annoyotron.Done);
			});

			test("Nags point, comms recently nagged -> Done", () => {
				const i1 = createIncident();
				const nagConfig = priorityNags(i1.priority);

				if (!nagConfig) {
					throw new Error("");
				}

				const fsm = newAnnoyotronMachine(i1, nagConfig, {
					...nagState,
					lastNags: { ...nagState.lastNags, noComms: "2024-02-11 11:54:00" },
				});

				expect(fsm.state()).toBe(Annoyotron.Start);

				// prevents move forward with no point not nagged
				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.Start);

				fsm.data().lastNags.noPoint = "2024-02-11 12:00:00";

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.PointNag);

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.CommsNag);

				// prevents move forward with no comms
				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.CommsNag);

				fsm.action(DONE);
				expect(fsm.state()).toBe(Annoyotron.Done);
			});

			test("Nags comms, point recently nagged -> Done", () => {
				const i1 = createIncident();
				const nagConfig = priorityNags(i1.priority);

				if (!nagConfig) {
					throw new Error("");
				}

				const fsm = newAnnoyotronMachine(i1, nagConfig, {
					...nagState,
					lastNags: { ...nagState.lastNags, noPoint: "2024-02-11 11:54:00" },
				});

				expect(fsm.state()).toBe(Annoyotron.Start);

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.PointNag);

				// prevents move forward with no comms not nagged
				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.PointNag);

				fsm.data().lastNags.noComms = "2024-02-11 12:00:00";

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.CommsNag);

				// prevents move forward with no comms but nagged
				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.CommsNag);

				fsm.action(DONE);
				expect(fsm.state()).toBe(Annoyotron.Done);
			});
		});

		describe("Point, no comms", () => {
			test("Nags comms -> Done", () => {
				const incident = createIncident({ point: "bob" });
				const nagConfig = priorityNags(incident.priority);

				if (!nagConfig) {
					throw new Error("");
				}

				const fsm = newAnnoyotronMachine(incident, nagConfig, nagState);

				expect(fsm.state()).toBe(Annoyotron.Start);

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.PointNag);

				// prevents move forward with no comms not nagged
				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.PointNag);

				fsm.data().lastNags.noComms = "2024-02-11 12:00:00";

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.CommsNag);

				// prevents move forward with no comms but nagged
				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.CommsNag);

				fsm.action(DONE);
				expect(fsm.state()).toBe(Annoyotron.Done);
			});
		});

		describe("Comms, no point", () => {
			test("Nags point -> Initial Comm -> Done", () => {
				const incident = createIncident({ comms: "sally" });
				const nagConfig = priorityNags(incident.priority);

				if (!nagConfig) {
					throw new Error("");
				}

				const fsm = newAnnoyotronMachine(incident, nagConfig, nagState);

				expect(fsm.state()).toBe(Annoyotron.Start);

				// prevents move forward with no point not nagged
				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.Start);

				fsm.data().lastNags.noPoint = "2024-02-11 12:00:00";

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.PointNag);

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.CommsNag);

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.InitialCommNag);

				// prevents move forward with no initial comm update
				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.InitialCommNag);

				fsm.data().lastNags.needCommUpdate = "2024-02-11 12:00:00";

				fsm.action(DONE);
				expect(fsm.state()).toBe(Annoyotron.Done);
			});
		});

		describe("Comm Updates", () => {
			test("Nags Initial Comm -> Done", () => {
				const incident = createIncident({ comms: "sally" });
				const nagConfig = priorityNags(incident.priority);

				if (!nagConfig) {
					throw new Error("");
				}

				const fsm = newAnnoyotronMachine(incident, nagConfig, nagState);

				expect(fsm.state()).toBe(Annoyotron.Start);

				fsm.data().lastNags.noPoint = "2024-02-11 12:00:00";

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.PointNag);

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.CommsNag);

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.InitialCommNag);

				// prevents move forward with no initial comm update
				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.InitialCommNag);

				fsm.data().lastNags.needCommUpdate = "2024-02-11 12:00:00";

				fsm.action(DONE);
				expect(fsm.state()).toBe(Annoyotron.Done);
			});

			test("Nags Comm Update -> Done", () => {
				const incident = createIncident({ comms: "sally" });
				const nagConfig = priorityNags(incident.priority);

				if (!nagConfig) {
					throw new Error("");
				}

				const fsm = newAnnoyotronMachine(incident, nagConfig, {
					...nagState,
					mostRecentCommUpdate: "2024-02-09 08:00:00",
				});

				expect(fsm.state()).toBe(Annoyotron.Start);

				fsm.data().lastNags.noPoint = "2024-02-11 12:00:00";

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.PointNag);

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.CommsNag);

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.InitialCommNag);

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.CommUpdateNag);

				// prevents move forward without a recent comm update
				fsm.action(DONE);
				expect(fsm.state()).toBe(Annoyotron.CommUpdateNag);

				fsm.data().mostRecentCommUpdate = "2024-02-11 12:00:00";

				fsm.action(DONE);
				expect(fsm.state()).toBe(Annoyotron.Done);
			});
		});

		describe("Blocked incident", () => {
			test("Happy Path (Started => ...truncated route, no nags... => Done)", () => {
				const incident = createIncident({
					point: "bob",
					comms: "sally",
					blockers: [createBlocker()],
				});
				const nagConfig = priorityNags(incident.priority);

				if (!nagConfig) {
					throw new Error("");
				}

				const fsm = newAnnoyotronMachine(incident, nagConfig, nagState);

				expect(fsm.state()).toBe(Annoyotron.Start);

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.PointNag);

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.CommsNag);

				// prevents move forward when blocked
				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.CommsNag);

				fsm.action(DONE);
				expect(fsm.state()).toBe(Annoyotron.Done);
			});

			test("Nags, even if blocked -> Done", () => {
				const incident = createIncident({ blockers: createBlocker() });
				const nagConfig = priorityNags(incident.priority);

				if (!nagConfig) {
					throw new Error("");
				}

				const fsm = newAnnoyotronMachine(incident, nagConfig, nagState);

				expect(fsm.state()).toBe(Annoyotron.Start);

				// prevents move forward with no point not nagged
				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.Start);

				fsm.data().lastNags.noPoint = "2024-02-11 12:00:00";

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.PointNag);

				// prevents move forward with no comms not nagged
				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.PointNag);

				fsm.data().lastNags.noComms = "2024-02-11 12:00:00";

				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.CommsNag);

				// prevents move forward with no comms and blocker
				fsm.action(NAG);
				expect(fsm.state()).toBe(Annoyotron.CommsNag);

				fsm.action(DONE);
				expect(fsm.state()).toBe(Annoyotron.Done);
			});
		});
	});
});
