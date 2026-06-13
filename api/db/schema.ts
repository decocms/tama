import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const nowSql = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const pets = sqliteTable("pets", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	species: text("species").notNull().default("dog"),
	breed: text("breed"),
	dob: text("dob"),
	weightKg: real("weight_kg"),
	ownerNotes: text("owner_notes"),
	// DEPRECATED: the old Perplexity breed/condition "enrichment" artifact.
	// pet_enrich was removed — the pet sheet (profileJson) is the single source
	// of case context now, and vet_research covers ad-hoc questions. Column kept
	// inert so existing rows still read; not written anymore.
	enrichmentJson: text("enrichment_json"),
	timezone: text("timezone"),
	// Owner-facing city/location label, distinct from the IANA timezone.
	location: text("location"),
	// Per-pet pixel sprite pack — JSON map of {idle, happy, ...} → R2 URL.
	// Legacy raster (img2img) pack — no longer written; the SVG pack below is
	// the sole sprite path now. Column kept so old rows still read.
	spritePackJson: text("sprite_pack_json"),
	// Parallel SVG sprite pack — JSON map of {idle, happy, ...} → SVG
	// string. Populated by pet_sprite_svg_generate (procedural). Crisp at
	// any size, instant, free; trade-off vs the raster pack.
	svgPackJson: text("svg_pack_json"),
	// Structured character description (colors, ear shape, markings) extracted
	// from the source photo. Cached so re-renders stay on-model.
	characterJson: text("character_json"),
	photoFileId: text("photo_file_id"),
	// DEPRECATED: the old one-line rolling status. pet_summary_refresh was
	// removed — it duplicated profileJson.oneLiner (the pet sheet's headline),
	// which is now the single source. Columns kept inert so old rows still read.
	summary: text("summary"),
	summaryAt: text("summary_at"),
	// Owner-set companion mood ("asleep", "happy", …) + when it was set. The
	// companion view shows this as the baseline; live schedule events (meal soon,
	// med overdue) override it temporarily, and it goes stale after ~12h.
	companionState: text("companion_state"),
	companionStateAt: text("companion_state_at"),
	// Structured "case file" — JSON of the pet's key medical facts (age, weight,
	// allergies, chronic conditions, active concerns, past episodes, what to
	// watch). Synthesized by pet_profile_refresh and injected into AI context.
	profileJson: text("profile_json"),
	createdAt: text("created_at").notNull().default(nowSql),
	deletedAt: text("deleted_at"),
});

// Free-form timeline notes. There is no episode container anymore — every
// note hangs directly off the (single) pet and shows up in the continuous
// timeline. `kind` distinguishes a plain note from pasted chat history, an
// AI-written summary, or a generic logged event.
export const notes = sqliteTable("notes", {
	id: text("id").primaryKey(),
	petId: text("pet_id")
		.notNull()
		.references(() => pets.id, { onDelete: "cascade" }),
	kind: text("kind", {
		enum: ["text", "chatlog", "ai-summary", "general"],
	}).notNull(),
	content: text("content").notNull(),
	aiSummary: text("ai_summary"),
	createdAt: text("created_at").notNull().default(nowSql),
});

export const files = sqliteTable("files", {
	id: text("id").primaryKey(),
	r2Key: text("r2_key").notNull(),
	originalName: text("original_name"),
	mimeType: text("mime_type").notNull(),
	kind: text("kind", { enum: ["prescription", "exam", "other"] })
		.notNull()
		.default("prescription"),
	uploadedAt: text("uploaded_at").notNull().default(nowSql),
});

export const prescriptions = sqliteTable("prescriptions", {
	id: text("id").primaryKey(),
	petId: text("pet_id")
		.notNull()
		.references(() => pets.id, { onDelete: "cascade" }),
	fileId: text("file_id").references(() => files.id, { onDelete: "set null" }),
	status: text("status", { enum: ["draft", "confirmed"] })
		.notNull()
		.default("draft"),
	scheduleItemsJson: text("schedule_items_json").notNull().default("[]"),
	rawAiText: text("raw_ai_text"),
	sourceNotes: text("source_notes"),
	createdAt: text("created_at").notNull().default(nowSql),
});

