// Mirrors api/tools/* output schemas. Keep in sync.

export interface Enrichment {
	breedNotes: string;
	ageNotes: string;
	conditionNotes: string;
	citations: { title: string; url: string }[];
	generatedAt: string;
	sourceQuery: string;
}

export interface SpritePack {
	idle: string;
	happy: string;
	hungry: string;
	"pill-time": string;
	sad: string;
	sleeping: string;
	size?: number;
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
	spritePack?: SpritePack | null;
	summary?: string | null;
	summaryAt?: string | null;
	createdAt: string;
}

export type TimelineType =
	| "note"
	| "dose"
	| "exam"
	| "recording"
	| "vet-visit"
	| "vaccine"
	| "symptom"
	| "prescription";

export interface TimelineEntry {
	id: string;
	type: TimelineType;
	at: string;
	title: string;
	detail: string | null;
	refId: string;
	status: string | null;
}

export interface VetVisit {
	id: string;
	visitedAt: string;
	vetName: string | null;
	clinic: string | null;
	reason: string | null;
	notes: string | null;
	fileId: string | null;
}

export interface Vaccine {
	id: string;
	name: string;
	administeredAt: string;
	dueAt: string | null;
	lot: string | null;
	vetName: string | null;
	fileId: string | null;
}

export interface Symptom {
	id: string;
	description: string;
	observedAt: string;
	severity: string | null;
	resolvedAt: string | null;
}

export interface Asset {
	id: string;
	originalName: string | null;
	mimeType: string;
	kind: string;
	uploadedAt: string;
}

export interface SpritePackFull {
	idle: string;
	happy: string;
	hungry: string;
	"pill-time": string;
	sad: string;
	sleeping: string;
}

export interface Note {
	id: string;
	petId: string;
	kind: "text" | "chatlog" | "ai-summary" | "general";
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
	petId: string;
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
	petId: string;
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
	petId: string;
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

export type RecordingStatus =
	| "uploading"
	| "transcribing"
	| "transcribed"
	| "summarized"
	| "applied"
	| "error";

export interface Recording {
	id: string;
	petId: string;
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

export type ExamStatus = "draft" | "confirmed";
export type MetricStatus = "normal" | "low" | "high" | "abnormal" | "unknown";

export interface Exam {
	id: string;
	petId: string;
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
