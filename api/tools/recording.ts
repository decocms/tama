import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
	joinTranscripts,
	summarizeRecording,
} from "../ai/summarize-recording.ts";
import { whisperTranscribe } from "../ai/whisper.ts";
import type { Env } from "../env.ts";
import { addNote, getEpisode, listNotes } from "../storage/episodes.ts";
import { getFile, readFileBytes, saveFile } from "../storage/files.ts";
import { updatePet } from "../storage/pets.ts";
import { getSelfPet } from "../storage/pet-self.ts";
import {
	addChunk,
	createRecording,
	getRecording,
	listChunks,
	listRecordingsForEpisode,
	setChunkTranscript,
	updateRecording,
} from "../storage/recordings.ts";
import { URI } from "./uris.ts";

const RecordingSchema = z.object({
	id: z.string(),
	episodeId: z.string(),
	originalFileId: z.string().nullable(),
	originalName: z.string().nullable(),
	mimeType: z.string(),
	durationS: z.number().nullable(),
	numChunks: z.number(),
	status: z.enum([
		"uploading",
		"transcribing",
		"transcribed",
		"summarized",
		"applied",
		"error",
	]),
	fullTranscript: z.string().nullable(),
	summary: z.string().nullable(),
	historyUpdate: z.string().nullable(),
	episodeNoteId: z.string().nullable(),
	error: z.string().nullable(),
	createdAt: z.string(),
});

const ChunkSchema = z.object({
	id: z.string(),
	recordingId: z.string(),
	idx: z.number(),
	fileId: z.string().nullable(),
	startS: z.number(),
	endS: z.number(),
	transcript: z.string().nullable(),
	transcribedAt: z.string().nullable(),
	createdAt: z.string(),
});

// ---------------------------------------------------------------------------
// recording_create — registers the recording row + optionally stores original
// ---------------------------------------------------------------------------

export const recordingCreateTool = (_env: Env) =>
	createTool({
		id: "recording_create",
		description:
			"Register a new audio recording for an episode. Stores the original file (optional) and reserves space for `numChunks` chunks. Call recording_add_chunk N times after this, then recording_transcribe.",
		inputSchema: z.object({
			episodeId: z.string(),
			mimeType: z.string(),
			originalName: z.string().optional(),
			durationS: z.number().optional(),
			numChunks: z.number().min(1),
			originalBase64: z
				.string()
				.optional()
				.describe("Optional base64 of the original file to preserve."),
		}),
		outputSchema: z.object({ recording: RecordingSchema }),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			let originalFileId: string | undefined;
			if (context.originalBase64) {
				const f = await saveFile(env, {
					base64: context.originalBase64,
					mimeType: context.mimeType,
					originalName: context.originalName,
					kind: "other",
				});
				originalFileId = f.id;
			}
			const rec = await createRecording(env, {
				episodeId: context.episodeId,
				mimeType: context.mimeType,
				originalName: context.originalName,
				durationS: context.durationS,
				numChunks: context.numChunks,
				originalFileId,
			});
			return { recording: rec };
		},
	});

// ---------------------------------------------------------------------------
// recording_add_chunk — saves one WAV chunk to R2 + DB row
// ---------------------------------------------------------------------------

export const recordingAddChunkTool = (_env: Env) =>
	createTool({
		id: "recording_add_chunk",
		description:
			"Upload one audio chunk of a recording. Each chunk is stored in R2 and indexed by `idx` (0-based).",
		inputSchema: z.object({
			recordingId: z.string(),
			idx: z.number().min(0),
			startS: z.number(),
			endS: z.number(),
			audioBase64: z.string(),
			mimeType: z.string().default("audio/wav"),
		}),
		outputSchema: z.object({
			chunkId: z.string(),
			fileId: z.string(),
		}),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const file = await saveFile(env, {
				base64: context.audioBase64,
				mimeType: context.mimeType,
				originalName: `chunk-${context.idx}.wav`,
				kind: "other",
			});
			const ch = await addChunk(env, {
				recordingId: context.recordingId,
				idx: context.idx,
				fileId: file.id,
				startS: context.startS,
				endS: context.endS,
			});
			return { chunkId: ch.id, fileId: file.id };
		},
	});

