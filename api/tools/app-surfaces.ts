import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../env.ts";
import { URI } from "./uris.ts";

// The top-level apps. Each is a no-op tool whose only job is to surface a
// pinnable entry in studio's UI catalog, pointing at a route in the single
// bundle. The agent rarely calls these — the human opens them directly. Studio
// shows one tab per app, which is why the in-app header is hidden when embedded
// (see web/main/components/Layout.tsx) — studio's tab bar is the navigation.
//
// `annotations.title` is the human label studio shows on the pinned tab (the
// tool id like "app_exams" is the fallback, which reads as "App Exams").

export const appPetTool = (_env: Env) =>
	createTool({
		id: "app_pet",
		description:
			"Open the Pet app — profile, the pet sheet, the evolving health summary, and the pixel companion. The home base.",
		inputSchema: z.object({}),
		outputSchema: z.object({}),
		_meta: { ui: { resourceUri: URI.pet } },
		annotations: { title: "Pet", readOnlyHint: true },
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
		annotations: { title: "Timeline", readOnlyHint: true },
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
		annotations: { title: "Timetable", readOnlyHint: true },
		execute: async () => ({}),
	});

export const appExamsTool = (_env: Env) =>
	createTool({
		id: "app_exams",
		description:
			"Open the Exams app — lab results grouped by body system, evolution charts with the healthy-range band, and 'Explain with AI'.",
		inputSchema: z.object({}),
		outputSchema: z.object({}),
		_meta: { ui: { resourceUri: URI.exams } },
		annotations: { title: "Exams", readOnlyHint: true },
		execute: async () => ({}),
	});

export const appResearchTool = (_env: Env) =>
	createTool({
		id: "app_research",
		description:
			"Open the Research app — past vet-research briefings grounded in the pet's case, and a box to ask new ones.",
		inputSchema: z.object({}),
		outputSchema: z.object({}),
		_meta: { ui: { resourceUri: URI.research } },
		annotations: { title: "Research", readOnlyHint: true },
		execute: async () => ({}),
	});

export const appRecordingsTool = (_env: Env) =>
	createTool({
		id: "app_recordings",
		description:
			"Open the Recordings app — audio recordings of vet visits, their transcripts and AI summaries.",
		inputSchema: z.object({}),
		outputSchema: z.object({}),
		_meta: { ui: { resourceUri: URI.recordings } },
		annotations: { title: "Recordings", readOnlyHint: true },
		execute: async () => ({}),
	});

export const appAssetsTool = (_env: Env) =>
	createTool({
		id: "app_assets",
		description:
			"Open the Assets app — the library of raw uploaded files (lab PDFs, photos, documents). Drop anything and the agent files it into the timeline.",
		inputSchema: z.object({}),
		outputSchema: z.object({}),
		_meta: { ui: { resourceUri: URI.assets } },
		annotations: { title: "Assets", readOnlyHint: true },
		execute: async () => ({}),
	});

export const appBreathingTool = (_env: Env) =>
	createTool({
		id: "app_breathing",
		description:
			"Open the Respiratory Rate app — measure the pet's resting breaths-per-minute with the camera (point at the chest, hold steady).",
		inputSchema: z.object({}),
		outputSchema: z.object({}),
		_meta: { ui: { resourceUri: URI.breathing } },
		annotations: { title: "Respiratory rate", readOnlyHint: true },
		execute: async () => ({}),
	});
