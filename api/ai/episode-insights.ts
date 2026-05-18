import type { Env } from "../env.ts";
import { anthropicMessages } from "./gateway.ts";

export type InsightTag = "status" | "watch-out" | "next-action";

export interface InsightBullet {
	tag: InsightTag;
	text: string;
	sourceKind: "note" | "recording" | "prescription" | "dose" | "schedule";
	sourceId?: string | null;
}

export interface InsightsInput {
	petContext: {
		name: string;
		species: string;
		breed?: string | null;
		dob?: string | null;
		weightKg?: number | null;
		ownerNotes?: string | null;
	};
	episodeContext: {
		title: string;
		startedAt: string;
		summary?: string | null;
		dayNumber: number;
	};
	prescriptions: Array<{
		items: Array<{
			name: string;
			kind: "medication" | "meal";
			times: string[];
			dosage?: string | null;
		}>;
	}>;
	recentNotes: Array<{
		id: string;
		kind: string;
		createdAt: string;
		content: string;
	}>;
	recentDoses: Array<{
		itemName: string;
		actualAt: string;
		plannedAt: string | null;
		status: string;
		note: string | null;
	}>;
	latestRecording?: {
		id: string;
		summary?: string | null;
	} | null;
}

export interface InsightsResult {
	insights: InsightBullet[];
	rawAiText: string;
	generatedAt: string;
}

const SYSTEM_PROMPT = `You are a calm, conservative veterinary care assistant. Given a snapshot of a single illness episode (the pet's profile, active prescriptions, the latest doses, recent owner notes, and the latest recording summary), produce 1–3 short bullets in the user's language.

Each bullet MUST have:
- "tag": one of "status" (how the episode is going right now), "watch-out" (something to monitor), "next-action" (a concrete, immediate suggestion)
- "text": 1 short sentence (≤ 140 chars). No prefixes, no headings — just the observation.
- "sourceKind": one of "note", "recording", "prescription", "dose", "schedule"
- "sourceId": the id of the referenced note/recording when applicable, otherwise null

Rules:
- ALWAYS include exactly ONE "status" bullet — this is the headline shown at the top of the page; never omit it. It should reflect the most recent notes and recording (e.g. "Today: vet visit, improving, vomiting stopped") and be the FIRST bullet.
- After the status, add 0–2 more bullets ("watch-out" and/or "next-action") only when there's something genuinely useful to add. Don't pad — empty/two-bullet outputs are fine when nothing else is worth flagging.
- Be conservative on watch-outs and next-actions — do NOT invent symptoms or diagnoses. Stick to what the data shows.
- Prefer concrete actions over vague advice ("vet check tomorrow" > "monitor closely").
- Write in the same language as the recent notes when possible; otherwise English.

Return ONLY a fenced JSON block of the shape:
\`\`\`json
{ "insights": [{ "tag": "...", "text": "...", "sourceKind": "...", "sourceId": "..." }] }
\`\`\``;

function buildUserMessage(input: InsightsInput): string {
	const lines: string[] = [];
	lines.push(
		`Pet: ${input.petContext.name} (${input.petContext.species}${input.petContext.breed ? `, ${input.petContext.breed}` : ""})`,
	);
	if (input.petContext.dob) lines.push(`Age: ${input.petContext.dob}`);
	if (input.petContext.weightKg)
		lines.push(`Weight: ${input.petContext.weightKg} kg`);
	if (input.petContext.ownerNotes)
		lines.push(`Long-term notes: ${input.petContext.ownerNotes}`);

	lines.push("");
	lines.push(
		`Episode: "${input.episodeContext.title}" — day ${input.episodeContext.dayNumber} (started ${input.episodeContext.startedAt})`,
	);
	if (input.episodeContext.summary)
		lines.push(`Episode summary: ${input.episodeContext.summary}`);

	if (input.prescriptions.length > 0) {
		lines.push("");
		lines.push("Active prescriptions:");
		for (const rx of input.prescriptions) {
			for (const it of rx.items) {
				lines.push(
					`- ${it.name} (${it.kind})${it.dosage ? ` ${it.dosage}` : ""} at ${it.times.join(", ")}`,
				);
			}
		}
	}

	if (input.recentDoses.length > 0) {
		lines.push("");
		lines.push("Recent doses (last 10, newest first):");
		for (const d of input.recentDoses) {
			const planned = d.plannedAt ? ` planned ${d.plannedAt}` : "";
			const note = d.note ? ` — ${d.note}` : "";
			lines.push(
				`- [${d.status}] ${d.itemName} at ${d.actualAt}${planned}${note}`,
			);
		}
	}

	if (input.recentNotes.length > 0) {
		lines.push("");
		lines.push("Recent notes (newest first):");
		for (const n of input.recentNotes) {
			lines.push(`[note ${n.id}] ${n.kind} · ${n.createdAt}`);
			lines.push(n.content.slice(0, 600));
			lines.push("");
		}
	}

	if (input.latestRecording?.summary) {
		lines.push("");
		lines.push(
			`Latest recording summary [recording ${input.latestRecording.id}]:`,
		);
		lines.push(input.latestRecording.summary.slice(0, 800));
	}

	return lines.join("\n");
}

function stripJsonFence(text: string): string {
	const fenced = text.match(/```json\s*([\s\S]*?)```/);
	if (fenced) return fenced[1].trim();
	const generic = text.match(/```\s*([\s\S]*?)```/);
	if (generic) return generic[1].trim();
	return text.trim();
}

const VALID_TAGS = new Set<InsightTag>(["status", "watch-out", "next-action"]);
const VALID_SOURCES = new Set([
	"note",
	"recording",
	"prescription",
	"dose",
	"schedule",
]);

export function parseInsights(rawAiText: string): InsightBullet[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stripJsonFence(rawAiText));
	} catch {
		return [];
	}
	if (
		!parsed ||
		typeof parsed !== "object" ||
		!("insights" in parsed) ||
		!Array.isArray((parsed as { insights: unknown }).insights)
	) {
		return [];
	}
	const arr = (parsed as { insights: unknown[] }).insights;
	const out: InsightBullet[] = [];
	for (const raw of arr) {
		if (!raw || typeof raw !== "object") continue;
		const r = raw as Record<string, unknown>;
		const tag = r.tag;
		const text = typeof r.text === "string" ? r.text.trim() : "";
		const sourceKind = r.sourceKind;
		const sourceId =
			typeof r.sourceId === "string" && r.sourceId.length > 0
				? r.sourceId
				: null;
		if (!text) continue;
		if (typeof tag !== "string" || !VALID_TAGS.has(tag as InsightTag)) continue;
		if (typeof sourceKind !== "string" || !VALID_SOURCES.has(sourceKind))
			continue;
		out.push({
			tag: tag as InsightTag,
			text: text.slice(0, 240),
			sourceKind: sourceKind as InsightBullet["sourceKind"],
			sourceId,
		});
		if (out.length >= 3) break;
	}
	return out;
}

export async function generateEpisodeInsights(
	env: Env,
	input: InsightsInput,
): Promise<InsightsResult> {
	const res = await anthropicMessages(env, {
		model: "claude-opus-4-7",
		max_tokens: 1024,
		system: SYSTEM_PROMPT,
		messages: [
			{
				role: "user",
				content: [{ type: "text", text: buildUserMessage(input) }],
			},
		],
	});
	const rawAiText = res.content.find((c) => c.type === "text")?.text ?? "";
	return {
		insights: parseInsights(rawAiText),
		rawAiText,
		generatedAt: new Date().toISOString(),
	};
}
