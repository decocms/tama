import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import {
	type Note,
	notes,
	doses,
	exams,
	recordings,
	prescriptions,
	vetVisits,
	vaccines,
	symptoms,
} from "../db/schema.ts";
import type { Env } from "../env.ts";
import { newId } from "./ids.ts";
import { PET_SELF_ID } from "./pet-self.ts";

// ---- Notes (free-form timeline entries) ----

export interface AddNoteInput {
	kind: "text" | "chatlog" | "ai-summary" | "general";
	content: string;
	aiSummary?: string;
}

export async function addNote(env: Env, input: AddNoteInput): Promise<Note> {
	const id = newId("note");
	const [row] = await db(env)
		.insert(notes)
		.values({
			id,
			petId: PET_SELF_ID,
			kind: input.kind,
			content: input.content,
			aiSummary: input.aiSummary,
		})
		.returning();
	return row;
}

export async function listNotes(env: Env): Promise<Note[]> {
	return db(env)
		.select()
		.from(notes)
		.where(eq(notes.petId, PET_SELF_ID))
		.orderBy(desc(notes.createdAt));
}

// ---- The unified timeline ----
// A query-time merge of every typed table into one reverse-chronological
// feed. There is no episode container — this IS the pet's life, continuous.

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
	at: string; // ISO — the moment the entry belongs to on the timeline
	title: string;
	detail: string | null;
	refId: string; // id of the underlying row (for deep-linking / editing)
	// Light status hint for coloring (e.g. dose given/skipped, symptom severity)
	status: string | null;
}

export interface TimelineQuery {
	kinds?: TimelineType[];
	limit?: number;
}

export async function getTimeline(
	env: Env,
	query: TimelineQuery = {},
): Promise<TimelineEntry[]> {
	const want = query.kinds ? new Set(query.kinds) : null;
	const include = (t: TimelineType) => !want || want.has(t);
	const d = db(env);
	const entries: TimelineEntry[] = [];

	// Each branch is independent; fetch in parallel then merge.
	const tasks: Promise<void>[] = [];

	if (include("note")) {
		tasks.push(
			d
				.select()
				.from(notes)
				.where(eq(notes.petId, PET_SELF_ID))
				.then((rows) => {
					for (const n of rows) {
						entries.push({
							id: `note:${n.id}`,
							type: "note",
							at: n.createdAt,
							title:
								n.kind === "chatlog"
									? "Chat log"
									: n.kind === "ai-summary"
										? "AI summary"
										: "Note",
							// Full content — the Timeline UI clamps to a couple lines and
							// opens the whole note in a reader on click.
							detail: n.content,
							refId: n.id,
							status: null,
						});
					}
				}),
		);
	}

	if (include("dose")) {
		tasks.push(
			d
				.select()
				.from(doses)
				.where(eq(doses.petId, PET_SELF_ID))
				.then((rows) => {
					for (const x of rows) {
						if (x.status === "undone") continue;
						entries.push({
							id: `dose:${x.id}`,
							type: "dose",
							at: x.actualAt,
							title:
								x.status === "skipped"
									? `Skipped ${x.itemName}`
									: `Gave ${x.itemName}`,
							detail: x.note ?? null,
							refId: x.id,
							status: x.status,
						});
					}
				}),
		);
	}

	if (include("exam")) {
		tasks.push(
			d
				.select()
				.from(exams)
				.where(eq(exams.petId, PET_SELF_ID))
				.then((rows) => {
					for (const e of rows) {
						entries.push({
							id: `exam:${e.id}`,
							type: "exam",
							at: e.performedAt ?? e.createdAt,
							title: e.labName ? `Exam — ${e.labName}` : "Lab exam",
							detail: e.requestId,
							refId: e.id,
							status: e.status,
						});
					}
				}),
		);
	}

	if (include("recording")) {
		tasks.push(
			d
				.select()
				.from(recordings)
				.where(eq(recordings.petId, PET_SELF_ID))
				.then((rows) => {
					for (const r of rows) {
						entries.push({
							id: `recording:${r.id}`,
							type: "recording",
							at: r.createdAt,
							title: r.originalName ?? "Recording",
							detail: r.summary ?? null,
							refId: r.id,
							status: r.status,
						});
					}
				}),
		);
	}

	if (include("vet-visit")) {
		tasks.push(
			d
				.select()
				.from(vetVisits)
				.where(eq(vetVisits.petId, PET_SELF_ID))
				.then((rows) => {
					for (const v of rows) {
						entries.push({
							id: `vet-visit:${v.id}`,
							type: "vet-visit",
							at: v.visitedAt,
							title: v.clinic
								? `Vet visit — ${v.clinic}`
								: "Vet visit",
							detail: v.reason ?? v.notes ?? null,
							refId: v.id,
							status: null,
						});
					}
				}),
		);
	}

	if (include("vaccine")) {
		tasks.push(
			d
				.select()
				.from(vaccines)
				.where(eq(vaccines.petId, PET_SELF_ID))
				.then((rows) => {
					for (const v of rows) {
						entries.push({
							id: `vaccine:${v.id}`,
							type: "vaccine",
							at: v.administeredAt,
							title: `Vaccine — ${v.name}`,
							detail: v.dueAt ? `Next due ${v.dueAt.slice(0, 10)}` : null,
							refId: v.id,
							status: null,
						});
					}
				}),
		);
	}

	if (include("symptom")) {
		tasks.push(
			d
				.select()
				.from(symptoms)
				.where(eq(symptoms.petId, PET_SELF_ID))
				.then((rows) => {
					for (const s of rows) {
						entries.push({
							id: `symptom:${s.id}`,
							type: "symptom",
							at: s.observedAt,
							title: s.description,
							detail: s.resolvedAt
								? `Resolved ${s.resolvedAt.slice(0, 10)}`
								: "Ongoing",
							refId: s.id,
							status: s.severity ?? null,
						});
					}
				}),
		);
	}

	if (include("prescription")) {
		tasks.push(
			d
				.select()
				.from(prescriptions)
				.where(eq(prescriptions.petId, PET_SELF_ID))
				.then((rows) => {
					for (const p of rows) {
						if (p.status !== "confirmed") continue;
						entries.push({
							id: `prescription:${p.id}`,
							type: "prescription",
							at: p.createdAt,
							title: "Prescription",
							detail: p.sourceNotes ?? null,
							refId: p.id,
							status: p.status,
						});
					}
				}),
		);
	}

	await Promise.all(tasks);

	entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
	return query.limit ? entries.slice(0, query.limit) : entries;
}
