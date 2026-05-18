// Resource URIs for each inline tool UI plus the standalone main dashboard.
// Keep one URI per surface — studio uses these to label entries in the "UI" catalog
// and to spawn the iframe when an agent calls the tool.

export const URI = {
	main: "ui://myvet/main",
	petCreate: "ui://myvet/pet-create",
	petEnrich: "ui://myvet/pet-enrich",
	petGet: "ui://myvet/pet-get",
	petList: "ui://myvet/pet-list",
	episodeStart: "ui://myvet/episode-start",
	episodeGet: "ui://myvet/episode-get",
	episodeList: "ui://myvet/episode-list",
	prescriptionReview: "ui://myvet/prescription-review",
	prescriptionList: "ui://myvet/prescription-list",
	timetableGet: "ui://myvet/timetable-get",
	recordingGet: "ui://myvet/recording-get",
	episodeInsights: "ui://myvet/episode-insights",
} as const;
