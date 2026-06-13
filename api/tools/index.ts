import {
	appAssetsTool,
	appBreathingTool,
	appExamsTool,
	appPetTool,
	appRecordingsTool,
	appResearchTool,
	appTimelineTool,
	appTimetableTool,
	appVetTeamTool,
} from "./app-surfaces.ts";
import { assetListTool, assetUploadTool } from "./assets.ts";
import {
	examAddTool,
	examDeleteTool,
	examExplainTool,
	examGetTool,
	examListTool,
	examMetricSeriesTool,
	examUpdateTool,
} from "./exam.ts";
import {
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
	recordingApplyTool,
	recordingCreateTool,
	recordingGetTool,
	recordingListTool,
	recordingTranscribeTool,
} from "./recording.ts";
import { researchListTool, vetResearchTool } from "./research.ts";
import {
	petSpriteAdjustTool,
	petSpriteFillMissingTool,
	petSpriteGetTool,
	petSpriteSvgGenerateTool,
} from "./sprite.ts";
import {
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
import {
	doseLogTool,
	doseUpdateTool,
	scheduleStateListTool,
	timetableGetTool,
	timetableRescheduleTool,
	timetableSetBoundsTool,
} from "./timetable.ts";
import {
	vetTeamAddTool,
	vetTeamExtractTool,
	vetTeamListTool,
	vetTeamRemoveTool,
	vetTeamUpdateTool,
} from "./vet-team.ts";

export const tools = [
	// Top-level apps (one pinnable tab each in studio) — order matters: this is
	// the order studio lists them. Pet → Timetable → Timeline → Exams → …
	appPetTool,
	appTimetableTool,
	appTimelineTool,
	appExamsTool,
	appResearchTool,
	appRecordingsTool,
	appAssetsTool,
	appVetTeamTool,
	appBreathingTool,
	// Pet — the case file ("pet sheet") has one read + two writers: an AI
	// rebuild (refresh) and a manual surgical edit (update). No separate
	// one-line summary or enrichment artifact — the sheet is the single source.
	petProfileTool,
	petUpdateTool,
	petProfileRefreshTool,
	petProfileUpdateTool,
	petSpriteSvgGenerateTool,
	petSpriteGetTool,
	petSpriteAdjustTool,
	petSpriteFillMissingTool,
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
	// Care team — the roster of vets/specialists on the case (Pet-page reference
	// data, not a timeline event). add/list + update (retire via active=false)/remove.
	vetTeamAddTool,
	vetTeamListTool,
	vetTeamUpdateTool,
	vetTeamRemoveTool,
	vetTeamExtractTool,
	// Assets intake
	assetUploadTool,
	assetListTool,
	// Prescriptions
	prescriptionUploadTool,
	prescriptionCreateTool,
	prescriptionUpdateTool,
	prescriptionListTool,
	prescriptionDeleteTool,
	// Exams — one intake (file or text), separate read/get, edit/delete, charts, explain.
	examAddTool,
	examUpdateTool,
	examDeleteTool,
	examGetTool,
	examListTool,
	examMetricSeriesTool,
	examExplainTool,
	// Timetable — get/list reads, dose log/update, plus two lifecycle ops:
	// reschedule (when's the next dose) and set_bounds (start/stop/extend/remove).
	timetableGetTool,
	scheduleStateListTool,
	doseLogTool,
	doseUpdateTool,
	timetableRescheduleTool,
	timetableSetBoundsTool,
	// Recordings — chunked upload → transcribe → apply (summarizes inline).
	recordingCreateTool,
	recordingAddChunkTool,
	recordingTranscribeTool,
	recordingApplyTool,
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
