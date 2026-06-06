import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.ts";
import {
	type Exam,
	exams,
	type ExamMetric,
	examMetrics,
	metricAliases,
} from "../db/schema.ts";
import type { Env } from "../env.ts";
import { chunkForBindVars } from "./chunk.ts";
import { newId } from "./ids.ts";
import { PET_SELF_ID } from "./pet-self.ts";

// Number of columns in `exam_metrics` that we provide values for on insert
// (id, examId, canonicalKey, displayName, valueNum, valueText, unit, refLow,
// refHigh, refText, status, pendingReview = 12). D1 caps bind variables at
// 100 per statement, so a 30-metric insert builds 360 binds and is rejected
// with "too many SQL variables". We chunk inserts so each statement stays
// under that ceiling. See api/storage/exams.test.ts for the regression test.
export const EXAM_METRIC_COLUMNS_PER_ROW = 12;

export interface ExamMetricInput {
	canonicalKey: string | null;
	displayName: string;
	valueNum?: number | null;
	valueText?: string | null;
	unit?: string | null;
	refLow?: number | null;
	refHigh?: number | null;
	refText?: string | null;
	status?: "normal" | "low" | "high" | "abnormal" | "unknown";
	pendingReview?: boolean;
}

export interface CreateExamDraftInput {
	fileId?: string | null;
	performedAt?: string | null;
	labName?: string | null;
	requestId?: string | null;
	metrics: ExamMetricInput[];
	rawAiText?: string | null;
	sourceNotes?: string | null;
	status?: "draft" | "confirmed";
}

export interface ExamWithMetrics {
	exam: Exam;
	metrics: ExamMetric[];
}

export async function createExamDraft(
	env: Env,
	input: CreateExamDraftInput,
): Promise<ExamWithMetrics> {
	const examId = newId("exam");
	const [examRow] = await db(env)
		.insert(exams)
		.values({
			id: examId,
			petId: PET_SELF_ID,
			fileId: input.fileId ?? null,
			status: input.status ?? "draft",
			performedAt: input.performedAt ?? null,
			labName: input.labName ?? null,
			requestId: input.requestId ?? null,
			rawAiText: input.rawAiText ?? null,
			sourceNotes: input.sourceNotes ?? null,
		})
		.returning();
	const metrics = await replaceMetrics(env, examId, input.metrics);
	return { exam: examRow, metrics };
}

export async function getExam(env: Env, id: string): Promise<Exam | null> {
	const rows = await db(env).select().from(exams).where(eq(exams.id, id));
	return rows[0] ?? null;
}

export async function getExamWithMetrics(
	env: Env,
	id: string,
): Promise<ExamWithMetrics | null> {
	const exam = await getExam(env, id);
	if (!exam) return null;
	const m = await db(env)
		.select()
		.from(examMetrics)
		.where(eq(examMetrics.examId, id))
		.orderBy(asc(examMetrics.createdAt));
	return { exam, metrics: m };
}

export async function listExamsForPet(env: Env): Promise<Exam[]> {
	return db(env)
		.select()
		.from(exams)
		.where(eq(exams.petId, PET_SELF_ID))
		.orderBy(desc(exams.performedAt), desc(exams.createdAt));
}

export interface UpdateExamInput {
	id: string;
	performedAt?: string | null;
	labName?: string | null;
	requestId?: string | null;
	sourceNotes?: string | null;
	status?: "draft" | "confirmed";
	metrics?: ExamMetricInput[];
}

export async function updateExam(
	env: Env,
	input: UpdateExamInput,
): Promise<ExamWithMetrics | null> {
	const patch: Partial<typeof exams.$inferInsert> = {};
	if (input.performedAt !== undefined) patch.performedAt = input.performedAt;
	if (input.labName !== undefined) patch.labName = input.labName;
	if (input.requestId !== undefined) patch.requestId = input.requestId;
	if (input.sourceNotes !== undefined) patch.sourceNotes = input.sourceNotes;
	if (input.status !== undefined) patch.status = input.status;

	if (Object.keys(patch).length > 0) {
		await db(env).update(exams).set(patch).where(eq(exams.id, input.id));
	}

	if (input.metrics) {
		await replaceMetrics(env, input.id, input.metrics);
	}

	// Confirming an exam flushes any pendingReview metrics into the
	// metric_aliases audit log so we can grow the curated taxonomy later.
	if (input.status === "confirmed") {
		await recordPendingAliases(env, input.id);
	}

	return getExamWithMetrics(env, input.id);
}

