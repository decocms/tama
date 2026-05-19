// Cron tick: scan upcoming doses and fire push notifications 10-20 min ahead.
//
// Lifecycle per tick (runs every 10 minutes):
//   1. Compute fire window: anchors due in [now+10m, now+20m+30s].
//      The 30s slack absorbs cron jitter without leaving a gap. Overlap is
//      safe — the idempotency table guarantees one notification per dose.
//   2. Pull active schedule_state rows in that window.
//   3. For each row, atomically claim (scheduleStateId, anchorAt) via
//      INSERT OR IGNORE INTO notifications_sent. Skip if already claimed.
//   4. Fan out a single notification per claimed row to every subscription
//      (single-tenant for now — Beto). 410/404 endpoints get pruned by sendPush.
//
// The dose's actual anchorAt isn't moved — we just notify earlier. Logging the
// dose still advances the anchor by the user's real action time, exactly as
// the existing dose_log path does today.

import { and, between, eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import {
	notificationsSent,
	type ScheduleStateRow,
	scheduleState,
} from "../db/schema.ts";
import type { Env } from "../env.ts";
import { getEpisode } from "../storage/episodes.ts";
import { getPet } from "../storage/pets.ts";
import {
	listPushSubscriptions,
	type PushSubscription,
} from "../storage/push-subscriptions.ts";
import { type PushPayload, sendPush } from "./webpush.ts";

const LEAD_MS = 10 * 60_000;
const SLICE_MS = 10 * 60_000;
const SLACK_MS = 30_000;

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
	const windowStartIso = new Date(now + LEAD_MS).toISOString();
	const windowEndIso = new Date(
		now + LEAD_MS + SLICE_MS + SLACK_MS,
	).toISOString();

	// ISO strings sort lexicographically when they're zero-padded UTC, which
	// is what we always insert (strftime('%Y-%m-%dT%H:%M:%fZ', 'now') and
	// Date.toISOString()). So BETWEEN on the text column is correct here.
	const due = await db(env)
		.select()
		.from(scheduleState)
		.where(
			and(
				eq(scheduleState.active, true),
				between(scheduleState.anchorAt, windowStartIso, windowEndIso),
			),
		);

	result.scanned = due.length;
	if (due.length === 0) return result;

	const subs = await listPushSubscriptions(env);
	if (subs.length === 0) return result;

	const claimedRows: ScheduleStateRow[] = [];
	for (const row of due) {
		// Atomic claim: INSERT OR IGNORE returns rowCount 0 if the row was
		// already there (another tick beat us to it). Drizzle's D1 driver
		// surfaces .meta.rows_written; cleaner is to .returning() and inspect
		// length — INSERT OR IGNORE on a duplicate returns no row.
		try {
			const inserted = await db(env)
				.insert(notificationsSent)
				.values({
					scheduleStateId: row.id,
					plannedAt: row.anchorAt,
				})
				.onConflictDoNothing()
				.returning();
			if (inserted.length > 0) {
				result.claimed++;
				claimedRows.push(row);
			}
		} catch (err) {
			result.errors++;
			console.error("notifications_sent claim failed", err);
		}
	}

	for (const row of claimedRows) {
		const payload = await buildPayload(env, row);
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

async function buildPayload(
	env: Env,
	row: ScheduleStateRow,
): Promise<PushPayload> {
	// Pet name is nice context for the title; episode id is needed for the
	// deep-link target. Both reads are cheap (single-row by PK).
	const ep = await getEpisode(env, row.episodeId);
	const pet = ep ? await getPet(env, ep.petId) : null;
	const petName = pet?.name ?? "Pet";

	const minsAhead = Math.max(
		1,
		Math.round((new Date(row.anchorAt).getTime() - Date.now()) / 60_000),
	);

	const dosagePart = row.dosage ? ` — ${row.dosage}` : "";
	const routePart = row.route ? ` ${row.route}` : "";

	return {
		title: `${petName}: ${row.displayName} in ~${minsAhead} min`,
		body: `${row.kind === "meal" ? "Meal" : "Dose"}${dosagePart}${routePart}. Tap to log.`,
		url: `/#/episode/${row.episodeId}`,
		tag: `dose-${row.id}-${row.anchorAt}`,
		scheduleStateId: row.id,
		plannedAt: row.anchorAt,
	};
}
