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

export function parseTimesJson(json: string | null | undefined): string[] {
	if (!json) return [];
	try {
		const v = JSON.parse(json);
		return Array.isArray(v)
			? v.filter((t) => typeof t === "string" && /^\d{1,2}:\d{2}$/.test(t))
			: [];
	} catch {
		return [];
	}
}

// Smallest gap (hours) between consecutive daily clock times, wrapping past
// midnight. Used to size the suppression window so a given/skipped dose hides
// exactly its slot without swallowing the neighbouring one.
function minGapHours(times: string[]): number {
	if (times.length <= 1) return 24;
	const mins = times
		.map((t) => {
			const [h, m] = t.split(":").map(Number);
			return h * 60 + m;
		})
		.sort((a, b) => a - b);
	let min = Infinity;
	for (let i = 0; i < mins.length; i++) {
		const next = i + 1 < mins.length ? mins[i + 1] : mins[0] + 24 * 60;
		min = Math.min(min, next - mins[i]);
	}
	return Math.max(min, 1) / 60;
}

// The integer calendar-day ordinal of a date in a timezone (days since the
// Unix epoch in that zone). Lets us count whole days between two zoned dates
// regardless of DST.
function dayOrdinalInZone(ms: number, timeZone: string): number {
	const { year, month, day } = zonedDateParts(new Date(ms), timeZone);
	return Math.floor(Date.UTC(year, month - 1, day) / (24 * HOUR_MS));
}

// Every clock-time slot (UTC ms) that falls inside [fromMs, toMs] for the given
// daily times in `timeZone`. Walks each calendar day the window touches.
//
// `strideDays` > 1 makes it every-N-days: only days whose ordinal is congruent
// to the anchor day (mod stride) emit slots — so "10:00 every 48h" anchored on
// the 12th yields the 12th, 14th, 16th… and skips the off-days. `anchorMs` is
// the schedule's start (its day fixes the parity).
export function clockSlotsInWindow(
	times: string[],
	timeZone: string,
	fromMs: number,
	toMs: number,
	strideDays = 1,
	anchorMs?: number,
): number[] {
	const stride = Math.max(1, Math.round(strideDays));
	const anchorOrd =
		stride > 1 && anchorMs != null ? dayOrdinalInZone(anchorMs, timeZone) : 0;
	const slots = new Set<number>();
	const days = Math.ceil((toMs - fromMs) / (24 * HOUR_MS)) + 2;
	for (let d = 0; d < days; d++) {
		const refMs = fromMs + d * 24 * HOUR_MS;
		if (stride > 1) {
			const ord = dayOrdinalInZone(refMs, timeZone);
			// Positive modulo so days before the anchor still align correctly.
			if ((((ord - anchorOrd) % stride) + stride) % stride !== 0) continue;
		}
		const { year, month, day } = zonedDateParts(new Date(refMs), timeZone);
		for (const t of times) {
			const [hh, mm] = t.split(":").map(Number);
			const ms = zonedDate(year, month, day, hh, mm, timeZone).getTime();
			if (ms >= fromMs && ms <= toMs) slots.add(ms);
		}
	}
	return [...slots].sort((a, b) => a - b);
}

/**
 * Derive the timetable from live schedule_state rows + the doses history.
 *
 * Two projection modes per item:
 *   • Fixed clock times (`times_json` set, e.g. 07:00/14:00/22:00): project
 *     those exact times each day across the window. A given/skipped dose near
 *     a slot suppresses it (the dose row stands in); a past slot with no dose
 *     is surfaced as overdue. Supports irregular spacing.
 *   • Even interval (no times): walk `anchor_at + N × interval_hours`. The
 *     anchor drifts naturally on give (→ given_at + interval), snooze, skip.
 *
 * Past entries always come from the `doses` table (each given/skipped row at
 * its actual time).
 */
export function deriveTimetable(input: DeriveInput): TimetableEntry[] {
	const { scheduleStates, doses, from, to } = input;
	const fromMs = from.getTime();
	const toMs = to.getTime();
	const tz = input.timeZone;

	const entries: TimetableEntry[] = [];

	// Per-item dose times (non-undone), for suppressing already-acted slots in
	// fixed-clock mode. Keyed by lowercased item name.
	const doseMsByName = new Map<string, number[]>();
	for (const d of doses) {
		if (d.status === "undone") continue;
		const k = d.itemName.trim().toLowerCase();
		const arr = doseMsByName.get(k) ?? [];
		arr.push(new Date(d.actualAt).getTime());
		doseMsByName.set(k, arr);
	}

	// Future / current entries.
	for (const item of scheduleStates) {
		if (!item.active) continue;

		// A time-bounded course only projects slots within [startsAt, endsAt).
		// (The item also flips inactive once endsAt passes, but until then the
		// projection must not spill doses past the course's end — e.g. an 8-day
		// antibiotic shouldn't show a 9th day, nor an every-48h course a dose
		// beyond its last on-day.)
		const startMs = item.startsAt ? new Date(item.startsAt).getTime() : -Infinity;
		const endMs = item.endsAt ? new Date(item.endsAt).getTime() : Infinity;

		const times = parseTimesJson(item.timesJson);
		if (times.length > 0 && tz) {
			// Fixed clock-time projection. When the interval spans multiple days
			// (e.g. frequencyHours 48 → every other day), only emit slots every
			// `strideDays`, anchored on the schedule's start day — so "10:00 every
			// 48h" hits the on-days and skips the off-days instead of going daily.
			const strideDays =
				item.intervalHours > 24 ? Math.round(item.intervalHours / 24) : 1;
			const anchorMs = new Date(item.startsAt ?? item.anchorAt).getTime();
			const halfWindowMs = Math.min(
				6,
				Math.max(0.5, minGapHours(times) / 2),
			) * HOUR_MS;
			const acted = doseMsByName.get(item.displayName.trim().toLowerCase()) ?? [];
			for (const slotMs of clockSlotsInWindow(
				times,
				tz,
				fromMs,
				toMs,
				strideDays,
				anchorMs,
			)) {
				if (slotMs < startMs || slotMs >= endMs) continue;
				const suppressed = acted.some(
					(d) => Math.abs(d - slotMs) <= halfWindowMs,
				);
				if (suppressed) continue;
				entries.push({
					id: `${item.id}:${new Date(slotMs).toISOString()}`,
					prescriptionId: item.prescriptionId ?? "",
					itemName: item.displayName,
					kind: item.kind,
					scheduledAt: new Date(slotMs).toISOString(),
					dosage: item.dosage ?? undefined,
					route: item.route ?? undefined,
					notes: item.notes ?? undefined,
					status: "pending",
				});
			}
			continue;
		}

		// Even-interval projection: walk the anchor forward.
		const intervalMs = item.intervalHours * HOUR_MS;
		if (intervalMs <= 0) continue;
		let cursor = new Date(item.anchorAt).getTime();
		while (cursor < fromMs) cursor += intervalMs;
		while (cursor <= toMs) {
			if (cursor < startMs || cursor >= endMs) {
				cursor += intervalMs;
				continue;
			}
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
