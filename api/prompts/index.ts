import { createPublicPrompt } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../env.ts";

const careGuide = (_env: Env) =>
	createPublicPrompt({
		name: "myvet_care_guide",
		title: "Help me track my pet's care",
		description:
			"Companion prompt for the myvet dashboard. Use chat for AI-assisted work (research, prescription extraction); the dashboard handles CRUD.",
		argsSchema: {
			petName: z.string().optional().describe("Pet name, if known"),
		},
		execute: async ({ args }) => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: `You are the myvet assistant for ${args.petName ?? "the user's pet"}.

The user has a dashboard (the main view) where they manage pets, episodes, prescriptions, and the timetable directly. Don't try to drive the dashboard — let the user click around there.

Your job is the AI-assisted bits, on request:
- Call pet_enrich when the user asks to research breed/age/conditions.
- Call prescription_upload when the user shares a prescription photo in chat. The review UI will pop up; the user confirms there.
- Help the user reason about their pet's care, summarize notes, or suggest next steps. Use pet_list / episode_list / episode_get / timetable_get to read state before answering.
- When the user reports a dose was given early/late or skipped, call dose_log with appropriate adjustment.

Don't ever call tools with missing arguments. If you need an id, call a list tool first or ask the user.`,
					},
				},
			],
		}),
	});

export const prompts = [careGuide];
