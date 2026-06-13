import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { McpProvider, useMcpHostContext } from "./context.tsx";
import PetCardInline from "./inline/pet-card.tsx";
import PrescriptionListInline from "./inline/prescription-list.tsx";
import InlinePrescriptionReview from "./inline/prescription-review.tsx";
import { MainApp } from "./main/App.tsx";
import "./globals.css";

// When studio opens one of the three top-level app tools (or a data tool
// whose UI is one of the apps), point the hash router at the right route
// before MainApp mounts. Inline result surfaces (pet card, prescription
// review/list) render directly instead.
const TOOL_TO_ROUTE: Record<string, string> = {
	app_pet: "/",
	app_timeline: "/timeline",
	app_timetable: "/timetable",
	app_exams: "/exams",
	app_research: "/research",
	app_recordings: "/recordings",
	app_assets: "/assets",
	app_breathing: "/breathing",
	app_vet_team: "/vet-team",
	timeline_get: "/timeline",
	timetable_get: "/timetable",
	recording_list: "/recordings",
	recording_create: "/recordings",
	research_list: "/research",
	vet_research: "/research",
	vet_team_list: "/vet-team",
	vet_team_extract: "/vet-team",
};

function Root() {
	const ctx = useMcpHostContext();
	const toolName = ctx?.toolInfo?.tool.name;

	// A pinned app tile is rendered straight from its ui:// resource (no
	// tools/call), so there's no toolInfo to route on — the host doesn't pass
	// the resource URI either. Each app resource bakes its route into the HTML
	// as window.__TAMA_ROUTE__ (see api/resources/ui.ts); honor it first so
	// every tile opens its own app instead of all defaulting to Pet.
	const baked = (window as unknown as { __TAMA_ROUTE__?: string })
		.__TAMA_ROUTE__;
	if (baked) {
		if (!window.location.hash.startsWith(`#${baked}`)) {
			window.location.hash = `#${baked}`;
		}
		return <MainApp />;
	}

	if (toolName && TOOL_TO_ROUTE[toolName]) {
		const target = TOOL_TO_ROUTE[toolName];
		if (!window.location.hash.startsWith(`#${target}`)) {
			window.location.hash = `#${target}`;
		}
		return <MainApp />;
	}

	switch (toolName) {
		case "pet_profile":
			return <PetCardInline label="Loading pet" />;
		case "prescription_upload":
			return <InlinePrescriptionReview />;
		case "prescription_list":
			return <PrescriptionListInline />;
		default:
			// No tool context (or any other tool) → the full app.
			return <MainApp />;
	}
}

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Missing root element");
}

createRoot(rootElement).render(
	<StrictMode>
		<McpProvider>
			<Root />
		</McpProvider>
	</StrictMode>,
);
