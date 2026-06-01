import { createPublicResource } from "@decocms/runtime/tools";
import type { Env } from "../env.ts";
import { URI } from "../tools/uris.ts";

const RESOURCE_MIME = "text/html;profile=mcp-app";

export const MAIN_URI = URI.main;

async function readHtml(env: Env): Promise<string> {
	const req = new Request("https://assets.local/index.html");
	const res = await env.ASSETS.fetch(req);
	if (!res.ok) throw new Error(`Assets fetch failed: ${res.status}`);
	return res.text();
}

function htmlResource(uri: string, name: string, description: string) {
	return (env: Env) =>
		createPublicResource({
			uri,
			name,
			description,
			mimeType: RESOURCE_MIME,
			read: async () => ({
				uri,
				mimeType: RESOURCE_MIME,
				text: await readHtml(env),
			}),
		});
}

export const uiResources = [
	htmlResource(
		URI.main,
		"Tama",
		"Main admin dashboard: pet profile, episodes, timetable.",
	),
	htmlResource(
		URI.petCreate,
		"Pet created",
		"Inline view shown after pet_create.",
	),
	htmlResource(
		URI.petEnrich,
		"Pet research",
		"Inline view shown after pet_enrich (AI research).",
	),
	htmlResource(URI.petGet, "Pet profile", "Inline pet profile view (pet_get)."),
	htmlResource(URI.petList, "Pets", "Inline list of pets (pet_list)."),
	htmlResource(
		URI.episodeStart,
		"Episode started",
		"Inline view shown after episode_start.",
	),
	htmlResource(
		URI.episodeGet,
		"Episode dashboard",
		"Inline episode dashboard (episode_get).",
	),
	htmlResource(
		URI.episodeList,
		"Episodes",
		"Inline list of episodes (episode_list).",
	),
	htmlResource(
		URI.prescriptionReview,
		"Prescription review",
		"Review and confirm AI-extracted prescription.",
	),
	htmlResource(
		URI.prescriptionList,
		"Prescriptions",
		"Inline list of prescriptions.",
	),
	htmlResource(
		URI.timetableGet,
		"Timetable",
		"Inline live timetable (timetable_get).",
	),
	htmlResource(
		URI.recordingGet,
		"Recording",
		"Inline view of a recording: transcript, summary, proposed updates.",
	),
	htmlResource(
		URI.episodeInsights,
		"AI insights",
		"Up to 3 short AI insight bullets for an episode.",
	),
];
