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

export interface EpisodeDashboardResult {
	episode: Episode | null;
	timetable: TimetableEntry[];
	prescriptions: PrescriptionSummary[];
	notes: Note[];
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
