import { describe, expect, it } from "bun:test";
import type { Prescription } from "../db/schema.ts";
import type { ScheduleItem } from "../tools/shared.ts";
import {
	freshCourseLifecycle,
	resolveScheduleOwners,
} from "./schedule-state.ts";

function rx(
	overrides: Partial<Prescription> & { items: ScheduleItem[] },
): Prescription {
	const { items, ...rest } = overrides;
	return {
		id: "rx_x",
		petId: "pet_self",
		fileId: null,
		status: "confirmed",
		scheduleItemsJson: JSON.stringify(items),
		rawAiText: null,
		sourceNotes: null,
		createdAt: "2026-06-01T00:00:00.000Z",
		...rest,
	} as Prescription;
}

describe("freshCourseLifecycle", () => {
	it("derives endsAt = startsAt + durationDays and anchor = startsAt + interval", () => {
		const item: ScheduleItem = {
			name: "VONAU VET",
			kind: "medication",
			dosage: "0,2ml",
			times: ["06:30", "18:30"],
			frequencyHours: 12,
			durationDays: 28,
			startsAt: "2026-06-13T09:30:00.000Z",
		};
		const life = freshCourseLifecycle(item, 12, "America/Sao_Paulo");
		expect(life.startsAt).toBe("2026-06-13T09:30:00.000Z");
		// 28 days later — the key fix: a re-adopted item gets a FUTURE end, so the
		// auto-expire sweep can't immediately deactivate it.
		expect(life.endsAt).toBe("2026-07-11T09:30:00.000Z");
		expect(new Date(life.endsAt as string).getTime()).toBeGreaterThan(
			new Date(item.startsAt as string).getTime(),
		);
		// anchor = startsAt + 12h interval
		expect(life.anchorAt).toBe("2026-06-13T21:30:00.000Z");
	});

	it("leaves endsAt null when the course has no duration", () => {
		const item: ScheduleItem = {
			name: "PRELONE",
			kind: "medication",
			times: ["10:00"],
			startsAt: "2026-06-13T13:00:00.000Z",
		};
		const life = freshCourseLifecycle(item, 24, "America/Sao_Paulo");
		expect(life.endsAt).toBeNull();
		expect(life.startsAt).toBe("2026-06-13T13:00:00.000Z");
	});
});

describe("resolveScheduleOwners", () => {
	it("collapses a key in two confirmed prescriptions to the NEWEST owner", () => {
		// The bug: PRELONE in an old standalone rx (07:00) AND a newer consolidated
		// rx (17:00). Both confirmed → without dedup, two racing writes per read.
		const old = rx({
			id: "rx_old",
			createdAt: "2026-06-22T00:00:00.000Z",
			items: [{ name: "PRELONE 3mg/ml", kind: "medication", times: ["07:00"] }],
		});
		const consolidated = rx({
			id: "rx_new",
			createdAt: "2026-06-23T00:00:00.000Z",
			items: [{ name: "PRELONE 3mg/ml", kind: "medication", times: ["17:00"] }],
		});

		const { owners, duplicates } = resolveScheduleOwners([consolidated, old]);

		// Input order must not matter — newest createdAt always wins.
		expect(owners.size).toBe(1);
		expect(owners.get("prelone 3mg/ml")?.rx.id).toBe("rx_new");
		expect(owners.get("prelone 3mg/ml")?.item.times).toEqual(["17:00"]);
		expect([...(duplicates.get("prelone 3mg/ml") ?? [])].sort()).toEqual([
			"rx_new",
			"rx_old",
		]);
	});

	it("ignores draft prescriptions and reports no duplicates for a clean set", () => {
		const draft = rx({
			id: "rx_draft",
			status: "draft",
			items: [{ name: "SUCRAFILM", kind: "medication", times: ["09:00"] }],
		});
		const confirmed = rx({
			id: "rx_ok",
			items: [{ name: "SUCRAFILM", kind: "medication", times: ["09:30"] }],
		});

		const { owners, duplicates } = resolveScheduleOwners([draft, confirmed]);

		expect(owners.get("sucrafilm")?.rx.id).toBe("rx_ok");
		expect(duplicates.size).toBe(0);
	});

	it("dedups a key repeated within a single prescription's items", () => {
		const dup = rx({
			id: "rx_dup",
			items: [
				{
					name: "DOXICICLINA (suspensão)",
					kind: "medication",
					times: ["11:30"],
				},
				{
					name: "doxiciclina (suspensão)",
					kind: "medication",
					times: ["22:30"],
				},
			],
		});

		const { owners } = resolveScheduleOwners([dup]);

		// One row per key; the later item in the array wins.
		expect(owners.size).toBe(1);
		expect(owners.get("doxiciclina (suspensão)")?.item.times).toEqual([
			"22:30",
		]);
	});
});
