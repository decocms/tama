// Pure state derivation for the companion (pixel-pet) view. Driven by the
// live timetable entries + the pet's rolling summary — no episode container.
//
// Priority (highest wins): pill-time > hungry > happy > sleeping > idle.

import type { TimetableEntry } from "@/types/api.ts";

export type CompanionState =
	| "idle"
	| "sleeping"
	| "happy"
	| "hungry"
	| "pill-time";

export interface CompanionStatus {
	state: CompanionState;
	headline: string;
	subline: string | null;
}

const MINUTE = 60_000;

interface DeriveInput {
	entries: TimetableEntry[];
	petName: string;
	summary: string | null;
	now: Date;
	timeZone: string;
}

function hourInZone(d: Date, tz: string): number {
	try {
		const parts = new Intl.DateTimeFormat("en-US", {
			timeZone: tz,
			hour: "2-digit",
			hour12: false,
		}).formatToParts(d);
		const h = parts.find((p) => p.type === "hour")?.value ?? "00";
		const n = Number(h);
		return n === 24 ? 0 : n;
	} catch {
		return d.getHours();
	}
}

function isNighttime(d: Date, tz: string): boolean {
	const h = hourInZone(d, tz);
	return h >= 22 || h < 7;
}

export function deriveCompanionStatus(input: DeriveInput): CompanionStatus {
	const { entries, petName, summary, now } = input;
	const name = petName || "Tama";

	const pending = entries.filter((e) => e.status === "pending");
	const classify = (e: TimetableEntry) => {
		const diff = new Date(e.scheduledAt).getTime() - now.getTime();
		return { e, diff, overdue: diff < 0, soon: diff >= 0 && diff <= 60 * MINUTE };
	};
	const meds = pending
		.filter((e) => e.kind === "medication")
		.map(classify);
	const meals = pending.filter((e) => e.kind === "meal").map(classify);
	const overdueCount = pending.filter(
		(e) => new Date(e.scheduledAt).getTime() < now.getTime(),
	).length;

	// CONCERNED (pill-time face) — summary flags illness, or doses piling up.
	const sick = /vomit|lethargic|diarrh|seizur|emergency|not eating|crash/i.test(
		summary ?? "",
	);
	if (sick) {
		return {
			state: "pill-time",
			headline: `${name} isn't feeling great`,
			subline: "Check the summary on the Pet page",
		};
	}
	if (overdueCount >= 2) {
		return {
			state: "pill-time",
			headline: `${name} is waiting on you`,
			subline: `${overdueCount} doses overdue`,
		};
	}

	// PILL-TIME — a med overdue or due within 30 min.
	const pill = [
		...meds.filter((m) => m.overdue),
		...meds.filter((m) => m.soon && m.diff <= 30 * MINUTE),
	][0];
	if (pill) {
		return {
			state: "pill-time",
			headline: pill.overdue
				? `${pill.e.itemName} is overdue`
				: `${pill.e.itemName} soon`,
			subline: pill.overdue ? "Tap to open the timetable" : null,
		};
	}

	// HUNGRY — a meal overdue or due within the hour.
	const meal = [...meals.filter((m) => m.overdue), ...meals.filter((m) => m.soon)][0];
	if (meal) {
		return {
			state: "hungry",
			headline: meal.overdue
				? `${meal.e.itemName} is late`
				: `${meal.e.itemName} soon`,
			subline: null,
		};
	}

	// HAPPY — something was given recently and nothing's overdue.
	const givenRecently = entries.some(
		(e) =>
			e.status === "given" &&
			now.getTime() - new Date(e.scheduledAt).getTime() <= 12 * 60 * MINUTE,
	);
	if (givenRecently && overdueCount === 0) {
		return {
			state: "happy",
			headline: `${name} is doing great`,
			subline: "All caught up",
		};
	}

	if (isNighttime(now, input.timeZone)) {
		return { state: "sleeping", headline: `${name} is asleep`, subline: null };
	}

	return { state: "idle", headline: `${name} is hanging out`, subline: null };
}
