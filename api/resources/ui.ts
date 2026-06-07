import { createPublicResource } from "@decocms/runtime/tools";
import type { Env } from "../env.ts";
import { URI } from "../tools/uris.ts";

const RESOURCE_MIME = "text/html;profile=mcp-app";

export const MAIN_URI = URI.pet;

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
	// Top-level apps (pinnable in studio).
	htmlResource(
		URI.pet,
		"Pet",
		"Pet profile, evolving health summary, companion, and Assets library.",
	),
	htmlResource(
		URI.timeline,
		"Timeline",
		"The pet's continuous life log — visits, vaccines, symptoms, doses, exams, notes.",
	),
	htmlResource(
		URI.timetable,
		"Timetable",
		"Live medication & meal schedule with dose logging.",
	),
	htmlResource(
		URI.exams,
		"Exams",
		"Lab results by body system, evolution charts, and AI explanations.",
	),
	htmlResource(
		URI.research,
		"Research",
		"Vet-research briefings grounded in the pet's case; ask new ones.",
	),
	htmlResource(
		URI.recordings,
		"Recordings",
		"Vet-visit audio recordings with transcripts and AI summaries.",
	),
	htmlResource(
		URI.assets,
		"Assets",
		"Library of raw uploaded files; drop anything and it's filed into the timeline.",
	),
	htmlResource(
		URI.breathing,
		"Respiratory rate",
		"Measure resting breaths-per-minute with the camera.",
	),
	// Inline tool surfaces.
	htmlResource(
		URI.petEnrich,
		"Pet research",
		"Inline view shown after pet_enrich (AI research).",
	),
	htmlResource(URI.petGet, "Pet profile", "Inline pet profile view."),
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
		URI.recordingGet,
		"Recording",
		"Inline view of a recording: transcript, summary, proposed updates.",
	),
];
