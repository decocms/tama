import type { Env } from "../env.ts";
import type { MetricSeriesRow } from "../storage/exams.ts";
import { anthropicMessages } from "./gateway.ts";

// Turn the metric series into a compact per-metric table the model can reason
// over: each metric's values over time + its reference range.
function buildTable(series: MetricSeriesRow[]): string {
	const byKey = new Map<string, MetricSeriesRow[]>();
	for (const r of series) {
		if (r.valueNum == null) continue;
		const arr = byKey.get(r.canonicalKey) ?? [];
		arr.push(r);
		byKey.set(r.canonicalKey, arr);
	}
	const lines: string[] = [];
	for (const [, rows] of byKey) {
		rows.sort((a, b) => a.performedAt.localeCompare(b.performedAt));
		const name = rows[0].displayName || rows[0].canonicalKey;
		const unit = rows[0].unit ?? "";
		const ref =
			rows[0].refLow != null && rows[0].refHigh != null
				? ` [normal ${rows[0].refLow}–${rows[0].refHigh}${unit ? ` ${unit}` : ""}]`
				: "";
		const points = rows
			.map((r) => `${r.performedAt.slice(0, 10)}: ${r.valueNum}${unit ? ` ${unit}` : ""}`)
			.join(", ");
		lines.push(`- ${name}${ref}: ${points}`);
	}
	return lines.join("\n");
}

const SYSTEM = `You are a veterinary assistant explaining a pet's lab-work trends to its owner, in a way the owner and their vet can read together. You are NOT diagnosing or prescribing — you explain what the numbers show and flag what's reassuring vs worth watching, then defer to the vet.

You'll get the pet's profile and a list of lab metrics with their values over time and normal ranges. Write a short, plain-language briefing grouped by body system. Use these sections, but ONLY include a section if there's relevant data for it:

## Blood count (anemia)
## Liver
## Kidney
## Protein & nutrition
## Pancreas
## Other

For each section you include: 1–3 sentences. Say which direction things moved (improving / worsening / stable), name the key numbers, and say plainly whether that's good, concerning, or neutral. Prefer "is recovering", "dropped then climbed back", "still below normal" over jargon. End the whole thing with a one-line **Bottom line** and a reminder to confirm with the vet.

Keep it tight — an owner should read the whole thing in under a minute. Output GitHub-flavored Markdown only, no preamble.

LANGUAGE: Write in the pet owner's language — match the language of the pet's profile/records (e.g. Brazilian Portuguese when they're in Portuguese), and translate the section headings to that language too.`;

export async function explainExams(
	env: Env,
	input: { petContext: string; series: MetricSeriesRow[] },
): Promise<string> {
	const table = buildTable(input.series);
	if (!table.trim()) {
		return "No numeric lab values to explain yet — upload an exam and confirm it first.";
	}

	const res = await anthropicMessages(env, {
		model: "claude-opus-4-7",
		max_tokens: 1200,
		system: SYSTEM,
		messages: [
			{
				role: "user",
				content: `Pet case file:\n${input.petContext}\n\nLab metrics over time:\n${table}`,
			},
		],
	});
	return res.content.find((c) => c.type === "text")?.text?.trim() ?? "";
}