// Exported for tests so we can assert the per-statement bind-variable count
// stays under D1's 100-variable cap regardless of how many metrics an exam
// carries.
export function buildExamMetricInsertRows(
	examId: string,
	rows: ExamMetricInput[],
): (typeof examMetrics.$inferInsert)[] {
	return rows.map((m) => ({
		id: newId("em"),
		examId,
		canonicalKey: m.canonicalKey,
		displayName: m.displayName,
		valueNum: m.valueNum ?? null,
		valueText: m.valueText ?? null,
		unit: m.unit ?? null,
		refLow: m.refLow ?? null,
		refHigh: m.refHigh ?? null,
		refText: m.refText ?? null,
		status: m.status ?? ("unknown" as const),
		pendingReview: m.pendingReview ?? false,
	}));
}

async function replaceMetrics(
	env: Env,
	examId: string,
	rows: ExamMetricInput[],
): Promise<ExamMetric[]> {
	await db(env).delete(examMetrics).where(eq(examMetrics.examId, examId));
	if (rows.length === 0) return [];
	const values = buildExamMetricInsertRows(examId, rows);
	// D1 caps a single statement at 100 bind variables; a 30-metric insert
	// blew past that at 360 ("too many SQL variables at offset 842"). Chunk
	// the rows so each insert stays inside the budget.
	const chunks = chunkForBindVars(values, EXAM_METRIC_COLUMNS_PER_ROW);
	const inserted: ExamMetric[] = [];
	for (const chunk of chunks) {
		const out = await db(env).insert(examMetrics).values(chunk).returning();
		inserted.push(...out);
	}
	return inserted;
}

async function recordPendingAliases(env: Env, examId: string): Promise<void> {
	const pending = await db(env)
		.select()
		.from(examMetrics)
		.where(
			and(eq(examMetrics.examId, examId), eq(examMetrics.pendingReview, true)),
		);
	if (pending.length === 0) return;
	const existingRows = await db(env)
		.select({ key: metricAliases.proposedKey })
		.from(metricAliases)
		.where(
			inArray(
				metricAliases.proposedKey,
				pending
					.map((m) => m.canonicalKey)
					.filter((k): k is string => Boolean(k)),
			),
		);
	const existing = new Set(existingRows.map((r) => r.key));
	const toInsert = pending
		.filter((m) => m.canonicalKey && !existing.has(m.canonicalKey))
		.map((m) => ({
			id: newId("alias"),
			proposedKey: m.canonicalKey as string,
			displayName: m.displayName,
			unitSeen: m.unit,
			examId,
			approved: false,
			mappedToKey: null,
		}));
	if (toInsert.length === 0) return;
	await db(env).insert(metricAliases).values(toInsert);
}

export async function deleteExam(
	env: Env,
	id: string,
): Promise<{ deleted: boolean }> {
	const deleted = await db(env)
		.delete(exams)
		.where(eq(exams.id, id))
		.returning({ id: exams.id });
	return { deleted: deleted.length > 0 };
}

// Series rows for the chart pages — one row per (canonicalKey, exam),
// pre-joined with the exam's performedAt so the frontend can sort and group
// without another lookup. Only confirmed exams are returned for charting.
export interface MetricSeriesRow {
	canonicalKey: string;
	performedAt: string;
	valueNum: number | null;
	valueText: string | null;
	unit: string | null;
	refLow: number | null;
	refHigh: number | null;
	refText: string | null;
	status: ExamMetric["status"];
	examId: string;
	displayName: string;
}

export async function getMetricSeriesForPet(
	env: Env,
	canonicalKeys?: string[],
): Promise<MetricSeriesRow[]> {
	const baseWhere = and(
		eq(exams.petId, PET_SELF_ID),
		eq(exams.status, "confirmed"),
	);
	const where =
		canonicalKeys && canonicalKeys.length > 0
			? and(baseWhere, inArray(examMetrics.canonicalKey, canonicalKeys))
			: baseWhere;

	const rows = await db(env)
		.select({
			canonicalKey: examMetrics.canonicalKey,
			performedAt: exams.performedAt,
			valueNum: examMetrics.valueNum,
			valueText: examMetrics.valueText,
			unit: examMetrics.unit,
			refLow: examMetrics.refLow,
			refHigh: examMetrics.refHigh,
			refText: examMetrics.refText,
			status: examMetrics.status,
			examId: exams.id,
			createdAt: exams.createdAt,
			displayName: examMetrics.displayName,
		})
		.from(examMetrics)
		.innerJoin(exams, eq(examMetrics.examId, exams.id))
		.where(where)
		.orderBy(asc(exams.performedAt), asc(exams.createdAt));

	// Fall back to the exam's createdAt when performedAt wasn't extracted —
	// otherwise the chart loses points.
	return rows
		.filter((r) => r.canonicalKey != null)
		.map((r) => ({
			canonicalKey: r.canonicalKey as string,
			performedAt: r.performedAt ?? r.createdAt,
			valueNum: r.valueNum,
			valueText: r.valueText,
			unit: r.unit,
			refLow: r.refLow,
			refHigh: r.refHigh,
			refText: r.refText,
			status: r.status,
			examId: r.examId,
			displayName: r.displayName,
		}));
}
