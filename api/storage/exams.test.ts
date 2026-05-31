import { describe, expect, it } from "bun:test";
import { drizzle } from "drizzle-orm/d1";
import { examMetrics } from "../db/schema.ts";
import {
	chunkForBindVars,
	D1_MAX_BIND_VARS,
} from "./chunk.ts";
import {
	buildExamMetricInsertRows,
	EXAM_METRIC_COLUMNS_PER_ROW,
} from "./exams.ts";

// Drizzle's d1 driver renders SQL synchronously via toSQL() without needing a
// live binding. We use that to count the exact bind-variable footprint of
// each insert the storage layer would emit — which is the dimension that
// overflowed in production ("too many SQL variables at offset 842:
// SQLITE_ERROR" surfaces when a statement has more than 100 bound values).
const db = drizzle(undefined as never, { schema: { examMetrics } });

function buildMetricInputs(n: number) {
	return Array.from({ length: n }, (_, i) => ({
		canonicalKey: `metric_${i}`,
		displayName: `Metric ${i}`,
		valueNum: i,
		valueText: null,
		unit: "u",
		refLow: 0,
		refHigh: 100,
		refText: null,
		status: "normal" as const,
		pendingReview: false,
	}));
}

describe("exam_metrics bulk insert vs D1 bind-variable limit", () => {
	it("EXAM_METRIC_COLUMNS_PER_ROW matches the actual SQL Drizzle emits", () => {
		// If a schema migration changes column count and this constant isn't
		// bumped, chunkForBindVars under-counts and we silently regress to
		// oversized inserts.
		const oneInsert = db
			.insert(examMetrics)
			.values(buildExamMetricInsertRows("exam_test", buildMetricInputs(1)))
			.toSQL();
		expect(oneInsert.params.length).toBe(EXAM_METRIC_COLUMNS_PER_ROW);
	});

	it("regression: a naive 30-metric bulk insert blows D1's bind-variable cap", () => {
		// This documents the production bug. Without chunking, a routine blood
		// panel (~30 parameters) at 12 columns/row generates 360 bind variables
		// — 3.6× over D1's 100-variable cap, surfacing as
		// "D1_ERROR: too many SQL variables at offset 842: SQLITE_ERROR".
		const rows = buildExamMetricInsertRows("exam_test", buildMetricInputs(30));
		const { params } = db.insert(examMetrics).values(rows).toSQL();
		expect(params.length).toBeGreaterThan(D1_MAX_BIND_VARS);
	});

	it("replaceMetrics' chunked insert path keeps every statement under the cap", () => {
		// Mirror what replaceMetrics builds, then simulate the chunked dispatch.
		// If anyone reverts replaceMetrics to a single .values(allRows) call,
		// this test still passes — but the bug below ("at least 2 chunks") will
		// catch silent reverts where chunkForBindVars is removed altogether.
		const rows = buildExamMetricInsertRows("exam_test", buildMetricInputs(30));
		const chunks = chunkForBindVars(rows, EXAM_METRIC_COLUMNS_PER_ROW);
		expect(chunks.length).toBeGreaterThan(1);
		expect(chunks.flat()).toEqual(rows);
		for (const chunk of chunks) {
			const { params } = db.insert(examMetrics).values(chunk).toSQL();
			expect(params.length).toBeLessThanOrEqual(D1_MAX_BIND_VARS);
		}
	});

	it("chunkForBindVars on an empty list returns no chunks", () => {
		expect(chunkForBindVars([], EXAM_METRIC_COLUMNS_PER_ROW)).toEqual([]);
	});

	it("chunkForBindVars passes through small lists in a single chunk", () => {
		const rows = buildExamMetricInsertRows("exam_test", buildMetricInputs(5));
		const chunks = chunkForBindVars(rows, EXAM_METRIC_COLUMNS_PER_ROW);
		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toEqual(rows);
	});
});
