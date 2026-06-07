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

// Every app resource returns the SAME single-page bundle, so the host (studio)
// can't tell one pinned tile from another by its HTML alone — and it doesn't
// forward the resource URI into the app's host context. So we bake the target
// route into each resource's HTML as `window.__TAMA_ROUTE__`; web/app.tsx reads
// it on boot and points the hash router there. This is what makes each pinned
// tile open its own app instead of all defaulting to Pet.
function injectRoute(html: string, route: string): string {
	const tag = `<script>window.__TAMA_ROUTE__=${JSON.stringify(route)}</script>`;
	return html.includes("</head>")
		? html.replace("</head>", `${tag}</head>`)
		: `${tag}${html}`;
}

function htmlResource(
	uri: string,
	name: string,
	description: string,
	route?: string,
) {
	return (env: Env) =>
		createPublicResource({
			uri,
			name,
			description,
			mimeType: RESOURCE_MIME,
			read: async () => {
				const html = await readHtml(env);
				return {
					uri,
					mimeType: RESOURCE_MIME,
					text: route ? injectRoute(html, route) : html,
				};
			},
		});
}

export const uiResources = [
	// Top-level apps (pinnable in studio) — each pins to its own route.
	htmlResource(
		URI.pet,
		"Pet",
		"Pet profile, evolving health summary, companion, and Assets library.",
		"/",
	),
	htmlResource(
		URI.timeline,
		"Timeline",
		"The pet's continuous life log — visits, vaccines, symptoms, doses, exams, notes.",
		"/timeline",
	),
	htmlResource(
		URI.timetable,
		"Timetable",
		"Live medication & meal schedule with dose logging.",
		"/timetable",
	),
	htmlResource(
		URI.exams,
		"Exams",
		"Lab results by body system, evolution charts, and AI explanations.",
		"/exams",
	),
	htmlResource(
		URI.research,
		"Research",
		"Vet-research briefings grounded in the pet's case; ask new ones.",
		"/research",
	),
	htmlResource(
		URI.recordings,
		"Recordings",
		"Vet-visit audio recordings with transcripts and AI summaries.",
		"/recordings",
	),
	htmlResource(
		URI.assets,
		"Assets",
		"Library of raw uploaded files; drop anything and it's filed into the timeline.",
		"/assets",
	),
	htmlResource(
		URI.breathing,
		"Respiratory rate",
		"Measure resting breaths-per-minute with the camera.",
		"/breathing",
	),
	// Inline tool surfaces — rendered as tool RESULTS (toolInfo present), so they
	// route by tool name in web/app.tsx and don't need a baked route.
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
