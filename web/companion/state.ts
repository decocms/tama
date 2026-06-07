// Pure state derivation for the companion (pixel-pet) view.
//
// Two inputs decide the mood:
//  1. the LIVE schedule (meal due soon, medicine overdue) — actionable nudges
//     that always win, because the whole point of the companion is to prompt you.
//  2. a MANUAL state the owner set ("he's asleep", "doing great") — the baseline
//     when nothing urgent is happening. It's the owner's call, not a guess from
//     the medical record (a chronically-ill pet is not "sad" 24/7).
//
// Priority (highest wins):
//   pill-time (med overdue/soon, or ≥2 doses overdue)
//   > hungry (meal overdue/soon)
//   > the owner's manual state (while fresh)
//   > happy (just dosed) > sleeping (night) > idle

import type { TimetableEntry } from "@/types/api.ts";

export type CompanionState =
	| "idle"
	| "sleeping"
	| "happy"
	| "hungry"
	| "pill-time"
	| "sad";

export interface CompanionStatus {
	state: CompanionState;
	headline: string;
	subline: string | null;
}

const MINUTE = 60_000;

// A manually-set state stays in effect for this long, then the companion falls
// back to the ambient default — so a "sleeping" set last night doesn't still
// show tomorrow afternoon. Urgent schedule events override it regardless.
export const MANUAL_STATE_TTL_MS = 12 * 60 * 60 * 1000;

// The moods the owner can set by hand on the companion view. (pill-time is
// derived from the schedule, never set manually.)
export const SETTABLE_STATES: {
	state: CompanionState;
	emoji: string;
	label: string;
}[] = [
	{ state: "happy", emoji: "😄", label: "Great" },
	{ state: "idle", emoji: "😌", label: "Calm" },
	{ state: "sleeping", emoji: "😴", label: "Asleep" },
	{ state: "hungry", emoji: "🍗", label: "Hungry" },
	{ state: "sad", emoji: "🤒", label: "Unwell" },
];

interface DeriveInput {
	entries: TimetableEntry[];
	petName: string;
	/** The owner-set state (pet.companionState), or null. */
	manualState?: CompanionState | null;
	/** When it was set, in ms (Date.parse of pet.companionStateAt), or null. */
	manualStateAtMs?: number | null;
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

function manualStatus(state: CompanionState, name: string): CompanionStatus {
	switch (state) {
		case "sleeping":
			return { state, headline: `${name} is asleep`, subline: null };
		case "happy":
			return { state, headline: `${name} is doing great`, subline: null };
		case "hungry":
			return { state, headline: `${name} is hungry`, subline: null };
		case "sad":
			return {
				state,
				headline: `${name} isn't feeling great`,
				subline: "Check the pet sheet on the Pet page",
			};
		case "pill-time":
			return { state, headline: `${name} needs attention`, subline: null };
		default:
			return { state: "idle", headline: `${name} is hanging out`, subline: null };
	}
}

export function deriveCompanionStatus(input: DeriveInput): CompanionStatus {
	const { entries, petName, manualState, manualStateAtMs, now } = input;
	const name = petName || "Tama";

	const pending = entries.filter((e) => e.status === "pending");
	const classify = (e: TimetableEntry) => {
		const diff = new Date(e.scheduledAt).getTime() - now.getTime();
		return { e, diff, overdue: diff < 0, soon: diff >= 0 && diff <= 60 * MINUTE };
	};
	const meds = pending.filter((e) => e.kind === "medication").map(classify);
	const meals = pending.filter((e) => e.kind === "meal").map(classify);
	const overdueCount = pending.filter(
		(e) => new Date(e.scheduledAt).getTime() < now.getTime(),
	).length;

	// PILL-TIME — a med overdue or due within 30 min, or doses piling up.
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
	if (overdueCount >= 2) {
		return {
			state: "pill-time",
			headline: `${name} is waiting on you`,
			subline: `${overdueCount} doses overdue`,
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

	// MANUAL — the owner's declared state, while still fresh.
	if (
		manualState &&
		manualStateAtMs != null &&
		now.getTime() - manualStateAtMs < MANUAL_STATE_TTL_MS
	) {
		return manualStatus(manualState, name);
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
