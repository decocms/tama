import { describe, expect, it } from "bun:test";
import type { Dose } from "../db/schema.ts";
import { pickNearestDose } from "./doses.ts";

function dose(overrides: Partial<Dose>): Dose {
	return {
		id: "d_x",
		petId: "pet_self",
		itemName: "SUCRAFILM",
		kind: "medication",
		plannedAt: null,
		actualAt: "2026-05-17T16:45:00.000Z",
		status: "given",
		note: null,
		adjustmentJson: null,
		createdAt: "2026-05-17T16:45:00.000Z",
		...overrides,
	};
}

describe("pickNearestDose", () => {
	it("returns null when nothing matches", () => {
		expect(pickNearestDose([])).toBeNull();
	});

	it("skips undone doses by default", () => {
		const doses = [dose({ id: "a", status: "undone" })];
		expect(pickNearestDose(doses)).toBeNull();
	});

	it("returns most recent given when no reference is provided", () => {
		const doses = [
			dose({ id: "old", actualAt: "2026-05-17T08:00:00.000Z" }),
			dose({ id: "new", actualAt: "2026-05-17T18:00:00.000Z" }),
		];
		expect(pickNearestDose(doses)?.id).toBe("new");
	});

	it("matches the nearest dose within the default ±2h window", () => {
		// Wrong dose at 16:45, user says 'undo the 16:30 one' (reference 16:30).
		// The 16:45 row is 15min from reference — should match. The 08:00 row is
		// 8.5h away — out of window.
		const doses = [
			dose({
				id: "wrong",
				plannedAt: "2026-05-17T16:30:00.000Z",
				actualAt: "2026-05-17T16:45:00.000Z",
			}),
			dose({
				id: "earlier",
				actualAt: "2026-05-17T08:00:00.000Z",
			}),
		];
		const hit = pickNearestDose(doses, {
			referenceIso: "2026-05-17T16:30:00.000Z",
		});
		expect(hit?.id).toBe("wrong");
	});

	it("returns null when nothing falls inside the window", () => {
		const doses = [dose({ id: "old", actualAt: "2026-05-17T08:00:00.000Z" })];
		const hit = pickNearestDose(doses, {
			referenceIso: "2026-05-17T16:30:00.000Z",
		});
		expect(hit).toBeNull();
	});

	it("prefers plannedAt over actualAt when matching", () => {
		// A dose given far from its planned slot. Reference is on the planned
		// slot — should still match (planned=close, actual=far).
		const doses = [
			dose({
				id: "delayed",
				plannedAt: "2026-05-17T16:00:00.000Z",
				actualAt: "2026-05-17T17:45:00.000Z",
			}),
		];
		const hit = pickNearestDose(doses, {
			referenceIso: "2026-05-17T16:00:00.000Z",
		});
		expect(hit?.id).toBe("delayed");
	});

	it("respects onlyStatus filter", () => {
		const doses = [
			dose({ id: "skipped", status: "skipped" }),
			dose({
				id: "given",
				status: "given",
				actualAt: "2026-05-17T16:00:00.000Z",
			}),
		];
		const hit = pickNearestDose(doses, { onlyStatus: "skipped" });
		expect(hit?.id).toBe("skipped");
	});
});
