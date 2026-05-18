import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { McpProvider, useMcpHostContext } from "./context.tsx";
import EpisodeDashboardInline from "./inline/episode-dashboard.tsx";
import EpisodeInsightsInline from "./inline/episode-insights.tsx";
import EpisodeListInline from "./inline/episode-list.tsx";
import EpisodeStartInline from "./inline/episode-start.tsx";
import PetCardInline from "./inline/pet-card.tsx";
import PetListInline from "./inline/pet-list.tsx";
import PrescriptionListInline from "./inline/prescription-list.tsx";
import InlinePrescriptionReview from "./inline/prescription-review.tsx";
import TimetableInline from "./inline/timetable.tsx";
import { MainApp } from "./main/App.tsx";
import "./globals.css";

function Root() {
	const ctx = useMcpHostContext();
	const toolName = ctx?.toolInfo?.tool.name;

	switch (toolName) {
		case "dashboard":
			return <MainApp />;
		case "pet_create":
			return <PetCardInline label="Creating pet" />;
		case "pet_enrich":
			return <PetCardInline label="Researching pet" />;
		case "pet_get":
			return <PetCardInline label="Loading pet" />;
		case "pet_list":
			return <PetListInline />;
		case "episode_start":
			return <EpisodeStartInline />;
		case "episode_get":
			return <EpisodeDashboardInline />;
		case "episode_insights":
			return <EpisodeInsightsInline />;
		case "episode_list":
			return <EpisodeListInline />;
		case "prescription_upload":
			return <InlinePrescriptionReview />;
		case "prescription_list":
			return <PrescriptionListInline />;
		case "timetable_get":
			return <TimetableInline />;
		default:
			// No tool context → main admin dashboard.
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
