import { dashboardTool } from "./dashboard.ts";
import {
	episodeAddNoteTool,
	episodeDeleteTool,
	episodeEndTool,
	episodeGetTool,
	episodeListTool,
	episodeStartTool,
	episodeUpdateTool,
} from "./episode.ts";
import { episodeInsightsTool } from "./insights.ts";
import {
	petCreateTool,
	petDeleteTool,
	petEnrichTool,
	petGetTool,
	petListTool,
	petUpdateTool,
} from "./pet.ts";
import {
	prescriptionCreateTool,
	prescriptionListTool,
	prescriptionUpdateTool,
	prescriptionUploadTool,
} from "./prescription.ts";
import {
	recordingAddChunkTool,
	recordingApplyGroupTool,
	recordingApplyTool,
	recordingCreateTool,
	recordingGetTool,
	recordingListTool,
	recordingSummarizeTool,
	recordingTranscribeTool,
} from "./recording.ts";
import { vetResearchTool } from "./research.ts";
import {
	doseLogTool,
	doseUpdateTool,
	timetableGetTool,
	timetableSnoozeTool,
} from "./timetable.ts";

export const tools = [
	dashboardTool,
	petCreateTool,
	petUpdateTool,
	petDeleteTool,
	petEnrichTool,
	petGetTool,
	petListTool,
	episodeStartTool,
	episodeGetTool,
	episodeListTool,
	episodeUpdateTool,
	episodeEndTool,
	episodeDeleteTool,
	episodeAddNoteTool,
	prescriptionUploadTool,
	prescriptionCreateTool,
	prescriptionUpdateTool,
	prescriptionListTool,
	timetableGetTool,
	doseLogTool,
	doseUpdateTool,
	timetableSnoozeTool,
	recordingCreateTool,
	recordingAddChunkTool,
	recordingTranscribeTool,
	recordingSummarizeTool,
	recordingApplyTool,
	recordingApplyGroupTool,
	recordingGetTool,
	recordingListTool,
	episodeInsightsTool,
	vetResearchTool,
];
