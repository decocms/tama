import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../env.ts";
import {
	addVetTeamMember,
	deleteVetTeamMember,
	listVetTeam,
	updateVetTeamMember,
} from "../storage/vet-team.ts";
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
			"Add a veterinarian or specialist to the pet's care team (the roster of providers involved in this pet's care). Capture the role/specialty (e.g. 'Endocrinologista', 'Cirurgião'), clinic, and contact when known. Reference data shown on the Pet page — not a timeline event.",
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
		_meta: { ui: { resourceUri: URI.pet } },
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
