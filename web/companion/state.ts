// Pure state derivation for the companion (tamagotchi) view. Given the
// episode dashboard data, decide which expression sprite the creature face
// should show and what the status copy reads.
//
// Priority (highest wins): sad > pill-time > hungry > happy > sleeping > idle.
// Rationale: the most ambient/lowest-stakes states yield to the more urgent
// ones, so if a dose is overdue (sad) we don't show idle even at night.

import type { EpisodeDashboardResult, TimetableEntry } from "@/types/api.ts";

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
	// For the URL the user goes to when they tap/double-click the face.
	openEpisodeId: string | null;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

interface DeriveInput {
	dashboard: EpisodeDashboardResult | null;
	petName: string;
	// Wall-clock "now" — argument so this stays pure & testable.
	now: Date;
	// Pet's timezone, used to decide "is it nighttime?".
	timeZone: string;
}

// Hour-of-day in a given IANA timezone. Falls back to local clock if Intl
// throws (very rare; misconfigured tz).
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

function classifyEntry(e: TimetableEntry, now: Date) {
	const t = new Date(e.scheduledAt).getTime();
	const diff = t - now.getTime();
	const overdue = e.status === "pending" && diff < 0;
	const dueSoon = e.status === "pending" && diff >= 0 && diff <= 60 * MINUTE;
	return { entry: e, diff, overdue, dueSoon };
}

export function deriveCompanionStatus(input: DeriveInput): CompanionStatus {
	const { dashboard, petName, now, timeZone } = input;
	const fallback: CompanionStatus = {
		state: "idle",
		headline: petName ? `${petName} is hanging out` : "Nothing scheduled",
		subline: null,
		openEpisodeId: dashboard?.episode?.id ?? null,
	};
	if (!dashboard?.episode) return fallback;

	const classified = dashboard.timetable.map((e) => classifyEntry(e, now));
	const overdue = classified.filter((c) => c.overdue);
	const dueSoon = classified.filter((c) => c.dueSoon);

	// Split overdues by meal vs medication so we can distinguish "hungry" from
	// "pill-time" facial expressions.
	const overdueMeds = overdue.filter((c) => c.entry.kind === "medication");
	const overdueMeals = overdue.filter((c) => c.entry.kind === "meal");
	const soonMeds = dueSoon.filter((c) => c.entry.kind === "medication");
	const soonMeals = dueSoon.filter((c) => c.entry.kind === "meal");

	// SAD: episode flagged as sick OR 2+ overdue doses piling up.
	const status = (dashboard.episode.currentStatus ?? "").toLowerCase();
	const sickWords = /vomit|lethargic|crash|emergency|seizur/;
	if (sickWords.test(status)) {
		return {
			state: "sad",
			headline: `${petName} isn't feeling great`,
			subline: dashboard.episode.currentStatus,
			openEpisodeId: dashboard.episode.id,
		};
	}
	if (overdue.length >= 2) {
		return {
			state: "sad",
			headline: `${petName} is waiting on you`,
			subline: `${overdue.length} doses overdue`,
			openEpisodeId: dashboard.episode.id,
		};
	}

	// PILL-TIME: a med overdue or due in the next 30 min.
	const soonOrOverdueMeds = [
		...overdueMeds,
		...soonMeds.filter((c) => c.diff <= 30 * MINUTE),
	];
	if (soonOrOverdueMeds.length > 0) {
		const first = soonOrOverdueMeds[0];
		const isOver = first.overdue;
		return {
			state: "pill-time",
			headline: isOver
				? `${first.entry.itemName} is overdue`
				: `${first.entry.itemName} in a few minutes`,
			subline: isOver
				? "Tap to log the dose"
				: "Get it ready — Tama's eyeing you",
			openEpisodeId: dashboard.episode.id,
		};
	}

	// HUNGRY: meal overdue or due within an hour.
	if (overdueMeals.length > 0 || soonMeals.length > 0) {
		const first = overdueMeals[0] ?? soonMeals[0];
		return {
			state: "hungry",
			headline: first.overdue
				? `${first.entry.itemName} is late`
				: `${first.entry.itemName} soon`,
			subline: first.overdue ? "Tap to log the meal" : null,
			openEpisodeId: dashboard.episode.id,
		};
	}

	// HAPPY: at least one dose given in the last 12h AND zero overdues today.
	// Don't fire happy on a totally idle day — it'd feel like the pet is
	// happy for no reason.
	const lastGiven = dashboard.doses
		.filter((d) => d.status === "given")
		.sort(
			(a, b) =>
				new Date(b.actualAt).getTime() - new Date(a.actualAt).getTime(),
		)[0];
	if (
		lastGiven &&
		now.getTime() - new Date(lastGiven.actualAt).getTime() <= 12 * HOUR
	) {
		return {
			state: "happy",
			headline: `${petName} is doing great`,
			subline: `Last dose: ${lastGiven.itemName}`,
			openEpisodeId: dashboard.episode.id,
		};
	}

	// SLEEPING: night hours.
	if (isNighttime(now, timeZone)) {
		return {
			state: "sleeping",
			headline: `${petName} is asleep`,
			subline: null,
			openEpisodeId: dashboard.episode.id,
		};
	}

	return {
		...fallback,
		openEpisodeId: dashboard.episode.id,
	};
}
