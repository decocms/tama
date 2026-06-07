// Pure state derivation for the companion (pixel-pet) view. Driven by the
// live timetable entries + a short status string from the pet sheet (its
// one-liner + active concerns) — no episode container, no separate summary.
//
// Priority (highest wins): pill-time > hungry > happy > sleeping > idle.

import type { PetProfile, TimetableEntry } from "@/types/api.ts";

// The pet sheet, distilled to a short string the mood derivation scans for
// illness signals: the one-liner + whatever's actively a concern / on watch.
export function statusTextFromProfile(
	profile: PetProfile | null | undefined,
): string | null {
	if (!profile) return null;
	const parts = [
		profile.oneLiner,
		...(profile.activeConcerns ?? []),
		...(profile.watchFor ?? []),
	].filter(Boolean);
	return parts.length ? parts.join(". ") : null;
}

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
	/** Short status text scanned for illness signals — the pet sheet's
	 * one-liner joined with its active concerns / watch-for items. */
	statusText: string | null;
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
	const { entries, petName, statusText, now } = input;
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

	// CONCERNED (pill-time face) — the pet sheet flags illness, or doses piling up.
	const sick =
		/vomit|leth|diarr|seizur|emerg|not eating|crash|vômito|letárg|diarr|convuls|emerg|não com/i.test(
			statusText ?? "",
		);
	if (sick) {
		return {
			state: "pill-time",
			headline: `${name} isn't feeling great`,
			subline: "Check the pet sheet on the Pet page",
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
