import { describe, expect, it } from "bun:test";
import type { ScheduleItem } from "../tools/shared.ts";
import { freshCourseLifecycle } from "./schedule-state.ts";

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
