// Fan-out helpers for ad-hoc push events (not the cron-driven reminders).
//
// Right now: notify every subscribed device when someone in the household logs
// a dose (given or skipped) so a second caretaker doesn't accidentally
// re-administer. Single-tenant — broadcast to all subs.

import type { Env } from "../env.ts";
import { getSelfPet } from "../storage/pet-self.ts";
import { listPushSubscriptions } from "../storage/push-subscriptions.ts";
import { getScheduleState, itemKey } from "../storage/schedule-state.ts";
import { type PushPayload, sendPush } from "./webpush.ts";

export interface DoseLoggedBroadcast {
	itemName: string;
	status: "given" | "skipped";
	actualAt: string;
	note?: string | null;
}

function formatTimeInZone(iso: string, timeZone: string | null): string {
	try {
		return new Intl.DateTimeFormat("en-GB", {
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
			timeZone: timeZone ?? undefined,
		}).format(new Date(iso));
	} catch {
		return new Date(iso).toISOString().slice(11, 16);
	}
}

export async function broadcastDoseLogged(
	env: Env,
	args: DoseLoggedBroadcast,
): Promise<{ sent: number; pruned: number; errors: number }> {
	const subs = await listPushSubscriptions(env);
	if (subs.length === 0) return { sent: 0, pruned: 0, errors: 0 };

	// Pull pet for the name + timezone, and schedule_state for dosage context.
	const [pet, ss] = await Promise.all([
		getSelfPet(env),
		getScheduleState(env, itemKey(args.itemName)),
	]);
	const petName = pet?.name ?? "Pet";
	const tz = pet?.timezone ?? null;

	const verb = args.status === "given" ? "given" : "skipped";
	const time = formatTimeInZone(args.actualAt, tz);
	const dosage = ss?.dosage ?? null;

	const dosageLine =
		args.status === "given" && dosage ? `${dosage} • ${time}` : time;
	const noteLine = args.note ? ` — ${args.note}` : "";

	const payload: PushPayload = {
		title: `${petName}: ${args.itemName} ${verb}`,
		body: `${dosageLine}${noteLine}`,
		url: `/#/timetable`,
		// Unique per dose event so multiple back-to-back logs don't collapse into
		// a single OS notification.
		tag: `dose-logged-${args.actualAt}`,
	};

	let sent = 0;
	let pruned = 0;
	let errors = 0;
	const results = await Promise.allSettled(
		// Lower urgency than reminders — informational, not actionable. Some push
		// services hold "normal" urgency until the device is awake; that's fine.
		subs.map((sub) => sendPush(env, sub, payload, { urgency: "normal" })),
	);
	for (const r of results) {
		if (r.status === "rejected") {
			errors++;
			continue;
		}
		if (r.value.ok) sent++;
		else if (r.value.removed) pruned++;
		else errors++;
	}
	return { sent, pruned, errors };
}
