import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { extractVetTeam } from "../ai/extract-vet-team.ts";
import type { Env } from "../env.ts";
import { listRecordings } from "../storage/recordings.ts";
import { listNotes } from "../storage/timeline.ts";
import {
	addVetTeamMember,
	deleteVetTeamMember,
	listVetTeam,
	updateVetTeamMember,
} from "../storage/vet-team.ts";
import { listVetVisits } from "../storage/vet-visits.ts";
import { URI } from "./uris.ts";

const VetTeamMemberSchema = z.object({
	id: z.string(),
	name: z.string(),
	role: z.string().nullable(),
	clinic: z.string().nullable(),
	phone: z.string().nullable(),
	email: z.string().nullable(),
	notes: z.string().nullable(),
	active: z.boolean(),
	createdAt: z.string(),
});

export const vetTeamAddTool = (_env: Env) =>
	createTool({
		id: "vet_team_add",
		description:
			"Add a veterinarian or specialist to the pet's care team (the roster of providers involved in this pet's care). Capture the role/specialty (e.g. 'Endocrinologista', 'Cirurgião'), clinic, and contact when known. Reference data shown in the Vet team app — not a timeline event.",
		inputSchema: z.object({
			name: z.string().min(1),
			role: z
				.string()
				.optional()
				.describe(
					"Specialty or role, e.g. 'Endocrinologista', 'Clínico geral'.",
				),
			clinic: z.string().optional(),
			phone: z.string().optional(),
			email: z.string().optional(),
			notes: z.string().optional(),
		}),
		outputSchema: z.object({ id: z.string() }),
		execute: async ({ context, runtimeContext }) => {
			const m = await addVetTeamMember(runtimeContext.env as Env, context);
			return { id: m.id };
		},
	});

export const vetTeamListTool = (_env: Env) =>
	createTool({
		id: "vet_team_list",
		description:
			"List the pet's care team — the vets/specialists on the case. Active members first. Use this before referencing or editing a team member (you need their id to update/remove).",
		inputSchema: z.object({}),
		outputSchema: z.object({ team: z.array(VetTeamMemberSchema) }),
		_meta: { ui: { resourceUri: URI.vetTeam } },
		annotations: { readOnlyHint: true },
		execute: async ({ runtimeContext }) => {
			const team = await listVetTeam(runtimeContext.env as Env);
			return {
				team: team.map((m) => ({
					id: m.id,
					name: m.name,
					role: m.role,
					clinic: m.clinic,
					phone: m.phone,
					email: m.email,
					notes: m.notes,
					active: m.active,
					createdAt: m.createdAt,
				})),
			};
		},
	});

export const vetTeamUpdateTool = (_env: Env) =>
	createTool({
		id: "vet_team_update",
		description:
			"Edit a care-team member by id (rename, change role/clinic/contact/notes, or set active=false to retire them from the live roster without deleting). Only the fields you pass change. Get the id from vet_team_list.",
		inputSchema: z.object({
			id: z.string(),
			name: z.string().optional(),
			role: z.string().nullable().optional(),
			clinic: z.string().nullable().optional(),
			phone: z.string().nullable().optional(),
			email: z.string().nullable().optional(),
			notes: z.string().nullable().optional(),
			active: z.boolean().optional(),
		}),
		outputSchema: z.object({ updated: z.boolean() }),
		execute: async ({ context, runtimeContext }) => {
			const { id, ...patch } = context;
			const row = await updateVetTeamMember(
				runtimeContext.env as Env,
				id,
				patch,
			);
			return { updated: !!row };
		},
	});

export const vetTeamRemoveTool = (_env: Env) =>
	createTool({
		id: "vet_team_remove",
		description:
			"Permanently remove a member from the care team by id. To merely retire a provider while keeping them on record, prefer vet_team_update with active=false.",
		inputSchema: z.object({ id: z.string() }),
		outputSchema: z.object({ removed: z.boolean() }),
		execute: async ({ context, runtimeContext }) => {
			const ok = await deleteVetTeamMember(
				runtimeContext.env as Env,
				context.id,
			);
			return { removed: ok };
		},
	});

export const vetTeamExtractTool = (_env: Env) =>
	createTool({
		id: "vet_team_extract",
		description:
			"Auto-fill the care team from the pet's existing records. Scans vet visits, recording transcripts/summaries, and notes with AI, pulls out the vets/specialists mentioned, dedupes against who's already on the team, and adds the new ones. Use to bootstrap the roster from history or to catch a vet named in a recent recording. Pass extraContext to fold in something the owner just told you in chat.",
		inputSchema: z.object({
			extraContext: z
				.string()
				.optional()
				.describe(
					"Free text to consider alongside the records — e.g. a vet the owner just named in chat.",
				),
		}),
		outputSchema: z.object({
			created: z.array(VetTeamMemberSchema),
			foundCount: z.number(),
			alreadyOnTeam: z.number(),
		}),
		_meta: { ui: { resourceUri: URI.vetTeam } },
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const [visits, recs, notes, existing] = await Promise.all([
				listVetVisits(env),
				listRecordings(env),
				listNotes(env),
				listVetTeam(env),
			]);

			const parts: string[] = [];
			for (const v of visits) {
				const line = [v.vetName, v.clinic, v.reason, v.notes]
					.filter(Boolean)
					.join(" — ");
				if (line) parts.push(`[Consulta ${v.visitedAt.slice(0, 10)}] ${line}`);
			}
			for (const r of recs) {
				const t = r.summary ?? r.historyUpdate ?? r.fullTranscript;
				if (t)
					parts.push(
						`[Gravação ${r.originalName ?? r.createdAt.slice(0, 10)}] ${t}`,
					);
			}
			for (const n of notes) {
				parts.push(`[Nota ${n.createdAt.slice(0, 10)}] ${n.content}`);
			}
			if (context.extraContext)
				parts.push(`[Contexto] ${context.extraContext}`);

			// Cap the prompt to keep the call bounded; sources above are newest-first.
			let sourceText = parts.join("\n\n");
			if (sourceText.length > 16000) sourceText = sourceText.slice(0, 16000);

			if (!sourceText.trim()) {
				return { created: [], foundCount: 0, alreadyOnTeam: existing.length };
			}

			const existingNames = existing.map((m) => m.name);
			const found = await extractVetTeam(env, { sourceText, existingNames });

			// Dedupe vs the team AND within this batch (case-insensitive on name).
			const seen = new Set(existing.map((m) => m.name.trim().toLowerCase()));
			const created: Awaited<ReturnType<typeof addVetTeamMember>>[] = [];
			for (const v of found) {
				const key = v.name.trim().toLowerCase();
				if (!key || seen.has(key)) continue;
				seen.add(key);
				const row = await addVetTeamMember(env, {
					name: v.name.trim(),
					role: v.role ?? null,
					clinic: v.clinic ?? null,
					phone: v.phone ?? null,
					email: v.email ?? null,
					notes: v.notes ?? null,
				});
				created.push(row);
			}

			return {
				created: created.map((m) => ({
					id: m.id,
					name: m.name,
					role: m.role,
					clinic: m.clinic,
					phone: m.phone,
					email: m.email,
					notes: m.notes,
					active: m.active,
					createdAt: m.createdAt,
				})),
				foundCount: found.length,
				alreadyOnTeam: existing.length,
			};
		},
	});
