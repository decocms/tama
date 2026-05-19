import { app } from "./app.ts";
import type { Bindings } from "./env.ts";
import { runReminderTick } from "./notifications/scheduler.ts";

export default {
	fetch: (req: Request, env: Bindings, ctx: ExecutionContext) =>
		app.fetch(req, env, ctx),
	// Cron Trigger — wrangler.toml has `crons = ["*/10 * * * *"]`. The handler
	// scans schedule_state for doses due in [now+10m, now+20m] and fires push
	// notifications. waitUntil keeps the worker alive past the handler return
	// while the push fan-out finishes.
	scheduled: (_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) => {
		ctx.waitUntil(
			runReminderTick(env as unknown as Parameters<typeof runReminderTick>[0])
				.then((r) => {
					console.log(
						`reminder tick: scanned=${r.scanned} claimed=${r.claimed} sent=${r.sent} pruned=${r.pruned} errors=${r.errors}`,
					);
				})
				.catch((err) => {
					console.error("reminder tick failed", err);
				}),
		);
	},
};
