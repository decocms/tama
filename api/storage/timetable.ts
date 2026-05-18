import type { Dose } from "../db/schema.ts";
import type { TimetableEntry } from "../tools/shared.ts";
import type { ScheduleState } from "./schedule-state.ts";

const HOUR_MS = 60 * 60 * 1000;

export interface DeriveInput {
	scheduleStates: ScheduleState[];
	doses: Dose[];
	from: Date;
	to: Date;
	episodeStartedAt?: Date;
	// Kept for API compat — used only by wallClockToIso fallback paths upstream.
	timeZone?: string;
}

function zonedDate(
	year: number,
	month: number, // 1-12
	day: number,
	hour: number,
	minute: number,
	timeZone: string,
): Date {
	const naive = Date.UTC(year, month - 1, day, hour, minute);
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).formatToParts(new Date(naive));
	const get = (t: string) =>
		Number(parts.find((p) => p.type === t)?.value ?? 0);
	const shownHour = get("hour") === 24 ? 0 : get("hour");
	const shown = Date.UTC(
		get("year"),
		get("month") - 1,
		get("day"),
		shownHour,
		get("minute"),
		get("second"),
	);
	const offsetMs = shown - naive;
	return new Date(naive - offsetMs);
}

function zonedDateParts(date: Date, timeZone: string) {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).formatToParts(date);
	const get = (t: string) =>
		Number(parts.find((p) => p.type === t)?.value ?? 0);
	return { year: get("year"), month: get("month"), day: get("day") };
}

// Midnight (00:00) of the calendar day that contains `date` in `timeZone`,
// expressed as a UTC Date. Used so the timetable window includes the full
// "today" instead of a sliding "now - 6h" cut.
export function startOfDayInZone(date: Date, timeZone: string): Date {
	const p = zonedDateParts(date, timeZone);
	return zonedDate(p.year, p.month, p.day, 0, 0, timeZone);
}

// Resolve a wall-clock string in `timeZone` to a UTC ISO timestamp.
// Accepted shapes:
//   "HH:mm"                 → today's date in `timeZone`
//   "YYYY-MM-DD HH:mm"      → exact date in `timeZone`
//   "YYYY-MM-DDTHH:mm"      → same, ISO-ish separator
//   "YYYY-MM-DDTHH:mm:ss"   → with seconds (ignored beyond minute precision)
// Throws on anything else.
export function wallClockToIso(wallClock: string, timeZone: string): string {
	const trimmed = wallClock.trim();
	const hhmm = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
	const today = zonedDateParts(new Date(), timeZone);
	if (hhmm) {
		const hh = Number(hhmm[1]);
		const mm = Number(hhmm[2]);
		return zonedDate(
			today.year,
			today.month,
			today.day,
			hh,
			mm,
			timeZone,
		).toISOString();
	}
	const full = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::\d{2})?$/.exec(
		trimmed,
	);
	if (full) {
		return zonedDate(
			Number(full[1]),
			Number(full[2]),
			Number(full[3]),
			Number(full[4]),
			Number(full[5]),
			timeZone,
		).toISOString();
	}
	throw new Error(
		`Invalid wall-clock time "${wallClock}". Use "HH:mm" or "YYYY-MM-DD HH:mm".`,
	);
}

/**
 * Derive the timetable from live schedule_state rows + the doses history.
 *
 * Each item's next-due time is `anchor_at`, advanced naturally:
 *   • given dose → anchor moves to given_at + interval (cascade)
 *   • snooze     → anchor += snooze amount
 *   • skip       → anchor += interval (jump over the missed slot)
 *
 * Future entries: walk `anchor_at + N × interval_hours` until the window ends.
 * Past entries: pulled directly from the `doses` table (each given/skipped
 * row is its own entry at its actual time). No fuzzy matching, no two-pass
 * adjustment math — past is past, future is future.
 */
export function deriveTimetable(input: DeriveInput): TimetableEntry[] {
	const { scheduleStates, doses, from, to } = input;
	const fromMs = from.getTime();
	const toMs = to.getTime();

	const entries: TimetableEntry[] = [];

	// Future / current entries: walk each item's anchor forward.
	for (const item of scheduleStates) {
		if (!item.active) continue;
		const intervalMs = item.intervalHours * HOUR_MS;
		if (intervalMs <= 0) continue;

		let cursor = new Date(item.anchorAt).getTime();
		// If the anchor is before the window, fast-forward to the first slot
		// that lands inside the window — we surface ONE entry at the
		// current-or-next slot, not a flood of stale ones.
		while (cursor < fromMs) cursor += intervalMs;

		while (cursor <= toMs) {
			entries.push({
				id: `${item.id}:${new Date(cursor).toISOString()}`,
				prescriptionId: item.prescriptionId ?? "",
				itemName: item.displayName,
				kind: item.kind,
				scheduledAt: new Date(cursor).toISOString(),
				dosage: item.dosage ?? undefined,
				route: item.route ?? undefined,
				notes: item.notes ?? undefined,
				status: "pending",
			});
			cursor += intervalMs;
		}
	}

	// Historical entries: every given/skipped dose in the window gets its
	// own row, displayed at its real actualAt. The anchor has already moved
	// past these — they're a separate, immutable record of what happened.
	for (const d of doses) {
		if (d.status === "undone") continue;
		const t = new Date(d.actualAt).getTime();
		if (t < fromMs || t > toMs) continue;
		entries.push({
			id: `dose:${d.id}`,
			prescriptionId: "",
			itemName: d.itemName,
			kind: d.kind,
			scheduledAt: d.actualAt,
			status: d.status === "skipped" ? "skipped" : "given",
			doseId: d.id,
		});
	}

	entries.sort((a, b) =>
		a.scheduledAt < b.scheduledAt ? -1 : a.scheduledAt > b.scheduledAt ? 1 : 0,
	);
	return entries;
}