// ---------------------------------------------------------------------------
// recording_transcribe — transcribes any not-yet-transcribed chunks
// ---------------------------------------------------------------------------

export const recordingTranscribeTool = (_env: Env) =>
	createTool({
		id: "recording_transcribe",
		description:
			"Transcribe all chunks of a recording that don't yet have a transcript. Idempotent — already-transcribed chunks are skipped. Saves each chunk's transcript and the full combined transcript on the recording.",
		inputSchema: z.object({
			recordingId: z.string(),
			language: z
				.string()
				.optional()
				.describe(
					"BCP-47 language code, e.g. 'pt' or 'en'. Auto-detect if omitted.",
				),
		}),
		outputSchema: z.object({ recording: RecordingSchema }),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const rec = await getRecording(env, context.recordingId);
			if (!rec) throw new Error(`Recording not found: ${context.recordingId}`);

			await updateRecording(env, rec.id, {
				status: "transcribing",
				error: null,
			});

			const chunks = await listChunks(env, rec.id);
			try {
				for (const ch of chunks) {
					if (ch.transcript) continue;
					if (!ch.fileId) continue;
					const file = await getFile(env, ch.fileId);
					if (!file) continue;
					const bytes = await readFileBytes(env, file.r2Key);
					if (!bytes) continue;
					const text = await whisperTranscribe(env, {
						audio: new Uint8Array(bytes),
						mimeType: file.mimeType ?? "audio/wav",
						filename: `chunk-${ch.idx}.wav`,
						language: context.language,
					});
					await setChunkTranscript(env, ch.id, text);
				}
			} catch (err) {
				const msg = (err as Error).message;
				await updateRecording(env, rec.id, { status: "error", error: msg });
				throw err;
			}

			const finalChunks = await listChunks(env, rec.id);
			const full = finalChunks
				.map((c) => c.transcript ?? "")
				.join("\n")
				.trim();
			const updated = await updateRecording(env, rec.id, {
				status: "transcribed",
				fullTranscript: full,
				error: null,
			});
			return { recording: updated ?? rec };
		},
	});

// ---------------------------------------------------------------------------
// recording_summarize — Claude proposes summary / history / episode note
// ---------------------------------------------------------------------------

export const recordingSummarizeTool = (_env: Env) =>
	createTool({
		id: "recording_summarize",
		description:
			"Read the full transcript and produce three review-ready outputs: a brief summary, an update to the pet's long-term profile, and a note for the current episode. Does NOT apply them — call recording_apply after the user reviews.",
		inputSchema: z.object({ recordingId: z.string() }),
		outputSchema: z.object({ recording: RecordingSchema }),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const rec = await getRecording(env, context.recordingId);
			if (!rec) throw new Error(`Recording not found: ${context.recordingId}`);
			if (!rec.fullTranscript) {
				throw new Error(
					"Transcript not ready — call recording_transcribe first",
				);
			}
			const ep = await getEpisode(env, rec.episodeId);
			if (!ep) throw new Error("Episode not found");
			const pet = await getSelfPet(env);
			if (!pet) throw new Error("Pet not found");

			const notesRows = await listNotes(env, ep.id);
			const out = await summarizeRecording(env, {
				petContext: {
					name: pet.name,
					species: pet.species,
					breed: pet.breed,
					dob: pet.dob,
					weightKg: pet.weightKg,
					ownerNotes: pet.ownerNotes,
				},
				episodeContext: {
					title: ep.title,
					summary: ep.summary,
					existingNotes: notesRows.map((n) => n.content),
				},
				transcript: rec.fullTranscript,
			});

			const updated = await updateRecording(env, rec.id, {
				status: "summarized",
				summary: out.summary,
				historyUpdate: out.historyUpdate,
			});
			return { recording: updated ?? rec };
		},
	});

