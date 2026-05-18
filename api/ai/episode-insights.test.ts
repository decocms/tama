import { describe, expect, it } from "bun:test";
import { parseInsights } from "./episode-insights.ts";

describe("parseInsights", () => {
	it("extracts bullets from a fenced JSON block", () => {
		const raw = `here you go
\`\`\`json
{ "insights": [
  { "tag": "status", "text": "Beto handled all 4 doses on time today.", "sourceKind": "schedule", "sourceId": null },
  { "tag": "watch-out", "text": "Two skipped meals in last 24h.", "sourceKind": "dose", "sourceId": "dose_abc" }
] }
\`\`\``;
		const insights = parseInsights(raw);
		expect(insights).toHaveLength(2);
		expect(insights[0].tag).toBe("status");
		expect(insights[0].sourceKind).toBe("schedule");
		expect(insights[0].sourceId).toBeNull();
		expect(insights[1].sourceId).toBe("dose_abc");
	});

	it("caps at 3 bullets", () => {
		const raw = JSON.stringify({
			insights: Array.from({ length: 6 }).map((_, i) => ({
				tag: "status",
				text: `b${i}`,
				sourceKind: "schedule",
				sourceId: null,
			})),
		});
		expect(parseInsights(raw)).toHaveLength(3);
	});

	it("drops bullets with invalid tags or sources", () => {
		const raw = JSON.stringify({
			insights: [
				{ tag: "bogus", text: "x", sourceKind: "schedule" },
				{ tag: "status", text: "ok", sourceKind: "made-up-source" },
				{ tag: "next-action", text: "give meds", sourceKind: "prescription" },
			],
		});
		const insights = parseInsights(raw);
		expect(insights).toHaveLength(1);
		expect(insights[0].text).toBe("give meds");
	});

	it("returns empty when JSON is malformed", () => {
		expect(parseInsights("nope")).toEqual([]);
		expect(parseInsights("```json\nnot json\n```")).toEqual([]);
	});

	it("drops bullets with empty text", () => {
		const raw = JSON.stringify({
			insights: [
				{ tag: "status", text: "   ", sourceKind: "schedule" },
				{ tag: "status", text: "valid", sourceKind: "schedule" },
			],
		});
		expect(parseInsights(raw)).toHaveLength(1);
	});
});