export const doses = sqliteTable("doses", {
	id: text("id").primaryKey(),
	petId: text("pet_id")
		.notNull()
		.references(() => pets.id, { onDelete: "cascade" }),
	itemName: text("item_name").notNull(),
	kind: text("kind", { enum: ["medication", "meal"] })
		.notNull()
		.default("medication"),
	plannedAt: text("planned_at"),
	actualAt: text("actual_at").notNull().default(nowSql),
	status: text("status", { enum: ["given", "skipped", "undone"] })
		.notNull()
		.default("given"),
	note: text("note"),
	adjustmentJson: text("adjustment_json"),
	createdAt: text("created_at").notNull().default(nowSql),
});

// Live runtime schedule per (pet, item). The prescriptions table is the
// template; this is the drifting reality. See migration 0007 for the design.
export const scheduleState = sqliteTable("schedule_state", {
	id: text("id").primaryKey(),
	petId: text("pet_id")
		.notNull()
		.references(() => pets.id, { onDelete: "cascade" }),
	itemKey: text("item_key").notNull(),
	displayName: text("display_name").notNull(),
	kind: text("kind", { enum: ["medication", "meal"] })
		.notNull()
		.default("medication"),
	dosage: text("dosage"),
	route: text("route"),
	notes: text("notes"),
	intervalHours: real("interval_hours").notNull(),
	// Explicit clock times ("HH:mm" in the pet's tz), JSON array. When present
	// the timetable projects these exact times daily (supports irregular
	// schedules like 07:00/14:00/22:00); when null/[] it falls back to the
	// even-interval projection from anchorAt + intervalHours.
	timesJson: text("times_json"),
	anchorAt: text("anchor_at").notNull(),
	durationDays: integer("duration_days"),
	prescriptionId: text("prescription_id").references(() => prescriptions.id, {
		onDelete: "set null",
	}),
	active: integer("active", { mode: "boolean" }).notNull().default(true),
	// Treatment lifecycle bounds. startsAt defaults to the schedule_state's
	// createdAt on first insert; endsAt is derived from durationDays unless
	// the user pins it explicitly. Either may be null (open-ended treatment).
	startsAt: text("starts_at"),
	endsAt: text("ends_at"),
	createdAt: text("created_at").notNull().default(nowSql),
	updatedAt: text("updated_at").notNull().default(nowSql),
});

export const recordings = sqliteTable("recordings", {
	id: text("id").primaryKey(),
	petId: text("pet_id")
		.notNull()
		.references(() => pets.id, { onDelete: "cascade" }),
	originalFileId: text("original_file_id").references(() => files.id, {
		onDelete: "set null",
	}),
	originalName: text("original_name"),
	mimeType: text("mime_type").notNull(),
	durationS: real("duration_s"),
	numChunks: integer("num_chunks").notNull().default(0),
	status: text("status", {
		enum: [
			"uploading",
			"transcribing",
			"transcribed",
			"summarized",
			"applied",
			"error",
		],
	})
		.notNull()
		.default("uploading"),
	fullTranscript: text("full_transcript"),
	summary: text("summary"),
	historyUpdate: text("history_update"),
	episodeNoteId: text("episode_note_id").references(() => notes.id, {
		onDelete: "set null",
	}),
	error: text("error"),
	createdAt: text("created_at").notNull().default(nowSql),
});

export const recordingChunks = sqliteTable("recording_chunks", {
	id: text("id").primaryKey(),
	recordingId: text("recording_id")
		.notNull()
		.references(() => recordings.id, { onDelete: "cascade" }),
	idx: integer("idx").notNull(),
	fileId: text("file_id").references(() => files.id, { onDelete: "set null" }),
	startS: real("start_s").notNull(),
	endS: real("end_s").notNull(),
	transcript: text("transcript"),
	transcribedAt: text("transcribed_at"),
	createdAt: text("created_at").notNull().default(nowSql),
});

// Web Push: one row per browser/device that opted in. Single-tenant today,
// but petId is captured so we can scope notifications per-pet later without
// another migration. Endpoint is UNIQUE so re-subscribing is idempotent.
export const pushSubscriptions = sqliteTable("push_subscriptions", {
	id: text("id").primaryKey(),
	petId: text("pet_id").references(() => pets.id, { onDelete: "set null" }),
	endpoint: text("endpoint").notNull().unique(),
	p256dh: text("p256dh").notNull(),
	auth: text("auth").notNull(),
	userAgent: text("user_agent"),
	createdAt: text("created_at").notNull().default(nowSql),
});

