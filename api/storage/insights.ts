import { desc, eq } from "drizzle-orm";
import type { InsightBullet } from "../ai/episode-insights.ts";
import { db } from "../db/client.ts";
import { type EpisodeInsightsRow, episodeInsights } from "../db/schema.ts";
import type { Env } from "../env.ts";
import { newId } from "./ids.ts";

export interface InsightsRecord {
	id: string;
	episodeId: string;
	bullets: InsightBullet[];
	generatedAt: string;
}

function parseRow(row: EpisodeInsightsRow): InsightsRecord {
	let bullets: InsightBullet[] = [];
	try {
		const parsed = JSON.parse(row.bulletsJson);
		if (Array.isArray(parsed)) bullets = parsed as InsightBullet[];
	} catch {
		// malformed cached row — return empty bullets so the caller can refresh
	}
	return {
		id: row.id,
		episodeId: row.episodeId,
		bullets,
		generatedAt: row.generatedAt,
	};
}

export async function getLatestInsights(
	env: Env,
	episodeId: string,
): Promise<InsightsRecord | null> {
	const rows = await db(env)
		.select()
		.from(episodeInsights)
		.where(eq(episodeInsights.episodeId, episodeId))
		.orderBy(desc(episodeInsights.generatedAt))
		.limit(1);
	return rows[0] ? parseRow(rows[0]) : null;
}

export async function saveInsights(
	env: Env,
	input: {
		episodeId: string;
		bullets: InsightBullet[];
		rawAiText: string;
	},
): Promise<InsightsRecord> {
	const id = newId("ins");
	const [row] = await db(env)
		.insert(episodeInsights)
		.values({
			id,
			episodeId: input.episodeId,
			bulletsJson: JSON.stringify(input.bullets),
			rawAiText: input.rawAiText,
		})
		.returning();
	return parseRow(row);
}

// Insights are fresh as long as no new content has landed since they were
// generated. Page opens with nothing new should NOT trigger a Claude call —
// the user only wants regeneration when there's actually something to react
// to (new note, new dose, new recording, new prescription, or explicit
// refresh). `latestContentAt` is the max(createdAt) across all relevant
// content for the episode.
export function isFreshAgainst(
	record: InsightsRecord,
	latestContentAt: string | null,
): boolean {
	if (!latestContentAt) return true;
	return (
		new Date(latestContentAt).getTime() <=
		new Date(record.generatedAt).getTime()
	);
}
