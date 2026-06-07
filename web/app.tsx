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
	timeline_get: "/timeline",
	timetable_get: "/timetable",
	recording_list: "/recordings",
	recording_create: "/recordings",
	research_list: "/research",
	vet_research: "/research",
};

function Root() {
	const ctx = useMcpHostContext();
	const toolName = ctx?.toolInfo?.tool.name;

	if (toolName && TOOL_TO_ROUTE[toolName]) {
		const target = TOOL_TO_ROUTE[toolName];
		if (!window.location.hash.startsWith(`#${target}`)) {
			window.location.hash = `#${target}`;
		}
		return <MainApp />;
	}

	switch (toolName) {
		case "pet_enrich":
			return <PetCardInline label="Researching pet" />;
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
