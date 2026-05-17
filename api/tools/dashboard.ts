import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../env.ts";
import { URI } from "./uris.ts";

// A tool whose only purpose is to surface the main dashboard UI to studio,
// so the user can select it as the agent's main view or pin it as a tab.
// The agent shouldn't normally call this — the user opens it directly.
export const dashboardTool = (_env: Env) =>
	createTool({
		id: "dashboard",
		description:
			"Open the myvet admin dashboard (browse pets, episodes, timetable). The user usually opens this directly — only call if they explicitly ask.",
		inputSchema: z.object({}),
		outputSchema: z.object({}),
		_meta: { ui: { resourceUri: URI.main } },
		annotations: { readOnlyHint: true },
		execute: async () => ({}),
	});