// ---------------------------------------------------------------------------
// recording_apply — write the user-confirmed updates to pet + episode
// ---------------------------------------------------------------------------

export const recordingApplyTool = (_env: Env) =>
	createTool({
		id: "recording_apply",
		description:
			"Apply the (optionally edited) summary outputs from a recording. Appends historyUpdate to the pet's owner notes and adds episodeNote as an episode note.",
		inputSchema: z.object({
			recordingId: z.string(),
			historyUpdate: z
				.string()
				.optional()
				.describe(
					"Override the AI-proposed history update. Empty string = skip.",
				),
			episodeNote: z
				.string()
				.optional()
				.describe(
					"Override the AI-proposed episode note. Empty string = skip.",
				),
		}),
		outputSchema: z.object({ recording: RecordingSchema }),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const rec = await getRecording(env, context.recordingId);
			if (!rec) throw new Error(`Recording not found: ${context.recordingId}`);
			const ep = await getEpisode(env, rec.episodeId);
			if (!ep) throw new Error("Episode not found");
			const pet = await getSelfPet(env);
			if (!pet) throw new Error("Pet not found");

			const history =
				context.historyUpdate !== undefined
					? context.historyUpdate
					: (rec.historyUpdate ?? "");
			const noteText =
				context.episodeNote !== undefined
					? context.episodeNote
					: (rec.summary ?? "");

			// Append history to ownerNotes (don't overwrite).
			if (history.trim()) {
				const stamp = new Date().toISOString().slice(0, 10);
				const appended =
					(pet.ownerNotes ? `${pet.ownerNotes}\n\n` : "") +
					`[${stamp} from recording]\n${history.trim()}`;
				await updatePet(env, pet.id, { ownerNotes: appended });
			}

			let episodeNoteId: string | null = rec.episodeNoteId;
			if (noteText.trim()) {
				const n = await addNote(env, {
					episodeId: ep.id,
					kind: "ai-summary",
					content: noteText.trim(),
				});
				episodeNoteId = n.id;
			}

			const updated = await updateRecording(env, rec.id, {
				status: "applied",
				historyUpdate: history,
				summary: noteText,
				episodeNoteId,
			});
			return { recording: updated ?? rec };
		},
	});

// ---------------------------------------------------------------------------
// recording_apply_group — combine N transcripts into one summary + apply
// ---------------------------------------------------------------------------

