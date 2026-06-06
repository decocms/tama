// Resource URIs for each MCP UI surface. Studio uses these to label entries
// in the "UI" catalog and to spawn the iframe when a tool is called.
//
// The three TOP-LEVEL apps (pinnable in studio) are pet / timeline / timetable
// — each backed by the no-op app tools in app-surfaces.ts. They all resolve to
// the same single-page bundle; the hash route inside decides what renders.
// The remaining URIs are inline per-tool result surfaces.

export const URI = {
	// Top-level apps
	pet: "ui://tama/pet",
	timeline: "ui://tama/timeline",
	timetable: "ui://tama/timetable",
	// Inline tool surfaces
	petGet: "ui://tama/pet-get",
	petEnrich: "ui://tama/pet-enrich",
	prescriptionReview: "ui://tama/prescription-review",
	prescriptionList: "ui://tama/prescription-list",
	recordingGet: "ui://tama/recording-get",
} as const;
