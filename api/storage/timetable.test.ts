import { describe, expect, it } from "bun:test";
import type { Dose } from "../db/schema.ts";
import type { ScheduleState } from "./schedule-state.ts";
import { deriveTimetable, wallClockToIso } from "./timetable.ts";

function makeState(overrides: Partial<ScheduleState>): ScheduleState {
	return {
		id: "ss_1",
		petId: "pet_self",
		itemKey: "prelone",
		displayName: "PRELONE",
		kind: "medication",
		dosage: null,
		route: null,
		notes: null,
		intervalHours: 24,
		timesJson: null,
		anchorAt: "2026-05-16T18:00:00.000Z",
		durationDays: null,
		prescriptionId: "rx_1",
		active: true,
		startsAt: null,
		endsAt: null,
		createdAt: "2026-05-16T00:00:00.000Z",
		updatedAt: "2026-05-16T00:00:00.000Z",
		...overrides,
	};
}

function makeDose(overrides: Partial<Dose>): Dose {
	return {
		id: "d_1",
		petId: "pet_self",
		itemName: "PRELONE",
		kind: "medication",
		plannedAt: null,
		actualAt: "2026-05-16T18:00:00.000Z",
		status: "given",
		note: null,
		adjustmentJson: null,
		createdAt: "2026-05-16T18:00:00.000Z",
		...overrides,
	};
}

const dayStart = new Date("2026-05-16T00:00:00.000Z");
const dayEnd2 = new Date("2026-05-17T23:59:00.000Z");