// Lab exams (CBC / biochem / etc.). One row per uploaded or pasted lab
// report. Mirrors the prescriptions shape: optional R2 file, raw AI output
// stored for provenance, draft → confirmed lifecycle. The structured payload
// lives in exam_metrics; the document-level metadata (lab name, request id,
// date the blood was drawn) lives here.
export const exams = sqliteTable("exams", {
	id: text("id").primaryKey(),
	petId: text("pet_id")
		.notNull()
		.references(() => pets.id, { onDelete: "cascade" }),
	fileId: text("file_id").references(() => files.id, { onDelete: "set null" }),
	status: text("status", { enum: ["draft", "confirmed"] })
		.notNull()
		.default("draft"),
	performedAt: text("performed_at"),
	labName: text("lab_name"),
	requestId: text("request_id"),
	rawAiText: text("raw_ai_text"),
	sourceNotes: text("source_notes"),
	createdAt: text("created_at").notNull().default(nowSql),
});

// One row per lab parameter on an exam. canonicalKey is what we plot — when
// the LLM cannot map a parameter into the curated taxonomy it proposes a
// snake_case key and we flag pendingReview=true so the UI can surface it
// for the owner to accept or remap.
export const examMetrics = sqliteTable("exam_metrics", {
	id: text("id").primaryKey(),
	examId: text("exam_id")
		.notNull()
		.references(() => exams.id, { onDelete: "cascade" }),
	canonicalKey: text("canonical_key"),
	displayName: text("display_name").notNull(),
	valueNum: real("value_num"),
	valueText: text("value_text"),
	unit: text("unit"),
	refLow: real("ref_low"),
	refHigh: real("ref_high"),
	refText: text("ref_text"),
	status: text("status", {
		enum: ["normal", "low", "high", "abnormal", "unknown"],
	})
		.notNull()
		.default("unknown"),
	pendingReview: integer("pending_review", { mode: "boolean" })
		.notNull()
		.default(false),
	createdAt: text("created_at").notNull().default(nowSql),
});

// Audit log of LLM-proposed canonical keys that weren't in the taxonomy. We
// still save the metric with the proposed key; this table lets us review and
// either approve (add to the taxonomy code) or remap to an existing key.
export const metricAliases = sqliteTable("metric_aliases", {
	id: text("id").primaryKey(),
	proposedKey: text("proposed_key").notNull(),
	displayName: text("display_name").notNull(),
	unitSeen: text("unit_seen"),
	examId: text("exam_id").references(() => exams.id, { onDelete: "set null" }),
	approved: integer("approved", { mode: "boolean" }).notNull().default(false),
	mappedToKey: text("mapped_to_key"),
	createdAt: text("created_at").notNull().default(nowSql),
});

// ---- Timeline typed events ----
// These three tables join notes / doses / exams / recordings / prescriptions
// in the continuous per-pet timeline (merged at query time in
// api/storage/timeline.ts). Each is the structured home for a kind of
// life-event we know how to represent richly.

// A vet appointment. The fileId optionally links the discharge note / invoice
// in the Assets library that this visit was extracted from.
export const vetVisits = sqliteTable("vet_visits", {
	id: text("id").primaryKey(),
	petId: text("pet_id")
		.notNull()
		.references(() => pets.id, { onDelete: "cascade" }),
	visitedAt: text("visited_at").notNull().default(nowSql),
	vetName: text("vet_name"),
	clinic: text("clinic"),
	reason: text("reason"),
	notes: text("notes"),
	fileId: text("file_id").references(() => files.id, { onDelete: "set null" }),
	createdAt: text("created_at").notNull().default(nowSql),
});

