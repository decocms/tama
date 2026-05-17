import { dashboardTool } from "./dashboard.ts";
import {
	episodeAddNoteTool,
	episodeDeleteTool,
	episodeEndTool,
	episodeGetTool,
	episodeListTool,
	episodeStartTool,
} from "./episode.ts";
import {
	petCreateTool,
	petDeleteTool,
	petEnrichTool,
	petGetTool,
	petListTool,
	petUpdateTool,
} from "./pet.ts";
import {
	prescriptionListTool,
	prescriptionUpdateTool,
	prescriptionUploadTool,
} from "./prescription.ts";
import {
	recordingAddChunkTool,
	recordingApplyTool,
	recordingCreateTool,
	recordingGetTool,
	recordingListTool,
	recordingSummarizeTool,
	recordingTranscribeTool,
} from "./recording.ts";
import {
	doseLogTool,
	timetableAdjustTool,
	timetableGetTool,
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
	episodeEndTool,
	episodeDeleteTool,
	episodeAddNoteTool,
	prescriptionUploadTool,
	prescriptionUpdateTool,
	prescriptionListTool,
	timetableGetTool,
	doseLogTool,
	timetableAdjustTool,
	recordingCreateTool,
	recordingAddChunkTool,
	recordingTranscribeTool,
	recordingSummarizeTool,
	recordingApplyTool,
	recordingGetTool,
	recordingListTool,
];
