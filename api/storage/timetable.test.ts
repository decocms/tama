import { describe, expect, it } from "bun:test";
import type { Dose, Prescription } from "../db/schema.ts";
import { deriveTimetable } from "./timetable.ts";

function makeRx(
	items: unknown[],
	overrides: Partial<Prescription> = {},
): Prescription {
	return {
		id: "rx_1",
		episodeId: "ep_1",
		fileId: null,
		status: "confirmed",
		scheduleItemsJson: JSON.stringify(items),
		rawAiText: null,
		sourceNotes: null,
		createdAt: "2026-05-16T00:00:00.000Z",
		...overrides,
	};
}

const dayStart = new Date("2026-05-16T00:00:00.000Z");
const dayEnd = new Date("2026-05-16T23:59:00.000Z");

describe("deriveTimetable", () => {
	it("expands scheduled times into entries", () => {
		const rx = makeRx([
			{ name: "PRELONE", kind: "medication", times: ["18:00"] },
			{ name: "PAPA", kind: "meal", times: ["08:00", "14:00", "20:00"] },
		]);

		const entries = deriveTimetable({
			prescriptions: [rx],
			doses: [],
			from: dayStart,
			to: dayEnd,
		});

		expect(entries).toHaveLength(4);
		expect(entries.map((e) => e.itemName)).toEqual([
			"PAPA",
			"PAPA",
			"PRELONE",
			"PAPA",
		]);
		expect(entries[2].kind).toBe("medication");
		expect(entries[0].kind).toBe("meal");
	});

	it("ignores draft prescriptions", () => {
		const rx = makeRx([{ name: "X", kind: "medication", times: ["10:00"] }], {
			status: "draft",
		});
		const entries = deriveTimetable({
			prescriptions: [rx],
			doses: [],
			from: dayStart,
			to: dayEnd,
		});
		expect(entries).toHaveLength(0);
	});

	it("marks entries as given when a dose matches plannedAt", () => {
		const rx = makeRx([
			{ name: "LUFTA", kind: "medication", times: ["17:00"] },
		]);
		const dose: Dose = {
			id: "d1",
			episodeId: "ep_1",
			itemName: "LUFTA",
			kind: "medication",
			plannedAt: "2026-05-16T17:00:00.000Z",
			actualAt: "2026-05-16T17:00:00.000Z",
			status: "given",
			note: null,
			adjustmentJson: null,
			createdAt: "2026-05-16T17:00:00.000Z",
		};

		const entries = deriveTimetable({
			prescriptions: [rx],
			doses: [dose],
			from: dayStart,
			to: dayEnd,
		});

		expect(entries[0].status).toBe("given");
		expect(entries[0].doseId).toBe("d1");
	});

	it("matches doses within ±90 minutes even without exact plannedAt", () => {
		const rx = makeRx([
			{ name: "SUCRA", kind: "medication", times: ["06:44"] },
		]);
		const dose: Dose = {
			id: "d2",
			episodeId: "ep_1",
			itemName: "SUCRA",
			kind: "medication",
			plannedAt: null,
			actualAt: "2026-05-16T07:30:00.000Z", // 46 min after scheduled
			status: "given",
			note: null,
			adjustmentJson: null,
			createdAt: "2026-05-16T07:30:00.000Z",
		};
		const entries = deriveTimetable({
			prescriptions: [rx],
			doses: [dose],
			from: dayStart,
			to: dayEnd,
		});
		expect(entries[0].status).toBe("given");
	});

	it("applies shift-next-by-h adjustment to the next pending entry of same item", () => {
		const rx = makeRx([
			{ name: "LUFTA", kind: "medication", times: ["17:00", "23:00"] },
		]);
		const earlyDose: Dose = {
			id: "d3",
			episodeId: "ep_1",
			itemName: "LUFTA",
			kind: "medication",
			plannedAt: "2026-05-16T17:00:00.000Z",
			actualAt: "2026-05-16T16:00:00.000Z", // 1h early
			status: "given",
			note: "fed early",
			adjustmentJson: JSON.stringify({ kind: "shift-next-by-h", hours: -1 }),
			createdAt: "2026-05-16T16:00:00.000Z",
		};

		const entries = deriveTimetable({
			prescriptions: [rx],
			doses: [earlyDose],
			from: dayStart,
			to: dayEnd,
		});

		const second = entries.find(
			(e) => e.itemName === "LUFTA" && e.status === "pending",
		);
		expect(second).toBeDefined();
		// Originally 23:00, shifted -1h → 22:00
		expect(second?.scheduledAt).toContain("T22:00:00");
	});

	it("does not double-count adjustments — only the latest dose applies", () => {
		const rx = makeRx([
			{ name: "X", kind: "medication", times: ["10:00", "14:00", "18:00"] },
		]);
		const doses: Dose[] = [
			{
				id: "d1",
				episodeId: "ep_1",
				itemName: "X",
				kind: "medication",
				plannedAt: "2026-05-16T10:00:00.000Z",
				actualAt: "2026-05-16T09:00:00.000Z",
				status: "given",
				note: null,
				adjustmentJson: JSON.stringify({ kind: "shift-next-by-h", hours: -1 }),
				createdAt: "2026-05-16T09:00:00.000Z",
			},
			{
				id: "d2",
				episodeId: "ep_1",
				itemName: "X",
				kind: "medication",
				plannedAt: "2026-05-16T14:00:00.000Z",
				actualAt: "2026-05-16T15:00:00.000Z",
				status: "given",
				note: null,
				adjustmentJson: JSON.stringify({ kind: "shift-next-by-h", hours: 1 }),
				createdAt: "2026-05-16T15:00:00.000Z",
			},
		];

		const entries = deriveTimetable({
			prescriptions: [rx],
			doses,
			from: dayStart,
			to: dayEnd,
		});
		// First two doses given; third pending. Latest adjustment was +1h → 18:00 becomes 19:00.
		const pending = entries.find((e) => e.status === "pending");
		expect(pending?.scheduledAt).toContain("T19:00:00");
	});
});