describe("deriveTimetable (anchor model)", () => {
	it("walks anchor forward at interval to fill the window", () => {
		const state = makeState({
			intervalHours: 8,
			anchorAt: "2026-05-16T06:00:00.000Z",
		});
		const entries = deriveTimetable({
			scheduleStates: [state],
			doses: [],
			from: dayStart,
			to: dayEnd2,
		});
		// Pending entries every 8h: 06, 14, 22 today + 06, 14, 22 tomorrow.
		const times = entries.map((e) => e.scheduledAt);
		expect(times).toContain("2026-05-16T06:00:00.000Z");
		expect(times).toContain("2026-05-16T14:00:00.000Z");
		expect(times).toContain("2026-05-16T22:00:00.000Z");
		expect(times).toContain("2026-05-17T06:00:00.000Z");
		expect(entries.every((e) => e.status === "pending")).toBe(true);
	});

	it("shows given doses as their own entries at actualAt", () => {
		const state = makeState({
			intervalHours: 24,
			anchorAt: "2026-05-17T18:00:00.000Z", // anchor already advanced
		});
		const given = makeDose({
			id: "d_g",
			actualAt: "2026-05-16T18:13:00.000Z",
			status: "given",
		});
		const entries = deriveTimetable({
			scheduleStates: [state],
			doses: [given],
			from: dayStart,
			to: dayEnd2,
		});
		const givenEntry = entries.find((e) => e.doseId === "d_g");
		expect(givenEntry).toBeDefined();
		expect(givenEntry?.status).toBe("given");
		expect(givenEntry?.scheduledAt).toBe("2026-05-16T18:13:00.000Z");
		// Tomorrow's anchor is still pending.
		const tomorrow = entries.find(
			(e) => e.scheduledAt === "2026-05-17T18:00:00.000Z",
		);
		expect(tomorrow?.status).toBe("pending");
	});

	it("inactive items don't produce entries", () => {
		const state = makeState({ active: false });
		const entries = deriveTimetable({
			scheduleStates: [state],
			doses: [],
			from: dayStart,
			to: dayEnd2,
		});
		expect(entries).toHaveLength(0);
	});

	it("skips undone doses entirely", () => {
		const state = makeState({ anchorAt: "2026-05-17T18:00:00.000Z" });
		const undone = makeDose({
			id: "d_u",
			actualAt: "2026-05-16T18:00:00.000Z",
			status: "undone",
		});
		const entries = deriveTimetable({
			scheduleStates: [state],
			doses: [undone],
			from: dayStart,
			to: dayEnd2,
		});
		expect(entries.find((e) => e.doseId === "d_u")).toBeUndefined();
	});

	it("very-stale anchors collapse to a single overdue entry, not a flood", () => {
		// Anchor 5 days ago. Window is today (single-day for simplicity).
		const state = makeState({
			intervalHours: 24,
			anchorAt: "2026-05-11T18:00:00.000Z",
		});
		const entries = deriveTimetable({
			scheduleStates: [state],
			doses: [],
			from: dayStart,
			to: new Date("2026-05-16T23:59:00.000Z"),
		});
		expect(entries).toHaveLength(1);
		// Fast-forwarded to the most-recent missed slot before the window.
		expect(entries[0].scheduledAt).toBe("2026-05-16T18:00:00.000Z");
	});

	it("snooze + give yields exactly one slot, marked given at the given time", () => {
		// User snoozed +2h then gave the dose. The snooze had already shifted
		// the anchor; the give-dose pushed it another interval forward.
		const state = makeState({
			intervalHours: 24,
			anchorAt: "2026-05-17T18:00:00.000Z", // already advanced (next-day)
		});
		const given = makeDose({
			id: "d_late",
			actualAt: "2026-05-16T20:13:00.000Z",
			status: "given",
		});
		const entries = deriveTimetable({
			scheduleStates: [state],
			doses: [given],
			from: dayStart,
			to: new Date("2026-05-16T23:59:00.000Z"),
		});
		// Only one PRELONE on 5/16 — the given one at 20:13. No phantom.
		const todays = entries.filter((e) =>
			e.scheduledAt.startsWith("2026-05-16"),
		);
		expect(todays).toHaveLength(1);
		expect(todays[0].status).toBe("given");
		expect(todays[0].doseId).toBe("d_late");
	});

	it("fixed clock time + 48h interval → every other day, skipping off-days", () => {
		// Beto's Prelone Phase 2: 10:00 local, every 48h, from the 12th.
		const state = makeState({
			intervalHours: 48,
			timesJson: JSON.stringify(["10:00"]),
			startsAt: "2026-06-12T13:00:00.000Z", // 10:00 in America/Sao_Paulo
			anchorAt: "2026-06-12T13:00:00.000Z",
		});
		const entries = deriveTimetable({
			scheduleStates: [state],
			doses: [],
			from: new Date("2026-06-12T00:00:00.000Z"),
			to: new Date("2026-06-19T00:00:00.000Z"),
			timeZone: "America/Sao_Paulo",
		});
		const times = entries.map((e) => e.scheduledAt);
		// On-days present (10:00 BRT = 13:00 UTC):
		expect(times).toContain("2026-06-12T13:00:00.000Z");
		expect(times).toContain("2026-06-14T13:00:00.000Z");
		expect(times).toContain("2026-06-16T13:00:00.000Z");
		expect(times).toContain("2026-06-18T13:00:00.000Z");
		// Off-days absent:
		expect(times).not.toContain("2026-06-13T13:00:00.000Z");
		expect(times).not.toContain("2026-06-15T13:00:00.000Z");
		expect(times).not.toContain("2026-06-17T13:00:00.000Z");
		expect(entries).toHaveLength(4);
	});

	it("fixed clock times + daily interval → every day (multi-dose)", () => {
		// Meals 7/14/22, no multi-day interval → daily, unchanged behavior.
		const state = makeState({
			intervalHours: 8,
			timesJson: JSON.stringify(["07:00", "14:00", "22:00"]),
			startsAt: "2026-06-12T10:00:00.000Z",
			anchorAt: "2026-06-12T10:00:00.000Z",
		});
		const entries = deriveTimetable({
			scheduleStates: [state],
			doses: [],
			from: new Date("2026-06-12T00:00:00.000Z"),
			to: new Date("2026-06-13T23:59:00.000Z"),
			timeZone: "America/Sao_Paulo",
		});
		// 3 slots/day × 2 days = 6.
		expect(entries).toHaveLength(6);
	});

	it("wallClockToIso resolves HH:mm in a timezone to UTC", () => {
		const iso = wallClockToIso("12:00", "America/Sao_Paulo");
		expect(iso).toMatch(/T15:00:00\.000Z$/);
		const iso2 = wallClockToIso("2026-05-17 12:00", "America/Sao_Paulo");
		expect(iso2).toBe("2026-05-17T15:00:00.000Z");
		const iso3 = wallClockToIso("2026-05-17 12:00", "UTC");
		expect(iso3).toBe("2026-05-17T12:00:00.000Z");
		expect(() => wallClockToIso("garbage", "UTC")).toThrow();
	});
});