export const recordingApplyGroupTool = (_env: Env) =>
	createTool({
		id: "recording_apply_group",
		description:
			"Combine the transcripts of one or more recordings into a SINGLE analysis, then auto-apply: appends the long-term history update to pet.ownerNotes and inserts one ai-summary note on the episode. All recordings in the group are marked status='applied' and linked to that note. No review step — the analysis is shown via the resulting note in the timeline.",
		inputSchema: z.object({
			episodeId: z.string(),
			recordingIds: z
				.array(z.string())
				.min(1)
				.describe("One or more recordings to analyze together as one context."),
		}),
		outputSchema: z.object({
			noteId: z.string().nullable(),
			summary: z.string(),
			historyUpdate: z.string(),
			recordings: z.array(RecordingSchema),
		}),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const ep = await getEpisode(env, context.episodeId);
			if (!ep) throw new Error(`Episode not found: ${context.episodeId}`);
			const pet = await getSelfPet(env);
			if (!pet) throw new Error("Pet not found");

			// Load each recording, validate it belongs to the episode and has a
			// transcript. If any is missing, fail fast — better than silently
			// merging an incomplete set.
			const recs = await Promise.all(
				context.recordingIds.map((id) => getRecording(env, id)),
			);
			const valid: NonNullable<Awaited<ReturnType<typeof getRecording>>>[] = [];
			for (let i = 0; i < recs.length; i++) {
				const rec = recs[i];
				const id = context.recordingIds[i];
				if (!rec) throw new Error(`Recording not found: ${id}`);
				if (rec.episodeId !== ep.id) {
					throw new Error(`Recording ${id} is not part of this episode.`);
				}
				if (!rec.fullTranscript) {
					throw new Error(
						`Recording ${id} has no transcript yet — call recording_transcribe first.`,
					);
				}
				valid.push(rec);
			}

			// Stable order: oldest first, so the narrative reads chronologically.
			valid.sort(
				(a, b) =>
					new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
			);

			const combinedTranscript = joinTranscripts(
				valid.map((r) => ({
					label: [
						r.originalName,
						r.durationS ? `${Math.round(r.durationS)}s` : null,
					]
						.filter(Boolean)
						.join(" · "),
					transcript: r.fullTranscript ?? "",
				})),
			);

			const notesRows = await listNotes(env, ep.id);
			const out = await summarizeRecording(env, {
				petContext: {
					name: pet.name,
					species: pet.species,
					breed: pet.breed,
					dob: pet.dob,
					weightKg: pet.weightKg,
					ownerNotes: pet.ownerNotes,
				},
				episodeContext: {
					title: ep.title,
					summary: ep.summary,
					existingNotes: notesRows.map((n) => n.content),
				},
				transcript: combinedTranscript,
			});

			// Append history to ownerNotes (don't overwrite).
			if (out.historyUpdate.trim()) {
				const stamp = new Date().toISOString().slice(0, 10);
				const tag =
					valid.length === 1 ? "recording" : `${valid.length} recordings`;
				const appended =
					(pet.ownerNotes ? `${pet.ownerNotes}\n\n` : "") +
					`[${stamp} from ${tag}]\n${out.historyUpdate.trim()}`;
				await updatePet(env, pet.id, { ownerNotes: appended });
			}

			// Persist as a single ai-summary note on the episode.
			let noteId: string | null = null;
			const noteText = out.episodeNote.trim() || out.summary.trim();
			if (noteText) {
				const n = await addNote(env, {
					episodeId: ep.id,
					kind: "ai-summary",
					content: noteText,
				});
				noteId = n.id;
			}

			// Mark each recording applied + linked to the same note.
			const updated = await Promise.all(
				valid.map((r) =>
					updateRecording(env, r.id, {
						status: "applied",
						summary: out.summary,
						historyUpdate: out.historyUpdate,
						episodeNoteId: noteId,
					}),
				),
			);
			const result = updated.map((u, i) => u ?? valid[i]);

			return {
				noteId,
				summary: out.summary,
				historyUpdate: out.historyUpdate,
				recordings: result,
			};
		},
	});

// ---------------------------------------------------------------------------
// recording_get / recording_list
// ---------------------------------------------------------------------------

export const recordingGetTool = (_env: Env) =>
	createTool({
		id: "recording_get",
		description: "Fetch a recording with its chunks (transcripts included).",
		inputSchema: z.object({ recordingId: z.string() }),
		outputSchema: z.object({
			recording: RecordingSchema.nullable(),
			chunks: z.array(ChunkSchema),
		}),
		_meta: { ui: { resourceUri: URI.recordingGet } },
		annotations: { readOnlyHint: true },
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const rec = await getRecording(env, context.recordingId);
			if (!rec) return { recording: null, chunks: [] };
			const chunks = await listChunks(env, rec.id);
			return { recording: rec, chunks };
		},
	});

export const recordingListTool = (_env: Env) =>
	createTool({
		id: "recording_list",
		description: "List all recordings for an episode.",
		inputSchema: z.object({ episodeId: z.string() }),
		outputSchema: z.object({ recordings: z.array(RecordingSchema) }),
		annotations: { readOnlyHint: true },
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const rs = await listRecordingsForEpisode(env, context.episodeId);
			return { recordings: rs };
		},
	});
