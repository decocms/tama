// Resource URIs for each inline tool UI plus the standalone main dashboard.
// Keep one URI per surface — studio uses these to label entries in the "UI" catalog
// and to spawn the iframe when an agent calls the tool.

export const URI = {
	main: "ui://tama/main",
	petCreate: "ui://tama/pet-create",
	petEnrich: "ui://tama/pet-enrich",
	petGet: "ui://tama/pet-get",
	petList: "ui://tama/pet-list",
	episodeStart: "ui://tama/episode-start",
	episodeGet: "ui://tama/episode-get",
	episodeList: "ui://tama/episode-list",
	prescriptionReview: "ui://tama/prescription-review",
	prescriptionList: "ui://tama/prescription-list",
	timetableGet: "ui://tama/timetable-get",
	recordingGet: "ui://tama/recording-get",
	episodeInsights: "ui://tama/episode-insights",
} as const;
