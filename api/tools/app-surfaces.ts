import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../env.ts";
import { URI } from "./uris.ts";

// The three top-level apps. Each is a no-op tool whose only job is to surface
// a pinnable entry in studio's UI catalog, pointing at a route in the single
// bundle. The agent rarely calls these — the human opens them directly.

export const appPetTool = (_env: Env) =>
	createTool({
		id: "app_pet",
		description:
			"Open the Pet app — profile, evolving health summary, the pixel companion, and the Assets library (everything you've uploaded). The home base.",
		inputSchema: z.object({}),
		outputSchema: z.object({}),
		_meta: { ui: { resourceUri: URI.pet } },
		annotations: { readOnlyHint: true },
		execute: async () => ({}),
	});

export const appTimelineTool = (_env: Env) =>
	createTool({
		id: "app_timeline",
		description:
			"Open the Timeline app — the continuous log of the pet's whole life: vet visits, vaccines, symptoms, doses, exams, recordings, notes.",
		inputSchema: z.object({}),
		outputSchema: z.object({}),
		_meta: { ui: { resourceUri: URI.timeline } },
		annotations: { readOnlyHint: true },
		execute: async () => ({}),
	});

export const appTimetableTool = (_env: Env) =>
	createTool({
		id: "app_timetable",
		description:
			"Open the Timetable app — the live medication & meal schedule, dose logging, and treatment lifecycle.",
		inputSchema: z.object({}),
		outputSchema: z.object({}),
		_meta: { ui: { resourceUri: URI.timetable } },
		annotations: { readOnlyHint: true },
		execute: async () => ({}),
	});
