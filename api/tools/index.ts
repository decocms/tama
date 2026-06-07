import {
	appAssetsTool,
	appBreathingTool,
	appExamsTool,
	appPetTool,
	appRecordingsTool,
	appResearchTool,
	appTimelineTool,
	appTimetableTool,
} from "./app-surfaces.ts";
import { assetListTool, assetUploadTool } from "./assets.ts";
import {
	examDeleteTool,
	examExplainTool,
	examGetTool,
	examListTool,
	examMetricSeriesTool,
	examPasteTool,
	examUpdateTool,
	examUploadTool,
} from "./exam.ts";
import {
	petEnrichTool,
	petProfileRefreshTool,
	petProfileTool,
	petProfileUpdateTool,
	petUpdateTool,
} from "./pet.ts";
import {
	prescriptionCreateTool,
	prescriptionDeleteTool,
	prescriptionListTool,
	prescriptionUpdateTool,
	prescriptionUploadTool,
} from "./prescription.ts";
import {
	pushSubscribeTool,
	pushTestTool,
	pushUnsubscribeTool,
	pushVapidPublicKeyTool,
} from "./push.ts";
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
import { researchListTool, vetResearchTool } from "./research.ts";
import {
	petSpriteAdjustTool,
	petSpriteGetTool,
	petSpriteSvgGenerateTool,
} from "./sprite.ts";
import {
	doseLogTool,
	doseUpdateTool,
	scheduleStateDeleteTool,
	scheduleStateListTool,
	timetableGetTool,
	timetableSetAnchorTool,
	timetableSetDurationTool,
	timetableSnoozeTool,
	timetableStopItemTool,
} from "./timetable.ts";
import {
	petSummaryRefreshTool,
	symptomAddTool,
	symptomListTool,
	symptomResolveTool,
	timelineGetTool,
	timelineNoteAddTool,
	vaccineAddTool,
	vaccineListTool,
	vetVisitAddTool,
	vetVisitListTool,
} from "./timeline.ts";

export const tools = [
	// Top-level apps (one pinnable tab each in studio)
	appPetTool,
	appTimelineTool,
	appTimetableTool,
	appExamsTool,
	appResearchTool,
	appRecordingsTool,
	appAssetsTool,
	appBreathingTool,
	// Pet
	petProfileTool,
	petUpdateTool,
	petEnrichTool,
	petProfileRefreshTool,
	petProfileUpdateTool,
	petSpriteSvgGenerateTool,
	petSpriteGetTool,
	petSpriteAdjustTool,
	petSummaryRefreshTool,
	// Timeline + typed entries
	timelineGetTool,
	timelineNoteAddTool,
	vetVisitAddTool,
	vetVisitListTool,
	vaccineAddTool,
	vaccineListTool,
	symptomAddTool,
	symptomResolveTool,
	symptomListTool,
	// Assets intake
	assetUploadTool,
	assetListTool,
	// Prescriptions
	prescriptionUploadTool,
	prescriptionCreateTool,
	prescriptionUpdateTool,
	prescriptionListTool,
	prescriptionDeleteTool,
	// Exams
	examUploadTool,
	examPasteTool,
	examUpdateTool,
	examDeleteTool,
	examGetTool,
	examListTool,
	examMetricSeriesTool,
	examExplainTool,
	// Timetable
	timetableGetTool,
	scheduleStateListTool,
	scheduleStateDeleteTool,
	doseLogTool,
	doseUpdateTool,
	timetableSnoozeTool,
	timetableSetAnchorTool,
	timetableStopItemTool,
	timetableSetDurationTool,
	// Recordings
	recordingCreateTool,
	recordingAddChunkTool,
	recordingTranscribeTool,
	recordingSummarizeTool,
	recordingApplyTool,
	recordingApplyGroupTool,
	recordingGetTool,
	recordingListTool,
	// Research + push
	vetResearchTool,
	researchListTool,
	pushVapidPublicKeyTool,
	pushSubscribeTool,
	pushUnsubscribeTool,
	pushTestTool,
];
