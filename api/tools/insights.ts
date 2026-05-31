import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { generateEpisodeInsights } from "../ai/episode-insights.ts";
import type { Env } from "../env.ts";
import { listDoses } from "../storage/doses.ts";
import {
	getEpisode,
	listNotes,
	setEpisodeStatus,
} from "../storage/episodes.ts";
import {
	getLatestInsights,
	isFreshAgainst,
	saveInsights,
} from "../storage/insights.ts";
import { parseEnrichment } from "../storage/pets.ts";
import { getSelfPet } from "../storage/pet-self.ts";
import {
	listPrescriptions,
	parseScheduleItems,
} from "../storage/prescriptions.ts";
import { listRecordingsForEpisode } from "../storage/recordings.ts";
import { URI } from "./uris.ts";

function daysSinceIso(iso: string): number {
	const ms = Date.now() - new Date(iso).getTime();
	return Math.max(1, Math.floor(ms / 86_400_000) + 1);
}

const InsightBulletSchema = z.object({
	tag: z.enum(["status", "watch-out", "next-action"]),
	text: z.string(),
	sourceKind: z.enum(["note", "recording", "prescription", "dose", "schedule"]),
	sourceId: z.string().nullable(),
});

export const episodeInsightsTool = (_env: Env) =>
	createTool({
		id: "episode_insights",
		description:
			"Generate up to 3 short AI insight bullets for an episode (status / watch-out / next-action). Cached per-episode for 5 minutes; pass refresh=true to force regeneration.",
		inputSchema: z.object({
			episodeId: z.string(),
			refresh: z
				.boolean()
				.optional()
				.describe("Force regeneration even if cache is fresh."),
		}),
		outputSchema: z.object({
			insights: z.array(InsightBulletSchema),
			generatedAt: z.string(),
			cached: z.boolean(),
		}),
		_meta: { ui: { resourceUri: URI.episodeInsights } },
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const ep = await getEpisode(env, context.episodeId);
			if (!ep) throw new Error(`Episode not found: ${context.episodeId}`);

			const [pet, rxRows, doseRows, noteRows, recordings] = await Promise.all([
				getSelfPet(env),
				listPrescriptions(env, ep.id),
				listDoses(env, ep.id),
				listNotes(env, ep.id),
				listRecordingsForEpisode(env, ep.id),
			]);

			// Latest content timestamp across everything the prompt consumes.
			// Cache is fresh as long as nothing newer than this has been added.
			const latestContentAt =
				[
					...noteRows.map((n) => n.createdAt),
					...doseRows.map((d) => d.actualAt),
					...recordings.map((r) => r.createdAt),
					...rxRows.map((r) => r.createdAt),
				]
					.sort()
					.at(-1) ?? null;

			if (!context.refresh) {
				const cached = await getLatestInsights(env, context.episodeId);
				if (cached && isFreshAgainst(cached, latestContentAt)) {
					return {
						insights: cached.bullets.map((b) => ({
							tag: b.tag,
							text: b.text,
							sourceKind: b.sourceKind,
							sourceId: b.sourceId ?? null,
						})),
						generatedAt: cached.generatedAt,
						cached: true,
					};
				}
			}

			const enrichment = pet ? parseEnrichment(pet) : null;
			const ownerNotes =
				[
					pet?.ownerNotes ?? "",
					enrichment?.conditionNotes
						? `AI research: ${enrichment.conditionNotes}`
						: "",
				]
					.filter(Boolean)
					.join("\n\n") || null;

			const latestRecording = recordings
				.filter((r) => r.summary)
				.sort(
					(a, b) =>
						new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
				)[0];

			const result = await generateEpisodeInsights(env, {
				petContext: {
					name: pet?.name ?? "the pet",
					species: pet?.species ?? "dog",
					breed: pet?.breed ?? null,
					dob: pet?.dob ?? null,
					weightKg: pet?.weightKg ?? null,
					ownerNotes,
				},
				episodeContext: {
					title: ep.title,
					startedAt: ep.startedAt,
					summary: ep.summary,
					dayNumber: daysSinceIso(ep.startedAt),
				},
				prescriptions: rxRows
					.filter((r) => r.status === "confirmed")
					.map((r) => ({
						items: parseScheduleItems(r).map((it) => ({
							name: it.name,
							kind: it.kind,
							times: it.times,
							dosage: it.dosage ?? null,
						})),
					})),
				recentNotes: noteRows
					.slice()
					.sort(
						(a, b) =>
							new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
					)
					.slice(0, 5)
					.map((n) => ({
						id: n.id,
						kind: n.kind,
						createdAt: n.createdAt,
						content: n.content,
					})),
				recentDoses: doseRows.slice(0, 10).map((d) => ({
					itemName: d.itemName,
					actualAt: d.actualAt,
					plannedAt: d.plannedAt,
					status: d.status,
					note: d.note,
				})),
				latestRecording: latestRecording
					? { id: latestRecording.id, summary: latestRecording.summary }
					: null,
			});

			const saved = await saveInsights(env, {
				episodeId: ep.id,
				bullets: result.insights,
				rawAiText: result.rawAiText,
			});

			// Persist the status bullet directly onto episodes.summary — the
			// summary line under the title IS the live status the user sees.
			// Skip when the AI didn't emit a status (keep the previous summary).
			const statusBullet = saved.bullets.find((b) => b.tag === "status");
			if (statusBullet?.text) {
				await setEpisodeStatus(env, ep.id, statusBullet.text);
			}

			return {
				insights: saved.bullets.map((b) => ({
					tag: b.tag,
					text: b.text,
					sourceKind: b.sourceKind,
					sourceId: b.sourceId ?? null,
				})),
				generatedAt: saved.generatedAt,
				cached: false,
			};
		},
	});