// A vaccination. dueAt drives "next dose due" reminders later; lot/vetName are
// captured from the certificate when available.
export const vaccines = sqliteTable("vaccines", {
	id: text("id").primaryKey(),
	petId: text("pet_id")
		.notNull()
		.references(() => pets.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	administeredAt: text("administered_at").notNull().default(nowSql),
	dueAt: text("due_at"),
	lot: text("lot"),
	vetName: text("vet_name"),
	fileId: text("file_id").references(() => files.id, { onDelete: "set null" }),
	createdAt: text("created_at").notNull().default(nowSql),
});

// An observed symptom. resolvedAt is set when it clears, so the timeline can
// show "vomiting (3 days)" spans and the agent can correlate with meds.
export const symptoms = sqliteTable("symptoms", {
	id: text("id").primaryKey(),
	petId: text("pet_id")
		.notNull()
		.references(() => pets.id, { onDelete: "cascade" }),
	observedAt: text("observed_at").notNull().default(nowSql),
	description: text("description").notNull(),
	severity: text("severity", { enum: ["mild", "moderate", "severe"] }),
	resolvedAt: text("resolved_at"),
	createdAt: text("created_at").notNull().default(nowSql),
});

// Saved vet-research runs — history of grounded Q&A for the Pet page.
export const researches = sqliteTable("researches", {
	id: text("id").primaryKey(),
	petId: text("pet_id")
		.notNull()
		.references(() => pets.id, { onDelete: "cascade" }),
	question: text("question").notNull(),
	answer: text("answer").notNull(),
	keyPointsJson: text("key_points_json"),
	cautionsJson: text("cautions_json"),
	citationsJson: text("citations_json"),
	createdAt: text("created_at").notNull().default(nowSql),
});

// The pet's care team — the vets and specialists involved in this pet's care.
// Reference data (a roster shown on the Pet page + consulted by the agent), NOT
// a timeline event, so it's not merged into getTimeline. active=false keeps a
// former provider on record without cluttering the live roster.
export const vetTeam = sqliteTable("vet_team", {
	id: text("id").primaryKey(),
	petId: text("pet_id")
		.notNull()
		.references(() => pets.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	// Specialty / role, e.g. "Endocrinologista", "Cirurgião", "Clínico geral".
	role: text("role"),
	clinic: text("clinic"),
	phone: text("phone"),
	email: text("email"),
	notes: text("notes"),
	active: integer("active", { mode: "boolean" }).notNull().default(true),
	createdAt: text("created_at").notNull().default(nowSql),
	updatedAt: text("updated_at").notNull().default(nowSql),
});

// Idempotency log for the reminder cron. (scheduleStateId, plannedAt) is the
// primary key — INSERT OR IGNORE guarantees a single send per dose slot even
// if cron ticks overlap or retry.
export const notificationsSent = sqliteTable("notifications_sent", {
	scheduleStateId: text("schedule_state_id").notNull(),
	plannedAt: text("planned_at").notNull(),
	sentAt: text("sent_at").notNull().default(nowSql),
});

export type Pet = typeof pets.$inferSelect;
export type NewPet = typeof pets.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type FileRow = typeof files.$inferSelect;
export type NewFileRow = typeof files.$inferInsert;
export type Prescription = typeof prescriptions.$inferSelect;
export type NewPrescription = typeof prescriptions.$inferInsert;
export type Dose = typeof doses.$inferSelect;
export type NewDose = typeof doses.$inferInsert;
export type Recording = typeof recordings.$inferSelect;
export type NewRecording = typeof recordings.$inferInsert;
export type RecordingChunk = typeof recordingChunks.$inferSelect;
export type NewRecordingChunk = typeof recordingChunks.$inferInsert;
export type ScheduleStateRow = typeof scheduleState.$inferSelect;
export type NewScheduleStateRow = typeof scheduleState.$inferInsert;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert;
export type NotificationSentRow = typeof notificationsSent.$inferSelect;
export type NewNotificationSentRow = typeof notificationsSent.$inferInsert;
export type Exam = typeof exams.$inferSelect;
export type NewExam = typeof exams.$inferInsert;
export type ExamMetric = typeof examMetrics.$inferSelect;
export type NewExamMetric = typeof examMetrics.$inferInsert;
export type MetricAlias = typeof metricAliases.$inferSelect;
export type NewMetricAlias = typeof metricAliases.$inferInsert;
export type VetVisit = typeof vetVisits.$inferSelect;
export type NewVetVisit = typeof vetVisits.$inferInsert;
export type Vaccine = typeof vaccines.$inferSelect;
export type NewVaccine = typeof vaccines.$inferInsert;
export type Symptom = typeof symptoms.$inferSelect;
export type NewSymptom = typeof symptoms.$inferInsert;
export type Research = typeof researches.$inferSelect;
export type NewResearch = typeof researches.$inferInsert;
export type VetTeamMember = typeof vetTeam.$inferSelect;
export type NewVetTeamMember = typeof vetTeam.$inferInsert;
