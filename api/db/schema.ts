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
	enrichmentJson: text("enrichment_json"),
	timezone: text("timezone"),
	createdAt: text("created_at").notNull().default(nowSql),
	deletedAt: text("deleted_at"),
});

export const episodes = sqliteTable("episodes", {
	id: text("id").primaryKey(),
	petId: text("pet_id")
		.notNull()
		.references(() => pets.id, { onDelete: "cascade" }),
	title: text("title").notNull(),
	status: text("status", { enum: ["open", "closed"] })
		.notNull()
		.default("open"),
	startedAt: text("started_at").notNull().default(nowSql),
	endedAt: text("ended_at"),
	summary: text("summary"),
	currentStatus: text("current_status"),
	currentStatusAt: text("current_status_at"),
	deletedAt: text("deleted_at"),
});

export const notes = sqliteTable("notes", {
	id: text("id").primaryKey(),
	episodeId: text("episode_id")
		.notNull()
		.references(() => episodes.id, { onDelete: "cascade" }),
	kind: text("kind", { enum: ["text", "chatlog", "ai-summary"] }).notNull(),
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
	episodeId: text("episode_id")
		.notNull()
		.references(() => episodes.id, { onDelete: "cascade" }),
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
	episodeId: text("episode_id")
		.notNull()
		.references(() => episodes.id, { onDelete: "cascade" }),
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

// Live runtime schedule per (episode, item). The prescriptions table is the
// template; this is the drifting reality. See migration 0007 for the design.
export const scheduleState = sqliteTable("schedule_state", {
	id: text("id").primaryKey(),
	episodeId: text("episode_id")
		.notNull()
		.references(() => episodes.id, { onDelete: "cascade" }),
	itemKey: text("item_key").notNull(),
	displayName: text("display_name").notNull(),
	kind: text("kind", { enum: ["medication", "meal"] })
		.notNull()
		.default("medication"),
	dosage: text("dosage"),
	route: text("route"),
	notes: text("notes"),
	intervalHours: real("interval_hours").notNull(),
	anchorAt: text("anchor_at").notNull(),
	durationDays: integer("duration_days"),
	prescriptionId: text("prescription_id").references(() => prescriptions.id, {
		onDelete: "set null",
	}),
	active: integer("active", { mode: "boolean" }).notNull().default(true),
	createdAt: text("created_at").notNull().default(nowSql),
	updatedAt: text("updated_at").notNull().default(nowSql),
});

export const episodeInsights = sqliteTable("episode_insights", {
	id: text("id").primaryKey(),
	episodeId: text("episode_id")
		.notNull()
		.references(() => episodes.id, { onDelete: "cascade" }),
	bulletsJson: text("bullets_json").notNull().default("[]"),
	rawAiText: text("raw_ai_text"),
	generatedAt: text("generated_at").notNull().default(nowSql),
});

export const recordings = sqliteTable("recordings", {
	id: text("id").primaryKey(),
	episodeId: text("episode_id")
		.notNull()
		.references(() => episodes.id, { onDelete: "cascade" }),
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
export type Episode = typeof episodes.$inferSelect;
export type NewEpisode = typeof episodes.$inferInsert;
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
export type EpisodeInsightsRow = typeof episodeInsights.$inferSelect;
export type NewEpisodeInsightsRow = typeof episodeInsights.$inferInsert;
export type ScheduleStateRow = typeof scheduleState.$inferSelect;
export type NewScheduleStateRow = typeof scheduleState.$inferInsert;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert;
export type NotificationSentRow = typeof notificationsSent.$inferSelect;
export type NewNotificationSentRow = typeof notificationsSent.$inferInsert;
