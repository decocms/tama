// Cron tick: scan upcoming doses and fire push notifications.
//
// Lifecycle per tick (runs every 2 minutes):
//   1. Compute fire window: anchors due in [now, now+15min]. A dose first
//      enters this window 15min before its anchor; the next cron tick (within
//      2 min) catches it and fires once. The idempotency table guarantees a
//      single send per dose even though the window keeps re-including the
//      same row across ticks until the anchor passes.
//   2. Pull active schedule_state rows in that window.
//   3. For each row, atomically claim (scheduleStateId, anchorAt) via
//      INSERT OR IGNORE INTO notifications_sent. Skip if already claimed.
//   4. Fan out a single notification per claimed row to every subscription
//      (single-tenant for now — Beto). 410/404 endpoints get pruned by sendPush.
//
// The dose's actual anchorAt isn't moved — we just notify earlier. Logging the
// dose still advances the anchor by the user's real action time, exactly as
// the existing dose_log path does today.

import { eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import {
	notificationsSent,
	type ScheduleStateRow,
	scheduleState,
} from "../db/schema.ts";
import type { Env } from "../env.ts";
import { getSelfPet } from "../storage/pet-self.ts";
import {
	listPushSubscriptions,
	type PushSubscription,
} from "../storage/push-subscriptions.ts";
import { clockSlotsInWindow, parseTimesJson } from "../storage/timetable.ts";
import { type PushPayload, sendPush } from "./webpush.ts";

// Look-ahead window: any dose anchor in the next 15 minutes is a candidate.
// Idempotency (INSERT OR IGNORE on notifications_sent) ensures the same dose
// fires exactly one push even though it stays in the window for 15 minutes.
const LOOKAHEAD_MS = 15 * 60_000;

export interface TickResult {
	scanned: number;
	claimed: number;
	sent: number;
	pruned: number;
	errors: number;
}

export async function runReminderTick(env: Env): Promise<TickResult> {
	const result: TickResult = {
		scanned: 0,
		claimed: 0,
		sent: 0,
		pruned: 0,
		errors: 0,
	};

	const now = Date.now();

	// One candidate = one (item, planned-time) due in [now, now+15min]. Two
	// projection modes, matching the timetable: fixed clock times (times_json)
	// fire at each daily slot; even-interval items fire at their anchor.
	const pet = await getSelfPet(env);
	const petName = pet?.name ?? "Pet";
	const tz = pet?.timezone ?? "UTC";

	const activeRows = await db(env)
		.select()
		.from(scheduleState)
		.where(eq(scheduleState.active, true));

	const candidates: { row: ScheduleStateRow; plannedAt: string }[] = [];
	for (const row of activeRows) {
		// Don't remind for slots outside the course's [startsAt, endsAt) bounds.
		const startMs = row.startsAt ? new Date(row.startsAt).getTime() : -Infinity;
		const endMs = row.endsAt ? new Date(row.endsAt).getTime() : Infinity;
		const inBounds = (ms: number) => ms >= startMs && ms < endMs;
		const times = parseTimesJson(row.timesJson);
		if (times.length > 0) {
			// Match the timetable's every-N-days stride so reminders don't fire on
			// the off-days of e.g. an every-48h schedule.
			const strideDays =
				row.intervalHours > 24 ? Math.round(row.intervalHours / 24) : 1;
			const anchorMs = new Date(row.startsAt ?? row.anchorAt).getTime();
			for (const ms of clockSlotsInWindow(
				times,
				tz,
				now,
				now + LOOKAHEAD_MS,
				strideDays,
				anchorMs,
			)) {
				if (inBounds(ms)) {
					candidates.push({ row, plannedAt: new Date(ms).toISOString() });
				}
			}
		} else {
			const a = new Date(row.anchorAt).getTime();
			if (a >= now && a <= now + LOOKAHEAD_MS && inBounds(a)) {
				candidates.push({ row, plannedAt: row.anchorAt });
			}
		}
	}

	result.scanned = candidates.length;
	if (candidates.length === 0) return result;

	const subs = await listPushSubscriptions(env);
	if (subs.length === 0) return result;

	// Atomic claim per (scheduleStateId, plannedAt): INSERT OR IGNORE returns no
	// row if another tick already claimed this exact slot, so each fires once.
	const claimed: { row: ScheduleStateRow; plannedAt: string }[] = [];
	for (const c of candidates) {
		try {
			const inserted = await db(env)
				.insert(notificationsSent)
				.values({ scheduleStateId: c.row.id, plannedAt: c.plannedAt })
				.onConflictDoNothing()
				.returning();
			if (inserted.length > 0) {
				result.claimed++;
				claimed.push(c);
			}
		} catch (err) {
			result.errors++;
			console.error("notifications_sent claim failed", err);
		}
	}

	for (const c of claimed) {
		const payload = buildPayload(petName, c.row, c.plannedAt);
		await Promise.allSettled(
			subs.map(async (sub: PushSubscription) => {
				const r = await sendPush(env, sub, payload);
				if (r.ok) result.sent++;
				else if (r.removed) result.pruned++;
				else {
					result.errors++;
					console.warn(
						`push to ${sub.endpoint.slice(0, 60)}… → ${r.status} ${r.error ?? ""}`,
					);
				}
			}),
		);
	}

	return result;
}

function buildPayload(
	petName: string,
	row: ScheduleStateRow,
	plannedAtIso: string,
): PushPayload {
	const minsAhead = Math.max(
		1,
		Math.round((new Date(plannedAtIso).getTime() - Date.now()) / 60_000),
	);

	const dosagePart = row.dosage ? ` — ${row.dosage}` : "";
	const routePart = row.route ? ` ${row.route}` : "";

	return {
		title: `${petName}: ${row.displayName} in ~${minsAhead} min`,
		body: `${row.kind === "meal" ? "Meal" : "Dose"}${dosagePart}${routePart}. Tap to log.`,
		url: `/#/timetable`,
		tag: `dose-${row.id}-${plannedAtIso}`,
		scheduleStateId: row.id,
		plannedAt: plannedAtIso,
	};
}
