import type { Dose, Prescription } from "../db/schema.ts";
import type { ScheduleItem, TimetableEntry } from "../tools/shared.ts";
import { parseAdjustment } from "./doses.ts";
import { parseScheduleItems } from "./prescriptions.ts";

const HOUR_MS = 60 * 60 * 1000;

export interface DeriveInput {
	prescriptions: Prescription[];
	doses: Dose[];
	from: Date;
	to: Date;
	episodeStartedAt?: Date;
}

export function deriveTimetable(input: DeriveInput): TimetableEntry[] {
	const { prescriptions, doses, from, to, episodeStartedAt } = input;
	const windowStart =
		episodeStartedAt && episodeStartedAt > from ? episodeStartedAt : from;

	const entries: TimetableEntry[] = [];

	for (const rx of prescriptions) {
		if (rx.status !== "confirmed") continue;
		const items = parseScheduleItems(rx);
		for (const item of items) {
			expandItem(rx.id, item, windowStart, to, entries);
		}
	}

	const sorted = entries.sort((a, b) =>
		a.scheduledAt < b.scheduledAt ? -1 : a.scheduledAt > b.scheduledAt ? 1 : 0,
	);

	const givenByItem = groupGivenByItem(doses);
	for (const entry of sorted) {
		const matched = matchDose(
			entry,
			givenByItem.get(entry.itemName.toLowerCase()) ?? [],
		);
		if (matched) {
			entry.status = matched.status === "skipped" ? "skipped" : "given";
			entry.doseId = matched.id;
		}
	}

	applyAdjustments(sorted, doses);

	return sorted;
}

function expandItem(
	prescriptionId: string,
	item: ScheduleItem,
	from: Date,
	to: Date,
	out: TimetableEntry[],
): void {
	let day = new Date(from);
	day.setHours(0, 0, 0, 0);

	while (day <= to) {
		for (const hhmm of item.times) {
			const [hh, mm] = hhmm.split(":").map(Number);
			const dt = new Date(day);
			dt.setHours(hh, mm, 0, 0);
			if (dt < from || dt > to) continue;

			out.push({
				id: `${prescriptionId}:${item.name}:${dt.toISOString()}`,
				prescriptionId,
				itemName: item.name,
				kind: item.kind,
				scheduledAt: dt.toISOString(),
				dosage: item.dosage,
				route: item.route,
				notes: item.notes,
				status: "pending",
			});
		}
		day = new Date(day.getTime() + 24 * HOUR_MS);
	}
}

function groupGivenByItem(doses: Dose[]): Map<string, Dose[]> {
	const map = new Map<string, Dose[]>();
	for (const d of doses) {
		if (d.status === "undone") continue;
		const key = d.itemName.toLowerCase();
		const arr = map.get(key) ?? [];
		arr.push(d);
		map.set(key, arr);
	}
	return map;
}

const NEAR_MS = 90 * 60 * 1000; // ±90 minutes counts as the same dose

function matchDose(entry: TimetableEntry, doses: Dose[]): Dose | null {
	const target = new Date(entry.scheduledAt).getTime();
	let best: Dose | null = null;
	let bestDelta = Infinity;
	for (const d of doses) {
		if (d.plannedAt && d.plannedAt === entry.scheduledAt) return d;
		const ref = new Date(d.plannedAt ?? d.actualAt).getTime();
		const delta = Math.abs(ref - target);
		if (delta <= NEAR_MS && delta < bestDelta) {
			best = d;
			bestDelta = delta;
		}
	}
	return best;
}

function applyAdjustments(entries: TimetableEntry[], doses: Dose[]): void {
	// For each item, find the latest given dose with an adjustment and shift
	// the NEXT not-yet-given entry by adjustment.hours.
	const byItem = new Map<string, Dose[]>();
	for (const d of doses) {
		if (d.status !== "given") continue;
		if (!parseAdjustment(d)) continue;
		const key = d.itemName.toLowerCase();
		const arr = byItem.get(key) ?? [];
		arr.push(d);
		byItem.set(key, arr);
	}

	for (const [item, list] of byItem) {
		list.sort((a, b) => (a.actualAt < b.actualAt ? 1 : -1));
		const latest = list[0];
		const adj = parseAdjustment(latest);
		if (!adj) continue;
		const latestTime = new Date(latest.actualAt).getTime();
		const nextPending = entries.find(
			(e) =>
				e.status === "pending" &&
				e.itemName.toLowerCase() === item &&
				new Date(e.scheduledAt).getTime() > latestTime,
		);
		if (!nextPending) continue;
		const shifted = new Date(
			new Date(nextPending.scheduledAt).getTime() + adj.hours * HOUR_MS,
		);
		nextPending.scheduledAt = shifted.toISOString();
		nextPending.notes =
			(nextPending.notes ? `${nextPending.notes}; ` : "") +
			`adjusted ${adj.hours >= 0 ? "+" : ""}${adj.hours}h`;
	}

	entries.sort((a, b) =>
		a.scheduledAt < b.scheduledAt ? -1 : a.scheduledAt > b.scheduledAt ? 1 : 0,
	);
}
