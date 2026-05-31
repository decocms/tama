// Mirrors api/tools/* output schemas. Keep in sync.

export interface Enrichment {
	breedNotes: string;
	ageNotes: string;
	conditionNotes: string;
	citations: { title: string; url: string }[];
	generatedAt: string;
	sourceQuery: string;
}

export interface Pet {
	id: string;
	name: string;
	species: string;
	breed: string | null;
	dob: string | null;
	weightKg: number | null;
	ownerNotes: string | null;
	timezone: string | null;
	enrichment: Enrichment | null;
	createdAt: string;
}

export interface Episode {
	id: string;
	petId: string;
	title: string;
	status: "open" | "closed";
	startedAt: string;
	endedAt: string | null;
	summary: string | null;
	currentStatus: string | null;
	currentStatusAt: string | null;
	deletedAt: string | null;
}

export interface Note {
	id: string;
	episodeId: string;
	kind: "text" | "chatlog" | "ai-summary";
	content: string;
	aiSummary: string | null;
	createdAt: string;
}

export interface ScheduleItem {
	name: string;
	kind: "medication" | "meal";
	dosage?: string;
	route?: string;
	times: string[];
	frequencyHours?: number;
	durationDays?: number;
	notes?: string;
}

export interface Prescription {
	id: string;
	episodeId: string;
	fileId: string | null;
	status: "draft" | "confirmed";
	scheduleItems: ScheduleItem[];
	rawAiText: string | null;
	sourceNotes: string | null;
	createdAt: string;
}

export interface PrescriptionSummary {
	id: string;
	status: "draft" | "confirmed";
	itemCount: number;
	fileId: string | null;
	createdAt: string;
}

export interface TimetableEntry {
	id: string;
	itemName: string;
	kind: "medication" | "meal";
	scheduledAt: string;
	dosage?: string;
	route?: string;
	notes?: string;
	prescriptionId: string;
	status: "pending" | "given" | "skipped";
	doseId?: string;
}

export interface Dose {
	id: string;
	episodeId: string;
	itemName: string;
	kind: "medication" | "meal";
	plannedAt: string | null;
	actualAt: string;
	status: "given" | "skipped" | "undone";
	note: string | null;
	adjustmentJson: string | null;
	createdAt: string;
}

export interface ScheduleState {
	id: string;
	episodeId: string;
	itemKey: string;
	displayName: string;
	kind: "medication" | "meal";
	dosage: string | null;
	route: string | null;
	notes: string | null;
	intervalHours: number;
	anchorAt: string;
	durationDays: number | null;
	prescriptionId: string | null;
	active: boolean;
	startsAt: string | null;
	endsAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface EpisodeDashboardResult {
	episode: Episode | null;
	timetable: TimetableEntry[];
	prescriptions: Prescription[];
	notes: Note[];
	doses: Dose[];
	scheduleStates: ScheduleState[];
}

export type RecordingStatus =
	| "uploading"
	| "transcribing"
	| "transcribed"
	| "summarized"
	| "applied"
	| "error";

export interface Recording {
	id: string;
	episodeId: string;
	originalFileId: string | null;
	originalName: string | null;
	mimeType: string;
	durationS: number | null;
	numChunks: number;
	status: RecordingStatus;
	fullTranscript: string | null;
	summary: string | null;
	historyUpdate: string | null;
	episodeNoteId: string | null;
	error: string | null;
	createdAt: string;
}

export type InsightTag = "status" | "watch-out" | "next-action";

export interface InsightBullet {
	tag: InsightTag;
	text: string;
	sourceKind: "note" | "recording" | "prescription" | "dose" | "schedule";
	sourceId: string | null;
}

export interface EpisodeInsightsResult {
	insights: InsightBullet[];
	generatedAt: string;
	cached: boolean;
}

export type ExamStatus = "draft" | "confirmed";
export type MetricStatus = "normal" | "low" | "high" | "abnormal" | "unknown";

export interface Exam {
	id: string;
	episodeId: string;
	fileId: string | null;
	status: ExamStatus;
	performedAt: string | null;
	labName: string | null;
	requestId: string | null;
	rawAiText: string | null;
	sourceNotes: string | null;
	createdAt: string;
}

export interface ExamMetric {
	id: string;
	examId: string;
	canonicalKey: string | null;
	displayName: string;
	valueNum: number | null;
	valueText: string | null;
	unit: string | null;
	refLow: number | null;
	refHigh: number | null;
	refText: string | null;
	status: MetricStatus;
	pendingReview: boolean;
	createdAt: string;
}

export interface ExamMetricSeriesPoint {
	canonicalKey: string;
	performedAt: string;
	valueNum: number | null;
	valueText: string | null;
	unit: string | null;
	refLow: number | null;
	refHigh: number | null;
	refText: string | null;
	status: MetricStatus;
	examId: string;
	displayName: string;
}

// Mirror of api/storage/exams.ts ExamMetricInput — used for exam_update
// when the user edits a metric in the review drawer.
export interface ExamMetricInput {
	canonicalKey: string | null;
	displayName: string;
	valueNum?: number | null;
	valueText?: string | null;
	unit?: string | null;
	refLow?: number | null;
	refHigh?: number | null;
	refText?: string | null;
	status?: MetricStatus;
	pendingReview?: boolean;
}

export interface RecordingChunk {
	id: string;
	recordingId: string;
	idx: number;
	fileId: string | null;
	startS: number;
	endS: number;
	transcript: string | null;
	transcribedAt: string | null;
	createdAt: string;
}
